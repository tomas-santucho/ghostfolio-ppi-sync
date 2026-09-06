import type { NormalizedTransaction } from './types.js';
import { transactionId } from './mapping/fingerprint.js';
import { normalizedToGhostfolio } from './mapping/normalized-to-ghostfolio.js';
import type { GhostfolioImportActivity } from './ghostfolio/types.js';
import { z } from 'zod';
import { normalizeCurrency } from './mapping/currency.js';

export interface BootstrapHolding { symbol:string; currency:string; quantity:string; unitPrice:string; date:string; isin?:string; market?:string; dataSource?:string; }
const bootstrapFileSchema=z.array(z.object({symbol:z.string(),currency:z.string(),quantity:z.string(),unitPrice:z.string(),date:z.string(),isin:z.string().optional(),market:z.string().optional(),dataSource:z.string().min(1).optional()}));
export function parseBootstrapHoldings(value:unknown):BootstrapHolding[]{return bootstrapFileSchema.parse(value);}

export function bootstrapHolding(holding:BootstrapHolding,ppiAccountId:string):NormalizedTransaction {
  const date=new Date(holding.date);
  if(!holding.symbol.trim()) throw new Error('Bootstrap holding requires a symbol');
  if(!Number.isFinite(date.getTime())) throw new Error('Bootstrap holding requires a valid date');
  if(!/^(0|[1-9]\d*)(\.\d+)?$/.test(holding.quantity)||!/^(0|[1-9]\d*)(\.\d+)?$/.test(holding.unitPrice)) throw new Error('Bootstrap holding quantity and unitPrice must be non-negative decimals');
  const currency=normalizeCurrency(holding.currency); if(!currency) throw new Error(`Bootstrap holding requires a supported currency: ${holding.currency}`);
  const value:NormalizedTransaction={id:'pending',accountId:ppiAccountId,type:'BUY',symbol:holding.symbol.trim().toUpperCase(),isin:holding.isin,market:holding.market,dataSource:holding.dataSource,currency,date,quantity:holding.quantity,unitPrice:holding.unitPrice,fee:'0',description:'Opening position imported by explicit bootstrap',source:'ppi'};
  return {...value,id:transactionId(value)};
}

export function bootstrapHoldings(holdings:BootstrapHolding[],ppiAccountId:string,ghostfolioAccountId:string):GhostfolioImportActivity[] {
  return holdings.map(holding=>normalizedToGhostfolio(bootstrapHolding(holding,ppiAccountId),ghostfolioAccountId));
}
