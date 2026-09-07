import { GhostfolioImportError, GhostfolioUnknownImportOutcomeError, HttpRequestError, PpiRateLimitError } from './errors.js';
import { sourceMovementFingerprint, transactionId } from './mapping/fingerprint.js';
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

export interface SyncSummary { fetched:number;mapped:number;imported:number;duplicates:number;unsupported:number;validationFailed:number;httpFailed:number;unattempted:number;uncertain:number;skippedFingerprints:string[];failedFingerprints:string[]; }
export class SyncRunError extends Error { constructor(message:string,readonly summary:SyncSummary,options?:ErrorOptions){super(message,options);this.name='SyncRunError';} }

const ghostfolioActivityTypes=new Set(['BUY','SELL','DIVIDEND','INTEREST','FEE','DEPOSIT','WITHDRAWAL']);
const summaryCountFields=['fetched','mapped','imported','duplicates','unsupported','validationFailed','httpFailed','unattempted','uncertain'] as const;
const emptySummary=():SyncSummary=>({fetched:0,mapped:0,imported:0,duplicates:0,unsupported:0,validationFailed:0,httpFailed:0,unattempted:0,uncertain:0,skippedFingerprints:[],failedFingerprints:[]});
const activityFingerprint=(activity:{comment?:string}):string=>activity.comment?.split(':').at(-1)??'unknown';

function addSummary(total:SyncSummary,summary:SyncSummary):void{for(const key of summaryCountFields)total[key]+=summary[key];total.skippedFingerprints.push(...summary.skippedFingerprints);total.failedFingerprints.push(...summary.failedFingerprints);}
function unsupportedReason(transaction:Awaited<ReturnType<PpiClient['getTransactions']>>[number]):string{if(/RENTA|CUP[ÓO]N|INTER[EÉ]S/i.test(transaction.description))return 'interest/coupon requires a supported currency, positive amount and resolvable instrument symbol';return `no supported mapping for currency=${transaction.currency} ticker=${transaction.ticker??'none'}`;}
function uniqueInstrument(ticker:string,currency:string|undefined,instruments:Awaited<ReturnType<NonNullable<PpiClient['searchInstrument']>>>):Awaited<ReturnType<NonNullable<PpiClient['searchInstrument']>>>[number]|undefined{const key=ticker.trim().toUpperCase();const exact=instruments.filter(item=>item.ticker.trim().toUpperCase()===key);const normalizedCurrency=currency?normalizeCurrency(currency):undefined;const currencyMatches=normalizedCurrency?instruments.filter(item=>normalizeCurrency(item.currency)===normalizedCurrency):[];const preferred=exact.filter(item=>!normalizedCurrency||normalizeCurrency(item.currency)===normalizedCurrency);if(preferred.length===1)return preferred[0];const bondMatches=currencyMatches.filter(item=>item.market==='BYMA'&&item.type==='BONOS');if(bondMatches.length>1&&currency){const upper=currency.toUpperCase();const suffix=upper.includes('CABLE')||upper.includes('CCL')||upper.includes('DIVISA')?'C':upper.includes('MEP')||upper.includes('BILLETE')?'D':undefined;const species=suffix?bondMatches.filter(item=>item.ticker.trim().toUpperCase()===`${key}${suffix}`):[];if(species.length===1)return species[0];}if(currencyMatches.length===1)return currencyMatches[0];return undefined;}
function skip(summary:SyncSummary,transaction:Awaited<ReturnType<PpiClient['getTransactions']>>[number],type:string,reason:string,warn:(message:string)=>void){const fingerprint=sourceMovementFingerprint(transaction);summary.unsupported++;summary.skippedFingerprints.push(fingerprint);warn(`PPI movement type=${type} fingerprint=${fingerprint}: skipped; ${reason}`);}

