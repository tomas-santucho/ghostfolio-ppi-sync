import { transactionId } from './mapping/fingerprint.js';
import { normalizedToGhostfolio } from './mapping/normalized-to-ghostfolio.js';
import { ppiToNormalized } from './mapping/ppi-to-normalized.js';
import { resolveSymbolOverride, type SymbolOverride } from './mapping/symbol-overrides.js';
import type { GhostfolioClient, GhostfolioImportActivity } from './ghostfolio/types.js';
import type { PpiClient } from './ppi/types.js';
import { normalizeCurrency } from './mapping/currency.js';
import { isUnreferencedCommission } from './mapping/cash-movements.js';
import { resolveCashAsset } from './mapping/cash-assets.js';
import type { CashAssetMap } from './mapping/cash-assets.js';
import { enrichTransactionsWithOrderIds } from './ppi/order-matching.js';

export interface SyncSummary { fetched:number; imported:number; duplicates:number; unsupported:number; }
const ghostfolioActivityTypes=new Set(['BUY','SELL','DIVIDEND','INTEREST','FEE','DEPOSIT','WITHDRAWAL']);
function unsupportedReason(transaction:Awaited<ReturnType<PpiClient['getTransactions']>>[number]):string{if(/RENTA|CUP[ÓO]N|INTER[EÉ]S/i.test(transaction.description))return `Unsupported PPI interest/coupon: ${transaction.description} (requires a supported currency, positive amount and resolvable instrument symbol)`;return `Unsupported PPI transaction: ${transaction.description} (currency=${transaction.currency}, ticker=${transaction.ticker??'none'})`;}
function uniqueInstrument(ticker:string,currency:string|undefined,instruments:Awaited<ReturnType<NonNullable<PpiClient['searchInstrument']>>>):Awaited<ReturnType<NonNullable<PpiClient['searchInstrument']>>>[number]|undefined{const key=ticker.trim().toUpperCase();const exact=instruments.filter(item=>item.ticker.trim().toUpperCase()===key);const normalizedCurrency=currency?normalizeCurrency(currency):undefined;const currencyMatches=normalizedCurrency?instruments.filter(item=>normalizeCurrency(item.currency)===normalizedCurrency):[];const preferred=exact.filter(item=>!normalizedCurrency||normalizeCurrency(item.currency)===normalizedCurrency);if(preferred.length===1)return preferred[0];const bondMatches=currencyMatches.filter(item=>item.market==='BYMA'&&item.type==='BONOS');if(bondMatches.length>1&&currency){const upper=currency.toUpperCase();const suffix=upper.includes('CABLE')||upper.includes('CCL')||upper.includes('DIVISA')?'C':upper.includes('MEP')||upper.includes('BILLETE')?'D':undefined;const species=suffix?bondMatches.filter(item=>item.ticker.trim().toUpperCase()===`${key}${suffix}`):[];if(species.length===1)return species[0];}if(currencyMatches.length===1)return currencyMatches[0];return undefined;}

