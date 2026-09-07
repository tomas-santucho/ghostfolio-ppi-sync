import type { NormalizedTransaction } from './types.js';
import { transactionId } from './mapping/fingerprint.js';
import { normalizedToGhostfolio } from './mapping/normalized-to-ghostfolio.js';
import type { GhostfolioActivity, GhostfolioClient, GhostfolioImportActivity } from './ghostfolio/types.js';
import { z } from 'zod';
import { normalizeCurrency } from './mapping/currency.js';

export interface BootstrapHolding { symbol:string; currency:string; quantity:string; unitPrice:string; date:string; isin?:string; market?:string; dataSource?:string; }
export interface BootstrapSummary { prepared:number;duplicates:number;imported:number; }

const bootstrapFileSchema=z.array(z.object({symbol:z.string(),currency:z.string(),quantity:z.string(),unitPrice:z.string(),date:z.string(),isin:z.string().optional(),market:z.string().optional(),dataSource:z.string().min(1).optional()}));
export function parseBootstrapHoldings(value:unknown):BootstrapHolding[]{return bootstrapFileSchema.parse(value);}

export function bootstrapHolding(holding:BootstrapHolding,ppiAccountId:string):NormalizedTransaction {
  const date=new Date(holding.date);
  if(!holding.symbol.trim()) throw new Error('Bootstrap holding requires a symbol');
  if(!Number.isFinite(date.getTime())) throw new Error('Bootstrap holding requires a valid date');
  if(!/^(0|[1-9]\d*)(\.\d+)?$/.test(holding.quantity)||!/^(0|[1-9]\d*)(\.\d+)?$/.test(holding.unitPrice)) throw new Error('Bootstrap holding quantity and unitPrice must be non-negative decimals');
  const currency=normalizeCurrency(holding.currency);
  if(!currency) throw new Error(`Bootstrap holding requires a supported currency: ${holding.currency}`);
  const value:NormalizedTransaction={id:'pending',accountId:ppiAccountId,type:'BUY',symbol:holding.symbol.trim().toUpperCase(),isin:holding.isin,market:holding.market,dataSource:holding.dataSource,currency,date,quantity:holding.quantity,unitPrice:holding.unitPrice,fee:'0',description:'Opening position imported by explicit bootstrap',source:'ppi'};
  return {...value,id:transactionId(value)};
}

export function bootstrapHoldings(holdings:BootstrapHolding[],ppiAccountId:string,ghostfolioAccountId:string):GhostfolioImportActivity[] {
  return holdings.map(holding=>{
    const normalized=bootstrapHolding(holding,ppiAccountId);
    return {...normalizedToGhostfolio(normalized,ghostfolioAccountId),comment:`ppi-bootstrap:${normalized.id}`};
  });
}

function existingBootstrapComments(activities:GhostfolioActivity[],accountId:string):Set<string>{return new Set(activities.filter(activity=>activity.accountId===accountId&&typeof activity.comment==='string').map(activity=>activity.comment as string));}

export async function importBootstrapHoldings(holdings:BootstrapHolding[],ppiAccountId:string,ghostfolio:Pick<GhostfolioClient,'getActivities'|'importActivities'>,ghostfolioAccountId:string,options:{dryRun:boolean;cutoffDate:Date}):Promise<BootstrapSummary>{
  if(holdings.some(holding=>bootstrapHolding(holding,ppiAccountId).date>=options.cutoffDate))throw new Error('Bootstrap holding date must be before BOOTSTRAP_CUTOFF_DATE');
  const prepared=bootstrapHoldings(holdings,ppiAccountId,ghostfolioAccountId);
  const existing=existingBootstrapComments(await ghostfolio.getActivities(),ghostfolioAccountId);
  const seen=new Set<string>();
  const candidates=prepared.filter(activity=>{const comment=activity.comment as string;if(seen.has(comment)||existing.has(comment))return false;seen.add(comment);return true;});
  if(candidates.length===0)return {prepared:prepared.length,duplicates:prepared.length,imported:0};
  const result=await ghostfolio.importActivities(candidates,{dryRun:options.dryRun});
  const validationFailures=result.validationFailures?.length??0;
  if(validationFailures>0)throw new Error(`Ghostfolio rejected ${validationFailures} bootstrap activities`);
  return {prepared:prepared.length,duplicates:prepared.length-candidates.length,imported:result.imported};
}