export async function runSync(ppi:Pick<PpiClient,'getTransactions'|'getOrders'|'searchInstrument'>,ghostfolio:GhostfolioClient,options:{ppiAccountId:string;ghostfolioAccountId:string;from?:Date;to?:Date;dryRun:boolean;enrichOrders?:boolean;symbolOverrides?:SymbolOverride[];cashAssets?:CashAssetMap;warn?:(message:string)=>void}):Promise<SyncSummary>{
  const summary=emptySummary();
  const warn=options.warn??(()=>undefined);
  let transactions:Awaited<ReturnType<PpiClient['getTransactions']>>;
  try{
    transactions=await ppi.getTransactions({accountId:options.ppiAccountId,from:options.from,to:options.to});
    if(options.enrichOrders&&ppi.getOrders)transactions=enrichTransactionsWithOrderIds(transactions,await ppi.getOrders({accountId:options.ppiAccountId,from:options.from,to:options.to}));
  }catch(error){summary.httpFailed++;throw new SyncRunError(error instanceof PpiRateLimitError?error.message:'PPI history could not be read',summary,{cause:error});}
  summary.fetched=transactions.length;
  let existing:Awaited<ReturnType<GhostfolioClient['getActivities']>>;
  try{existing=await ghostfolio.getActivities();}catch(error){summary.httpFailed++;throw new SyncRunError('Ghostfolio activities could not be read',summary,{cause:error});}
  const existingIds=new Set(existing.map(activity=>typeof activity.comment==='string'?activity.comment.replace(/^ppi-sync:/,''):''));
  const candidates:GhostfolioImportActivity[]=[];
  const consumedLegacyIds=new Set<string>();
  for(const transaction of transactions){
    const sourceFingerprint=sourceMovementFingerprint(transaction);
    try{
      if(isUnreferencedCommission(transaction)){skip(summary,transaction,'FEE','no stable trade reference',warn);continue;}
      let instrument=transaction.ticker&&transaction.ticker!=='Ticker not found'&&ppi.searchInstrument?uniqueInstrument(transaction.ticker,transaction.currency,await ppi.searchInstrument(transaction.ticker)):undefined;
      let base=ppiToNormalized(transaction,options.ppiAccountId,instrument);
      if(base?.symbol&&!instrument&&ppi.searchInstrument){instrument=uniqueInstrument(base.symbol,transaction.currency,await ppi.searchInstrument(base.symbol));if(instrument)base=ppiToNormalized(transaction,options.ppiAccountId,instrument);}
      if(!base){skip(summary,transaction,'UNSUPPORTED',unsupportedReason(transaction),warn);continue;}
      if(base.type==='DEPOSIT'||base.type==='WITHDRAWAL'){
        const cashAsset=resolveCashAsset(transaction.currency,options.cashAssets??{});
        if(!cashAsset){skip(summary,transaction,base.type,`manual cash asset is not configured for currency=${transaction.currency}`,warn);continue;}
        base={...base,symbol:cashAsset.symbol,currency:cashAsset.currency,dataSource:'MANUAL',market:'PPI_CASH'};
      }
      if((!transaction.ticker||transaction.ticker==='Ticker not found')&&!instrument&&base.market==='BYMA'){skip(summary,transaction,base.type,`inferred BYMA symbol ${base.symbol??'unknown'} requires an explicit override`,warn);continue;}
      const override=resolveSymbolOverride(transaction.ticker,options.symbolOverrides??[])??resolveSymbolOverride(base.symbol,options.symbolOverrides??[]);
      if((base.type==='BUY'||base.type==='SELL'||base.type==='INTEREST')&&!instrument&&!override){skip(summary,transaction,base.type,`${base.symbol??'unknown'} requires an instrument resolution or explicit override`,warn);continue;}
      if(instrument?.market==='BYMA'&&instrument.type==='BONOS'&&!override){skip(summary,transaction,base.type,`bond ${instrument.ticker} requires an explicit manual override`,warn);continue;}
      if(!ghostfolioActivityTypes.has(base.type)){skip(summary,transaction,base.type,'no Ghostfolio import representation',warn);continue;}
      const normalized=override?{...base,symbol:override.mappedSymbol.toUpperCase(),isin:override.isin??base.isin,market:override.market??base.market,dataSource:override.dataSource??base.dataSource}:base;
      summary.mapped++;
      const id=transactionId(normalized);
      const legacyIds=[normalized.externalId?transactionId({...normalized,externalId:undefined}):undefined,normalized.sourceBalance!==undefined?transactionId({...normalized,sourceBalance:undefined}):undefined].filter((value):value is string=>Boolean(value));
      const legacyId=legacyIds.find(value=>existingIds.has(value)&&!consumedLegacyIds.has(value));
      if(existingIds.has(id)||legacyId){if(legacyId)consumedLegacyIds.add(legacyId);summary.duplicates++;continue;}
      existingIds.add(id);
      candidates.push(normalizedToGhostfolio({...normalized,id},options.ghostfolioAccountId));
    }catch(error){
      if(error instanceof HttpRequestError||error instanceof PpiRateLimitError){summary.httpFailed++;summary.failedFingerprints.push(sourceFingerprint);throw new SyncRunError(error instanceof PpiRateLimitError?error.message:'PPI enrichment failed',summary,{cause:error});}
      summary.validationFailed++;
      summary.failedFingerprints.push(sourceFingerprint);
      warn(`PPI movement type=VALIDATION fingerprint=${sourceFingerprint}: validation failed; ${error instanceof Error?error.message:'unknown error'}`);
    }
  }
  if(candidates.length===0){if(summary.validationFailed>0)throw new SyncRunError('Mapped activities failed local validation',summary);return summary;}
  try{
    const result=await ghostfolio.importActivities(candidates,{dryRun:options.dryRun});
    const failed=result.validationFailures??[];
    summary.imported=Math.max(0,result.imported-failed.length);
    summary.validationFailed+=failed.length;
    summary.failedFingerprints.push(...failed.map(activityFingerprint));
  }catch(error){
    if(error instanceof SyncRunError)throw error;
    if(error instanceof GhostfolioImportError){
      summary.imported=error.details.completed;
      summary.httpFailed+=error.details.failed;
      summary.unattempted+=Math.max(0,candidates.length-error.details.completed-error.details.failed);
      if(error.details.cause instanceof GhostfolioUnknownImportOutcomeError)summary.uncertain+=error.details.failed;
      summary.failedFingerprints.push(...candidates.slice(error.details.from-1,error.details.to).map(activityFingerprint));
      throw new SyncRunError(error.message,summary,{cause:error});
    }
    summary.httpFailed+=candidates.length;
    summary.uncertain+=candidates.length;
    summary.failedFingerprints.push(...candidates.map(activityFingerprint));
    throw new SyncRunError('Ghostfolio import failed',summary,{cause:error});
  }
  if(summary.validationFailed>0)throw new SyncRunError('Mapped activities failed validation',summary);
  return summary;
}

export async function runSyncForAccounts(ppi:Pick<PpiClient,'getTransactions'|'getOrders'|'searchInstrument'>,ghostfolio:Pick<GhostfolioClient,'getActivities'|'importActivities'>,accountIds:string[],accountMap:Record<string,string>,options:Omit<Parameters<typeof runSync>[2],'ppiAccountId'|'ghostfolioAccountId'>):Promise<SyncSummary>{
  const total=emptySummary();
  for(const ppiAccountId of accountIds){
    const ghostfolioAccountId=accountMap[ppiAccountId];
    if(!ghostfolioAccountId)throw new Error(`No Ghostfolio account mapping for PPI account ${ppiAccountId}`);
    try{addSummary(total,await runSync(ppi,ghostfolio,{...options,ppiAccountId,ghostfolioAccountId}));}
    catch(error){if(error instanceof SyncRunError){addSummary(total,error.summary);throw new SyncRunError(error.message,total,{cause:error});}throw error;}
  }
  return total;
}
