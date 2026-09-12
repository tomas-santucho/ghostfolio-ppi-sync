import { GhostfolioImportError, GhostfolioUnknownImportOutcomeError, HttpRequestError, PpiRateLimitError } from './errors.js';
import { compatibleTransactionIds, sourceMovementFingerprint, transactionId } from './mapping/fingerprint.js';
import { normalizedToGhostfolio } from './mapping/normalized-to-ghostfolio.js';
import { ppiToNormalized, unsupportedMovementCategory } from './mapping/ppi-to-normalized.js';
import { resolveSymbolOverride, type SymbolOverride } from './mapping/symbol-overrides.js';
import type { GhostfolioClient, GhostfolioImportActivity } from './ghostfolio/types.js';
import type { PpiClient } from './ppi/types.js';
import { normalizeCurrency } from './mapping/currency.js';
import { isUnreferencedCommission } from './mapping/cash-movements.js';
import { resolveCashAsset } from './mapping/cash-assets.js';
import type { CashAssetMap } from './mapping/cash-assets.js';
import { addMissingCompletedOrders, enrichTransactionsWithOrderIds } from './ppi/order-matching.js';
import { deriveTradeCashSettlement } from './mapping/trade-settlements.js';
import type { NormalizedTransaction } from './types.js';

export interface SyncSummary { fetched:number;mapped:number;imported:number;duplicates:number;unsupported:number;cashSettlementSkipped:number;validationFailed:number;httpFailed:number;unattempted:number;uncertain:number;skippedFingerprints:string[];failedFingerprints:string[]; }
export class SyncRunError extends Error { constructor(message:string,readonly summary:SyncSummary,options?:ErrorOptions){super(message,options);this.name='SyncRunError';} }

const ghostfolioActivityTypes=new Set(['BUY','SELL','DIVIDEND','INTEREST','FEE','DEPOSIT','WITHDRAWAL']);
const summaryCountFields=['fetched','mapped','imported','duplicates','unsupported','cashSettlementSkipped','validationFailed','httpFailed','unattempted','uncertain'] as const;
const emptySummary=():SyncSummary=>({fetched:0,mapped:0,imported:0,duplicates:0,unsupported:0,cashSettlementSkipped:0,validationFailed:0,httpFailed:0,unattempted:0,uncertain:0,skippedFingerprints:[],failedFingerprints:[]});
const activityFingerprint=(activity:{comment?:string}):string=>activity.comment?.split(':').at(-1)??'unknown';

function addSummary(total:SyncSummary,summary:SyncSummary):void{for(const key of summaryCountFields)total[key]+=summary[key];total.skippedFingerprints.push(...summary.skippedFingerprints);total.failedFingerprints.push(...summary.failedFingerprints);}
function unsupportedReason(transaction:Awaited<ReturnType<PpiClient['getTransactions']>>[number]):string{const category=unsupportedMovementCategory(transaction.description,transaction.ticker);if(category)return `unsupported ${category}; no synthetic Ghostfolio activity was created`;if(/RENTA|CUP[ÓO]N|INTER[EÉ]S/i.test(transaction.description))return 'interest/coupon requires a supported currency, positive amount and resolvable instrument symbol';return `no supported mapping for currency=${transaction.currency} ticker=${transaction.ticker??'none'}`;}
function uniqueInstrument(ticker:string,currency:string|undefined,instruments:Awaited<ReturnType<NonNullable<PpiClient['searchInstrument']>>>):Awaited<ReturnType<NonNullable<PpiClient['searchInstrument']>>>[number]|undefined{const key=ticker.trim().toUpperCase();const exact=instruments.filter(item=>item.ticker.trim().toUpperCase()===key);const normalizedCurrency=currency?normalizeCurrency(currency):undefined;const currencyMatches=normalizedCurrency?instruments.filter(item=>normalizeCurrency(item.currency)===normalizedCurrency):[];const preferred=exact.filter(item=>!normalizedCurrency||normalizeCurrency(item.currency)===normalizedCurrency);if(preferred.length===1)return preferred[0];const bondMatches=currencyMatches.filter(item=>item.market==='BYMA'&&item.type==='BONOS');if(bondMatches.length>1&&currency){const upper=currency.toUpperCase();const suffix=upper.includes('CABLE')||upper.includes('CCL')||upper.includes('DIVISA')?'C':upper.includes('MEP')||upper.includes('BILLETE')?'D':undefined;const species=suffix?bondMatches.filter(item=>item.ticker.trim().toUpperCase()===`${key}${suffix}`):[];if(species.length===1)return species[0];}if(currencyMatches.length===1)return currencyMatches[0];return undefined;}
function skip(summary:SyncSummary,transaction:Awaited<ReturnType<PpiClient['getTransactions']>>[number],type:string,reason:string,warn:(message:string)=>void){const fingerprint=sourceMovementFingerprint(transaction);summary.unsupported++;summary.skippedFingerprints.push(fingerprint);warn(`PPI movement type=${type} fingerprint=${fingerprint}: skipped; ${reason}`);}
const quantityScale=10n**18n;
function quantityUnits(value:string|number|undefined):bigint|undefined{const text=String(value??'');if(!/^\d+(?:\.\d+)?$/.test(text))return undefined;const [whole,fraction='']=text.split('.');if(fraction.length>18)return undefined;return BigInt(whole)*quantityScale+BigInt(`${fraction}${'0'.repeat(18)}`.slice(0,18));}
function holdingKey(accountId:string,symbol:string){return `${accountId}:${symbol}`;}

