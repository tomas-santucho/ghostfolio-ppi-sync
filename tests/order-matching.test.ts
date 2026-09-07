import { expect, test } from 'bun:test';
import { enrichTransactionsWithOrderIds } from '../src/ppi/order-matching.js';
import type { PpiOrder, PpiTransaction } from '../src/ppi/types.js';

const trade: PpiTransaction = {agreementDate:'2024-01-01T12:00:00Z',currency:'USD',amount:'-100.00',price:'10.0',description:'Compra AAPL',ticker:'AAPL',quantity:'10',balance:'0'};
const order: PpiOrder = {id:42,instrumentType:'ACCIONES',operation:'COMPRA',ticker:'AAPL',status:'FILLED',date:'2024-01-01T15:00:00Z',settlement:'T+2',quantity:'10.00',orderType:'MARKET',operationType:'CI',operationMaxDate:'2024-01-01T15:00:00Z',price:'10',currency:'Dolar Saxo',amount:'-100',externalId:'client-id'};

test('enriches a uniquely exact PPI trade with its stable order id',()=>{
  expect(enrichTransactionsWithOrderIds([trade],[order])).toMatchObject([{externalId:'order:42'}]);
});

test('does not guess an order id for ambiguous or mismatched rows',()=>{
  expect(enrichTransactionsWithOrderIds([trade],[order,{...order,id:43}])[0].externalId).toBeUndefined();
  expect(enrichTransactionsWithOrderIds([trade],[{...order,price:'10.01'}])[0].externalId).toBeUndefined();
  expect(enrichTransactionsWithOrderIds([{...trade,description:'Comisiones Opciones SAXO'}],[order])[0].externalId).toBeUndefined();
});
