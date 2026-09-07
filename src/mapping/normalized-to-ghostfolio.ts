import type { NormalizedTransaction } from '../types.js';import type { GhostfolioImportActivity } from '../ghostfolio/types.js';
import { isSafeNumber } from 'lossless-json';
function decimal(value:string|undefined,field:string):number|undefined{if(value===undefined)return undefined;const result=Number(value);if(!isSafeNumber(value)||!Number.isFinite(result))throw new Error(`Invalid decimal in ${field}: ${value}`);return result;}
function dataSource(transaction:NormalizedTransaction):string|undefined{if(transaction.dataSource)return transaction.dataSource;if(transaction.market==='BYMA')return 'MANUAL';if(transaction.market==='NYSE'||transaction.market==='NASDAQ')return 'YAHOO';return undefined;}
function ghostfolioType(type: NormalizedTransaction['type']): string {
  if (type === 'DEPOSIT') return 'BUY';
  if (type === 'WITHDRAWAL') return 'SELL';
  return type;
}
export function normalizedToGhostfolio(transaction:NormalizedTransaction,ghostfolioAccountId:string):GhostfolioImportActivity{const activity:GhostfolioImportActivity={accountId:ghostfolioAccountId,type:ghostfolioType(transaction.type),date:transaction.date.toISOString(),currency:transaction.currency,comment:`ppi-sync:${transaction.id}`};const quantity=decimal(transaction.quantity,'quantity');const unitPrice=decimal(transaction.unitPrice,'unitPrice');const fee=decimal(transaction.fee,'fee');if(transaction.symbol)activity.symbol=transaction.symbol;const source=dataSource(transaction);if(source)activity.dataSource=source;if(quantity!==undefined)activity.quantity=quantity;if(unitPrice!==undefined)activity.unitPrice=unitPrice;if(fee!==undefined)activity.fee=Math.abs(fee);return activity;}
