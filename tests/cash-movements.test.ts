import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { transactionsSchema } from '../src/ppi/schemas.js';
import { classifyCashMovement } from '../src/mapping/cash-movements.js';
import { ppiToNormalized } from '../src/mapping/ppi-to-normalized.js';
import { runSync } from '../src/sync.js';
import type { GhostfolioImportActivity } from '../src/ghostfolio/types.js';

const movements = transactionsSchema.parse(JSON.parse(readFileSync(new URL('./fixtures/ppi-cash-income.json', import.meta.url), 'utf8')));

test('does not turn income reversals or zero income into positive receipts', () => {
  for (const description of ['Dividend AAPL', 'Interes saldo']) {
    for (const amount of [-1, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(ppiToNormalized({...movements[5], description, amount}, 'a')).toBeUndefined();
    }
  }
});

test('retains independent BUY/SELL economics when a separate commission has no reference', async () => {
  const buy = {...movements[0], ticker:'AAPL', currency:'USD', description:'Compra AAPL', quantity:2, price:10, amount:-20};
  const sell = {...buy, description:'Venta AAPL', quantity:-1, price:12, amount:12};
  const imported: GhostfolioImportActivity[] = [];
  const warnings: string[] = [];
  const result = await runSync({getTransactions:async()=>[buy, movements[8], sell]}, {
    getActivities:async()=>[],
    importActivities:async(batch)=>{imported.push(...batch);return {dryRun:true,imported:batch.length,activities:[]};}
  }, {ppiAccountId:'a',ghostfolioAccountId:'b',dryRun:true,
    symbolOverrides:[{symbol:'AAPL',mappedSymbol:'AAPL',dataSource:'YAHOO'}],warn:message=>warnings.push(message)});
  expect(result).toMatchObject({imported:2,unsupported:1});
  expect(imported).toMatchObject([{type:'BUY',quantity:2,unitPrice:10,fee:0},{type:'SELL',quantity:1,unitPrice:12,fee:0}]);
  expect(warnings).toHaveLength(1);
  expect(warnings[0]).toContain('no stable trade reference');
});

test('repeated dividend and tax synchronization persists each movement only once', async () => {
  const existing: GhostfolioImportActivity[] = [];
  let writes = 0;
  const ghostfolio = {
    getActivities:async()=>existing.map(activity=>({...activity})),
    importActivities:async(batch:GhostfolioImportActivity[])=>{
      writes++;existing.push(...batch);return {dryRun:false,imported:batch.length,activities:[]};
    }
  };
  const ppi = {getTransactions:async()=>movements.slice(4,8)};
  const options = {ppiAccountId:'a',ghostfolioAccountId:'b',dryRun:false};
  const first = await runSync(ppi,ghostfolio,options);
  const second = await runSync(ppi,ghostfolio,options);
  expect(first).toMatchObject({imported:4,duplicates:0,unsupported:0});
  expect(second).toMatchObject({imported:0,duplicates:4,unsupported:0});
  expect(writes).toBe(1);
  expect(new Set(existing.map(item=>item.comment)).size).toBe(4);
});

test('classifies observed funding by exact label, amount sign and zero execution fields', () => {
  expect(classifyCashMovement(movements[0])).toBe('DEPOSIT');
  expect(classifyCashMovement(movements[1])).toBe('DEPOSIT');
  expect(classifyCashMovement(movements[2])).toBe('WITHDRAWAL');
  expect(classifyCashMovement(movements[3])).toBeUndefined();
  for (const invalid of [{amount:-1}, {amount:0}, {quantity:1}, {price:1}]) {
    expect(classifyCashMovement({...movements[0], ...invalid})).toBeUndefined();
  }
  expect(classifyCashMovement({...movements[2], amount:1})).toBeUndefined();
});

test('preserves funding amounts and fingerprints before cash assets are resolved', () => {
  const first = ppiToNormalized(movements[0], 'synthetic-account');
  expect(first).toMatchObject({type:'DEPOSIT',currency:'ARS',unitPrice:'100.25'});
  expect(ppiToNormalized({...movements[0]}, 'synthetic-account')?.id).toBe(first?.id);
  expect(ppiToNormalized(movements[1], 'synthetic-account')).toMatchObject({type:'DEPOSIT',currency:'USD',unitPrice:'123.45'});
  expect(ppiToNormalized(movements[3], 'synthetic-account')).toBeUndefined();
});

test('maps observed dividend withholding separately and explicitly skips unsupported coupon cases', () => {
  for (const index of [6,7]) {
    expect(ppiToNormalized(movements[index], 'a')).toMatchObject({type:'FEE',quantity:'1',fee:'0'});
    expect(ppiToNormalized({...movements[index],amount:1}, 'a')).toBeUndefined();
  }
  for (const index of [4,5]) expect(ppiToNormalized(movements[index], 'a')?.type).toBe('DIVIDEND');
  for (const index of [9,10]) expect(ppiToNormalized(movements[index], 'a')).toBeUndefined();
});

test('warns instead of sending a coupon with an unsupported PPI currency', async () => {
  const warnings: string[] = [];
  const result = await runSync({getTransactions:async()=>[movements[9]]}, {
    getActivities:async()=>[],
    importActivities:async()=>({dryRun:true, imported:0, activities:[]})
  }, {ppiAccountId:'a',ghostfolioAccountId:'b',dryRun:true,warn:message=>warnings.push(message)});
  expect(result).toMatchObject({imported:0,unsupported:1});
  expect(warnings[0]).toContain('supported currency');
});

test('reports unreferenced commission without inventing a trade association', async () => {
  const warnings: string[] = [];
  let writes = 0;
  const result = await runSync({getTransactions:async()=>[movements[8]]}, {
    getActivities:async()=>[],
    importActivities:async()=>{writes++;return {dryRun:true, imported:0, activities:[]};}
  }, {ppiAccountId:'a',ghostfolioAccountId:'b',dryRun:true,warn:message=>warnings.push(message)});
  expect(result.unsupported).toBe(1);
  expect(writes).toBe(0);
  expect(warnings[0]).toContain('no stable trade reference');
});