export async function runSync(ppi:Pick<PpiClient,'getTransactions'|'getOrders'|'searchInstrument'>,ghostfolio:GhostfolioClient,options:{ppiAccountId:string;ghostfolioAccountId?:string;ghostfolioAccountIdsByCurrency?:{ARS:string;USD:string};ghostfolioAccountIdsByPpiAccount?:Record<string,{ARS:string;USD:string}>;from?:Date;to?:Date;dryRun:boolean;enrichOrders?:boolean;orderFallback?:boolean;symbolOverrides?:SymbolOverride[];cashAssets?:CashAssetMap;cashActivityImport?:boolean;warn?:(message:string)=>void}):Promise<SyncSummary>{
  const summary=emptySummary();
  const warn=options.warn??(()=>undefined);
  let transactions:Awaited<ReturnType<PpiClient['getTransactions']>>;
  try{
    transactions=await ppi.getTransactions({accountId:options.ppiAccountId,from:options.from,to:options.to});
    if((options.enrichOrders||options.orderFallback)&&ppi.getOrders){
      const orders=await ppi.getOrders({accountId:options.ppiAccountId,from:options.from,to:options.to});
      transactions=enrichTransactionsWithOrderIds(transactions,orders);
      if(options.orderFallback)transactions=addMissingCompletedOrders(transactions,orders);
    }
  }catch(error){summary.httpFailed++;throw new SyncRunError(error instanceof PpiRateLimitError?error.message:'PPI history could not be read',summary,{cause:error});}
  transactions.sort((left,right)=>new Date(left.agreementDate).getTime()-new Date(right.agreementDate).getTime());
  summary.fetched=transactions.length;
  let existing:Awaited<ReturnType<GhostfolioClient['getActivities']>>;
  try{existing=await ghostfolio.getActivities();}catch(error){summary.httpFailed++;throw new SyncRunError('Ghostfolio activities could not be read',summary,{cause:error});}
  const targetAccountId=(currency:string):string=>{if(options.ghostfolioAccountIdsByPpiAccount){const target=options.ghostfolioAccountIdsByPpiAccount[options.ppiAccountId]?.[currency as 'ARS'|'USD'];if(!target)throw new Error(`No Ghostfolio target configured for this source and normalized currency ${currency}`);return target;}if(options.ghostfolioAccountIdsByCurrency){const target=options.ghostfolioAccountIdsByCurrency[currency as 'ARS'|'USD'];if(!target)throw new Error(`No Ghostfolio target configured for normalized currency ${currency}`);return target;}if(!options.ghostfolioAccountId)throw new Error('Ghostfolio target account is not configured');return options.ghostfolioAccountId;};
  const existingIdsByAccount=new Map<string,Set<string>>();
  const holdingsByAccountAndSymbol=new Map<string,bigint>();
  for(const activity of existing){if(!activity.accountId)continue;const ids=existingIdsByAccount.get(activity.accountId)??new Set<string>();if(typeof activity.comment==='string')ids.add(activity.comment.replace(/^ppi-sync:/,''));existingIdsByAccount.set(activity.accountId,ids);}
  for(const activity of existing){if(!activity.accountId||!activity.symbol||(activity.type!=='BUY'&&activity.type!=='SELL'))continue;const quantity=quantityUnits(activity.quantity);if(quantity===undefined)continue;const key=holdingKey(activity.accountId,activity.symbol);holdingsByAccountAndSymbol.set(key,(holdingsByAccountAndSymbol.get(key)??0n)+(activity.type==='BUY'?quantity:-quantity));}
  const primaryCandidates:GhostfolioImportActivity[]=[];
  const pendingSettlements:{activity:NormalizedTransaction;dependsOn:string;queuedPrimary:boolean}[]=[];
  const consumedLegacyIdsByAccount=new Map<string,Set<string>>();
  const settlementWarnings=new Set<string>();
  const enqueue=(candidate:NormalizedTransaction,sourceFingerprint:string,legacyBase?:NormalizedTransaction,target:GhostfolioImportActivity[]=primaryCandidates,countMapped=true):{id:string;queued:boolean}=>{
    if(countMapped)summary.mapped++;
    const targetAccountIdForCandidate=targetAccountId(candidate.currency);
    const existingIds=existingIdsByAccount.get(targetAccountIdForCandidate)??new Set<string>();
    existingIdsByAccount.set(targetAccountIdForCandidate,existingIds);
    const consumedLegacyIds=consumedLegacyIdsByAccount.get(targetAccountIdForCandidate)??new Set<string>();
    consumedLegacyIdsByAccount.set(targetAccountIdForCandidate,consumedLegacyIds);
    const id=transactionId(candidate);
    if(existingIds.has(id)){summary.duplicates++;return {id,queued:false};}
    const compatibleIds=new Set([...compatibleTransactionIds(candidate),...(legacyBase?[...compatibleTransactionIds(legacyBase)]:[])]);
    compatibleIds.delete(id);
    const matchingIds=[...compatibleIds].filter(value=>existingIds.has(value));
    if(matchingIds.length>1)throw new Error(`Ambiguous legacy identity for source movement ${sourceFingerprint}`);
    const legacyId=matchingIds[0];
    if(legacyId){if(consumedLegacyIds.has(legacyId))throw new Error(`Ambiguous legacy identity for source movement ${sourceFingerprint}`);consumedLegacyIds.add(legacyId);summary.duplicates++;return {id,queued:false};}
    existingIds.add(id);
    target.push(normalizedToGhostfolio({...candidate,id},targetAccountIdForCandidate));
    return {id,queued:true};
  };
  for(const transaction of transactions){
    const sourceFingerprint=sourceMovementFingerprint(transaction);
    try{
      if(isUnreferencedCommission(transaction)){skip(summary,transaction,'FEE','no stable trade reference',warn);continue;}
      let instrument=transaction.ticker&&transaction.ticker!=='Ticker not found'&&ppi.searchInstrument?uniqueInstrument(transaction.ticker,transaction.currency,await ppi.searchInstrument(transaction.ticker)):undefined;
      let base=ppiToNormalized(transaction,options.ppiAccountId,instrument);
      if(base?.symbol&&!instrument&&ppi.searchInstrument){instrument=uniqueInstrument(base.symbol,transaction.currency,await ppi.searchInstrument(base.symbol));if(instrument)base=ppiToNormalized(transaction,options.ppiAccountId,instrument);}
      if(!base){skip(summary,transaction,'UNSUPPORTED',unsupportedReason(transaction),warn);continue;}
      if(base.type==='DEPOSIT'||base.type==='WITHDRAWAL'){
        if(!options.cashActivityImport){skip(summary,transaction,base.type,'cash activity import is disabled pending a verified cash reconciliation',warn);continue;}
        const cashAsset=resolveCashAsset(transaction.currency,options.cashAssets??{});
        if(!cashAsset){skip(summary,transaction,base.type,`manual cash asset is not configured for currency=${transaction.currency}`,warn);continue;}
        base={...base,symbol:cashAsset.symbol,currency:cashAsset.currency,dataSource:'MANUAL',market:'PPI_CASH'};
      }
      if((!transaction.ticker||transaction.ticker==='Ticker not found')&&!instrument&&base.market==='BYMA'){skip(summary,transaction,base.type,`inferred BYMA symbol ${base.symbol??'unknown'} requires an explicit override`,warn);continue;}
      const override=resolveSymbolOverride({symbol:base.sourceSymbol??transaction.ticker??base.symbol,accountId:options.ppiAccountId,currency:base.currency,isin:instrument?.isin??base.isin,market:instrument?.market??base.market},options.symbolOverrides??[]);
      if((base.type==='BUY'||base.type==='SELL'||base.type==='INTEREST')&&!instrument&&!override){skip(summary,transaction,base.type,`${base.symbol??'unknown'} requires an instrument resolution or explicit override`,warn);continue;}
      if(instrument?.market==='BYMA'&&instrument.type==='BONOS'&&!override){skip(summary,transaction,base.type,`bond ${instrument.ticker} requires an explicit manual override`,warn);continue;}
      if(!ghostfolioActivityTypes.has(base.type)){skip(summary,transaction,base.type,'no Ghostfolio import representation',warn);continue;}
      const overrideDataSource=override?.dataSource??base.dataSource;
      const normalized=override?{...base,symbol:overrideDataSource==='MANUAL'?override.mappedSymbol.trim():override.mappedSymbol.toUpperCase(),isin:override.isin??base.isin,market:override.market??base.market,dataSource:overrideDataSource}:base;
      if((normalized.type==='BUY'||normalized.type==='SELL')&&normalized.symbol){const target=targetAccountId(normalized.currency);const quantity=quantityUnits(normalized.quantity);if(quantity===undefined)throw new Error('Trade quantity is invalid');const key=holdingKey(target,normalized.symbol);const held=holdingsByAccountAndSymbol.get(key)??0n;if(!options.cashActivityImport&&normalized.type==='SELL'&&held<quantity){skip(summary,transaction,'SELL','would create a negative holding because the opening acquisition is absent from the PPI history',warn);continue;}holdingsByAccountAndSymbol.set(key,normalized.type==='BUY'?held+quantity:held-quantity);}
      const primary=enqueue(normalized,sourceFingerprint,base);
      if(options.cashActivityImport&&Object.keys(options.cashAssets??{}).length>0){
        const settlement=deriveTradeCashSettlement(transaction,normalized,options.cashAssets??{});
        if(settlement.reason){
          summary.cashSettlementSkipped++;
          const warningKey=`${normalized.type}:${transaction.currency}:${settlement.reason}`;
          if(!settlementWarnings.has(warningKey)){settlementWarnings.add(warningKey);warn(`PPI trade cash settlement skipped for currency=${transaction.currency}; ${settlement.reason}`);}
        }else if(settlement.settlement){
          summary.mapped++;
          pendingSettlements.push({activity:settlement.settlement,dependsOn:primary.id.split(':').at(-1)??primary.id,queuedPrimary:primary.queued});
        }
      }
    }catch(error){
      if(error instanceof HttpRequestError||error instanceof PpiRateLimitError){summary.httpFailed++;summary.failedFingerprints.push(sourceFingerprint);throw new SyncRunError(error instanceof PpiRateLimitError?error.message:'PPI enrichment failed',summary,{cause:error});}
      summary.validationFailed++;
      summary.failedFingerprints.push(sourceFingerprint);
      warn(`PPI movement type=VALIDATION fingerprint=${sourceFingerprint}: validation failed; ${error instanceof Error?error.message:'unknown error'}`);
    }
  }
  const importCandidates=async(activities:GhostfolioImportActivity[]):Promise<Set<string>>=>{
    if(activities.length===0)return new Set();
    const grouped=new Map<string,GhostfolioImportActivity[]>();
    for(const activity of activities){const group=grouped.get(activity.accountId)??[];group.push(activity);grouped.set(activity.accountId,group);}
    const failedIds=new Set<string>();
    let attempted=0;
    for(const group of grouped.values()){
    try{
      const result=await ghostfolio.importActivities(group,{dryRun:options.dryRun});
      const failed=result.validationFailures??[];
      summary.imported+=Math.max(0,result.imported-failed.length);
      summary.validationFailed+=failed.length;
      const groupFailedIds=failed.map(activityFingerprint);
      for(const id of groupFailedIds)failedIds.add(id);
      summary.failedFingerprints.push(...groupFailedIds);
      for(const activity of failed)warn(`Ghostfolio validation failed for fingerprint=${activityFingerprint(activity)}; ${typeof activity.error==='string'?activity.error:'unknown validation error'}`);
      attempted+=group.length;
    }catch(error){
      if(error instanceof GhostfolioImportError){
        const priorValidationFailures=error.details.validationFailures??[];
        summary.imported+=error.details.confirmed??Math.max(0,error.details.completed-priorValidationFailures.length);
        summary.validationFailed+=priorValidationFailures.length;
        summary.failedFingerprints.push(...priorValidationFailures);
        const validationRejection=error.details.cause instanceof HttpRequestError&&error.details.cause.details.service==='Ghostfolio'&&error.details.cause.details.status!==undefined&&error.details.cause.details.status>=400&&error.details.cause.details.status<500&&error.details.cause.details.status!==408&&error.details.cause.details.status!==429;
        if(validationRejection)summary.validationFailed+=error.details.failed;
        else summary.httpFailed+=error.details.failed;
        summary.unattempted+=Math.max(0,group.length-error.details.completed-error.details.failed)+(activities.length-attempted-group.length);
        if(error.details.cause instanceof GhostfolioUnknownImportOutcomeError)summary.uncertain+=error.details.failed;
        summary.failedFingerprints.push(...group.slice(error.details.from-1,error.details.to).map(activityFingerprint));
        throw new SyncRunError(error.message,summary,{cause:error});
      }
      summary.httpFailed+=group.length;
      summary.uncertain+=group.length;
      summary.unattempted+=activities.length-attempted-group.length;
      summary.failedFingerprints.push(...group.map(activityFingerprint));
      throw new SyncRunError('Ghostfolio import failed',summary,{cause:error});
    }
    }
    return failedIds;
  };
  const primaryFailures=await importCandidates(primaryCandidates);
  const settlementCandidates:GhostfolioImportActivity[]=[];
  for(const pending of pendingSettlements){
    if(pending.queuedPrimary&&primaryFailures.has(pending.dependsOn)){
      summary.cashSettlementSkipped++;
      const warningKey=`dependency:${pending.dependsOn}`;
      if(!settlementWarnings.has(warningKey)){settlementWarnings.add(warningKey);warn('PPI trade cash settlement skipped because its investment activity failed Ghostfolio validation');}
      continue;
    }
    enqueue(pending.activity,pending.dependsOn,undefined,settlementCandidates,false);
  }
  await importCandidates(settlementCandidates);
  if(summary.validationFailed>0)throw new SyncRunError('Mapped activities failed validation',summary);
  return summary;
}

