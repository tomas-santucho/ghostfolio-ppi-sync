import type { CashAssetMap } from './cash-assets.js';
import { resolveCashAsset } from './cash-assets.js';
import { transactionId } from './fingerprint.js';
import { absoluteDecimal, decimalSign } from '../ppi/decimals.js';
import type { PpiTransaction } from '../ppi/types.js';
import type { NormalizedTransaction } from '../types.js';

export type TradeSettlementResult={settlement?:NormalizedTransaction;reason?:string};

/**
 * A PPI trade changes both the investment position and the matching cash
 * bucket. Ghostfolio imports one asset per activity, so represent the cash
 * leg separately at a stable unit price of one. The broker's signed amount is
 * authoritative; never infer a settlement from quantity × price.
 */
export function deriveTradeCashSettlement(source:PpiTransaction,trade:NormalizedTransaction,assets:CashAssetMap):TradeSettlementResult{
  if(trade.type!=='BUY'&&trade.type!=='SELL')return {};
  const asset=resolveCashAsset(source.currency,assets);
  if(!asset)return {reason:`manual cash asset is not configured for currency=${source.currency}`};
  const expectedSign=trade.type==='BUY'?-1:1;
  if(decimalSign(source.amount)!==expectedSign)return {reason:`broker settlement amount has an unexpected sign for ${trade.type}`};
  const quantity=absoluteDecimal(source.amount);
  if(decimalSign(quantity)!==1)return {reason:'broker settlement amount is not positive'};
  const settlement:NormalizedTransaction={
    id:'pending',accountId:trade.accountId,type:trade.type==='BUY'?'SELL':'BUY',symbol:asset.symbol,
    sourceSymbol:`PPI_CASH_SETTLEMENT:${trade.id}`,currency:asset.currency,date:trade.date,quantity,unitPrice:'1',fee:'0',
    externalId:trade.externalId,sourceBalance:trade.sourceBalance,description:'PPI trade cash settlement',source:'ppi',market:'PPI_CASH',dataSource:'MANUAL'
  };
  return {settlement:{...settlement,id:transactionId(settlement)}};
}