export async function runSync(ppi:Pick<PpiClient,'getTransactions'|'getOrders'|'searchInstrument'>,ghostfolio:GhostfolioClient,options:{ppiAccountId:string;ghostfolioAccountId:string;from?:Date;to?:Date;dryRun:boolean;enrichOrders?:boolean;symbolOverrides?:SymbolOverride[];cashAssets?:CashAssetMap;warn?:(message:string)=>void}):Promise<SyncSummary> {
  let transactions=await ppi.getTransactions({accountId:options.ppiAccountId,from:options.from,to:options.to});
  if (options.enrichOrders && ppi.getOrders) transactions=enrichTransactionsWithOrderIds(transactions,await ppi.getOrders({accountId:options.ppiAccountId,from:options.from,to:options.to}));
  const existing=await ghostfolio.getActivities();
  const existingIds=new Set(existing.map(activity=>typeof activity.comment==='string'?activity.comment.replace(/^ppi-sync:/,''):''));
  const candidates:GhostfolioImportActivity[]=[]; const consumedLegacyIds=new Set<string>(); let duplicates=0; let unsupported=0;
  for(const transaction of transactions) {
    if (isUnreferencedCommission(transaction)) {
      unsupported++;
      options.warn?.('Unmatched PPI commission: no stable trade reference; omitted to avoid arbitrary association.');
      continue;
    }
    let instrument=transaction.ticker&&transaction.ticker!=='Ticker not found'&&ppi.searchInstrument?uniqueInstrument(transaction.ticker,transaction.currency,await ppi.searchInstrument(transaction.ticker)):undefined;
    let base=ppiToNormalized(transaction,options.ppiAccountId,instrument);
    if(base?.symbol&&!instrument&&ppi.searchInstrument){instrument=uniqueInstrument(base.symbol,transaction.currency,await ppi.searchInstrument(base.symbol));if(instrument)base=ppiToNormalized(transaction,options.ppiAccountId,instrument);}
    if(!base){unsupported++;options.warn?.(unsupportedReason(transaction));continue;}
    if(base.type==='DEPOSIT'||base.type==='WITHDRAWAL') {
      const cashAsset=resolveCashAsset(transaction.currency,options.cashAssets??{});
      if(!cashAsset){unsupported++;options.warn?.(`PPI ${base.type.toLowerCase()} requires a configured manual cash asset for currency: ${transaction.currency}`);continue;}
      base={...base,symbol:cashAsset.symbol,currency:cashAsset.currency,dataSource:'MANUAL',market:'PPI_CASH'};
    }
    if((!transaction.ticker||transaction.ticker==='Ticker not found')&&!instrument&&base.market==='BYMA'){unsupported++;options.warn?.(`Inferred BYMA symbol requires an explicit Ghostfolio symbol override: ${base.symbol??'unknown'}`);continue;}
    const override=resolveSymbolOverride(transaction.ticker,options.symbolOverrides??[])??resolveSymbolOverride(base.symbol,options.symbolOverrides??[]);
    if((base.type==='BUY'||base.type==='SELL'||base.type==='INTEREST')&&!instrument&&!override){
      unsupported++;options.warn?.(`PPI ${base.type.toLowerCase()} ${base.symbol??'unknown'} requires an instrument resolution or explicit Ghostfolio symbol override`);continue;
    }
    if(instrument?.market==='BYMA'&&instrument.type==='BONOS'&&!override){
      unsupported++;options.warn?.(`PPI bond ${instrument.ticker} requires an explicit manual symbol override`);continue;
    }
    if(!ghostfolioActivityTypes.has(base.type)){unsupported++;options.warn?.(`PPI transaction type ${base.type} has no supported Ghostfolio import representation: ${transaction.description}`);continue;}
    const normalized=override?{...base,symbol:override.mappedSymbol.toUpperCase(),isin:override.isin??base.isin,market:override.market??base.market,dataSource:override.dataSource??base.dataSource}:base;
    const id=transactionId(normalized);
    const legacyIds=[normalized.externalId?transactionId({...normalized,externalId:undefined}):undefined,normalized.sourceBalance!==undefined?transactionId({...normalized,sourceBalance:undefined}):undefined].filter((value):value is string=>Boolean(value));
    const legacyId=legacyIds.find(value=>existingIds.has(value)&&!consumedLegacyIds.has(value));
    if(existingIds.has(id)||legacyId){if(legacyId)consumedLegacyIds.add(legacyId);duplicates++;continue;}
    existingIds.add(id); candidates.push(normalizedToGhostfolio({...normalized,id},options.ghostfolioAccountId));
  }
  if(candidates.length>0)await ghostfolio.importActivities(candidates,{dryRun:options.dryRun});
  return {fetched:transactions.length,imported:candidates.length,duplicates,unsupported};
}

export async function runSyncForAccounts(ppi:Pick<PpiClient,'getTransactions'|'searchInstrument'>,ghostfolio:Pick<GhostfolioClient,'getActivities'|'importActivities'>,accountIds:string[],accountMap:Record<string,string>,options:Omit<Parameters<typeof runSync>[2],'ppiAccountId'|'ghostfolioAccountId'>):Promise<SyncSummary>{const total:SyncSummary={fetched:0,imported:0,duplicates:0,unsupported:0};for(const ppiAccountId of accountIds){const ghostfolioAccountId=accountMap[ppiAccountId];if(!ghostfolioAccountId)throw new Error(`No Ghostfolio account mapping for PPI account ${ppiAccountId}`);const summary=await runSync(ppi,ghostfolio,{...options,ppiAccountId,ghostfolioAccountId});total.fetched+=summary.fetched;total.imported+=summary.imported;total.duplicates+=summary.duplicates;total.unsupported+=summary.unsupported;}return total;}