export async function runSyncForAccounts(ppi:Pick<PpiClient,'getTransactions'|'getOrders'|'searchInstrument'>,ghostfolio:Pick<GhostfolioClient,'getActivities'|'importActivities'>,accountIds:string[],options:Omit<Parameters<typeof runSync>[2],'ppiAccountId'>&{onAccountComplete?:(sourceAccountIndex:number,summary:SyncSummary)=>void}):Promise<SyncSummary>{
  const total=emptySummary();
  const {onAccountComplete,...runOptions}=options;
  let deferredValidationError:SyncRunError|undefined;
  for(const [index,ppiAccountId] of accountIds.entries()){
    try{const summary=await runSync(ppi,ghostfolio,{...runOptions,ppiAccountId});onAccountComplete?.(index+1,summary);addSummary(total,summary);}
    catch(error){if(error instanceof SyncRunError){onAccountComplete?.(index+1,error.summary);addSummary(total,error.summary);if(error.summary.validationFailed>0&&error.summary.httpFailed===0&&error.summary.uncertain===0&&error.summary.unattempted===0){deferredValidationError??=error;continue;}throw new SyncRunError(error.message,total,{cause:error});}throw error;}
  }
  if(deferredValidationError)throw new SyncRunError(deferredValidationError.message,total,{cause:deferredValidationError});
  return total;
}
