import { expect, test } from 'bun:test';
import { parseCashAssetMap } from '../src/mapping/cash-assets.js';
import { normalizedToGhostfolio } from '../src/mapping/normalized-to-ghostfolio.js';
import { resolveCashAsset } from '../src/mapping/cash-assets.js';
import { runSync } from '../src/sync.js';

const assets = {
  ARS: 'PPI_CASH_ARS',
  USD_GLOBAL: 'PPI_CASH_USD',
  USD_MEP: 'PPI_CASH_USD_MEP',
  USD_CCL: 'PPI_CASH_USD_CCL'
};

const funding = (currency: string, description: string, amount: number) => ({
  agreementDate: '2024-01-01T12:00:00Z',
  currency,
  amount,
  price: 0,
  description,
  ticker: 'Ticker not found',
  quantity: 0,
  balance: 0
});

test('keeps PPI ARS, global USD, MEP and CCL cash buckets separate', () => {
  expect(resolveCashAsset('Pesos', assets)).toMatchObject({bucket:'ARS', symbol:'PPI_CASH_ARS', currency:'ARS'});
  expect(resolveCashAsset('Dolar Saxo', assets)).toMatchObject({bucket:'USD_GLOBAL', symbol:'PPI_CASH_USD', currency:'USD'});
  expect(resolveCashAsset('Dolares billete | MEP', assets)).toMatchObject({bucket:'USD_MEP', symbol:'PPI_CASH_USD_MEP', currency:'USD'});
  expect(resolveCashAsset('Dolares divisa | CCL', assets)).toMatchObject({bucket:'USD_CCL', symbol:'PPI_CASH_USD_CCL', currency:'USD'});
  expect(resolveCashAsset('DolarCV10000-Loc.', assets)).toBeUndefined();
});

test('requires a strict, explicit manual cash asset map', () => {
  expect(parseCashAssetMap({ARS:'PPI_CASH_ARS'})).toEqual({ARS:'PPI_CASH_ARS'});
  expect(() => parseCashAssetMap({USD:'PPI_CASH_USD'})).toThrow();
  expect(() => parseCashAssetMap({ARS:''})).toThrow();
});

test('imports funding as manual cash BUY/SELL activities and remains idempotent', async () => {
  const transactions = [
    funding('Pesos', 'Ingreso de Fondos', 1000),
    funding('Dolar Saxo', 'Ingreso de Fondos', 10),
    funding('Dolar MEP - COM 7340', 'Ingreso de Fondos', 20),
    funding('Dolar Cable', 'Retiro de Fondos', -30)
  ];
  const existing: {comment?: string}[] = [];
  const imported: unknown[] = [];
  const ghostfolio = {
    getActivities: async () => existing,
    importActivities: async (activities: {comment?: string}[]) => {
      imported.push(...activities);
      existing.push(...activities);
      return {dryRun:false, imported:activities.length, activities:[]};
    }
  };
  const options = {ppiAccountId:'ppi', ghostfolioAccountId:'ghost', dryRun:false, cashAssets:assets};
  const first = await runSync({getTransactions:async()=>transactions}, ghostfolio, options);
  const second = await runSync({getTransactions:async()=>transactions}, ghostfolio, options);
  expect(first).toMatchObject({fetched:4, imported:4, duplicates:0, unsupported:0});
  expect(second).toMatchObject({fetched:4, imported:0, duplicates:4, unsupported:0});
  expect(imported).toMatchObject([
    {type:'BUY', symbol:'PPI_CASH_ARS', currency:'ARS', quantity:1, unitPrice:1000, dataSource:'MANUAL'},
    {type:'BUY', symbol:'PPI_CASH_USD', currency:'USD', quantity:1, unitPrice:10, dataSource:'MANUAL'},
    {type:'BUY', symbol:'PPI_CASH_USD_MEP', currency:'USD', quantity:1, unitPrice:20, dataSource:'MANUAL'},
    {type:'SELL', symbol:'PPI_CASH_USD_CCL', currency:'USD', quantity:1, unitPrice:30, dataSource:'MANUAL'}
  ]);
});

test('does not enable cash imports without an explicit matching asset', async () => {
  const warnings: string[] = [];
  const result = await runSync({getTransactions:async()=>[funding('Dolar Cable', 'Ingreso de Fondos', 10)]}, {
    getActivities:async()=>[],
    importActivities:async()=>({dryRun:true, imported:0, activities:[]})
  }, {ppiAccountId:'ppi',ghostfolioAccountId:'ghost',dryRun:true,cashAssets:{USD_MEP:'PPI_CASH_USD_MEP'},warn:message=>warnings.push(message)});
  expect(result).toMatchObject({imported:0, unsupported:1});
  expect(warnings[0]).toContain('manual cash asset');
});

test('converts normalized cash types only at the Ghostfolio boundary', () => {
  expect(normalizedToGhostfolio({id:'cash',accountId:'ppi',type:'WITHDRAWAL',symbol:'PPI_CASH_USD_MEP',currency:'USD',date:new Date('2024-01-01T00:00:00Z'),quantity:'1',unitPrice:'12.5',fee:'0',dataSource:'MANUAL',source:'ppi'}, 'ghost')).toMatchObject({type:'SELL',symbol:'PPI_CASH_USD_MEP',currency:'USD'});
});
