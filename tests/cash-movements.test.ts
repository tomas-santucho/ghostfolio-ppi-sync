import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { transactionsSchema } from '../src/ppi/schemas.js';
import { classifyCashMovement } from '../src/mapping/cash-movements.js';
import { ppiToNormalized } from '../src/mapping/ppi-to-normalized.js';
import { runSync, SyncRunError } from '../src/sync.js';
import type { GhostfolioActivity, GhostfolioImportActivity } from '../src/ghostfolio/types.js';

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

test('creates cash settlement legs from verified PPI trade amounts without double counting', async () => {
  const buy={...movements[0],agreementDate:'2024-02-01T12:00:00Z',ticker:'AAPL',currency:'Pesos',description:'Compra AAPL',quantity:2,price:10,amount:-20,balance:80};
  const sell={...buy,agreementDate:'2024-02-02T12:00:00Z',description:'Venta AAPL',quantity:-1,price:12,amount:12,balance:92};
  const existing:GhostfolioActivity[]=[];
  const imported:GhostfolioImportActivity[]=[];
  const ghostfolio={getActivities:async()=>existing,importActivities:async(batch:GhostfolioImportActivity[])=>{imported.push(...batch);existing.push(...batch.map(activity=>activity as unknown as GhostfolioActivity));return {dryRun:false,imported:batch.length,activities:[]};}};
  const options:Parameters<typeof runSync>[2]={ppiAccountId:'a',ghostfolioAccountId:'b',dryRun:false,symbolOverrides:[{symbol:'AAPL',mappedSymbol:'AAPL',dataSource:'YAHOO'}],cashAssets:{ARS:'GF_PPI_CASH_ARS'},cashActivityImport:true};
  const first=await runSync({getTransactions:async()=>[buy,sell]},ghostfolio,options);
  const second=await runSync({getTransactions:async()=>[buy,sell]},ghostfolio,options);
  expect(first).toMatchObject({fetched:2,mapped:4,imported:4,duplicates:0,cashSettlementSkipped:0});
  expect(second).toMatchObject({fetched:2,mapped:4,imported:0,duplicates:4,cashSettlementSkipped:0});
  expect(imported).toMatchObject([
    {type:'BUY',symbol:'AAPL',quantity:2,unitPrice:10,currency:'ARS'},
    {type:'SELL',symbol:'AAPL',quantity:1,unitPrice:12,currency:'ARS'},
    {type:'SELL',symbol:'GF_PPI_CASH_ARS',quantity:20,unitPrice:1,currency:'ARS',dataSource:'MANUAL'},
    {type:'BUY',symbol:'GF_PPI_CASH_ARS',quantity:12,unitPrice:1,currency:'ARS',dataSource:'MANUAL'}
  ]);
});

test('does not invent a cash settlement when the broker amount sign contradicts the trade', async () => {
  const sell={...movements[0],ticker:'AAPL',currency:'Pesos',description:'Venta AAPL',quantity:-1,price:12,amount:-12,balance:80};
  const imported:GhostfolioImportActivity[]=[];
  const warnings:string[]=[];
  const result=await runSync({getTransactions:async()=>[sell]}, {getActivities:async()=>[],importActivities:async(batch:GhostfolioImportActivity[])=>{imported.push(...batch);return {dryRun:true,imported:batch.length,activities:[]};}}, {ppiAccountId:'a',ghostfolioAccountId:'b',dryRun:true,symbolOverrides:[{symbol:'AAPL',mappedSymbol:'AAPL',dataSource:'YAHOO'}],cashAssets:{ARS:'GF_PPI_CASH_ARS'},cashActivityImport:true,warn:message=>warnings.push(message)});
  expect(result).toMatchObject({mapped:1,imported:1,cashSettlementSkipped:1});
  expect(imported).toHaveLength(1);
  expect(warnings[0]).toContain('unexpected sign');
});

test('does not import a cash settlement when its investment activity fails Ghostfolio validation', async () => {
  const valid={...movements[0],ticker:'AAPL',currency:'Pesos',description:'Compra AAPL',quantity:2,price:10,amount:-20,balance:80};
  const invalid={...valid,agreementDate:'2024-02-02T12:00:00Z',ticker:'ATVI',description:'Compra ATVI',quantity:3,price:10,amount:-30,balance:50};
  const batches:GhostfolioImportActivity[][]=[];
  const ghostfolio={getActivities:async()=>[],importActivities:async(batch:GhostfolioImportActivity[])=>{batches.push(batch);const invalidActivities=batch.filter(activity=>activity.symbol==='ATVI').map(activity=>({...activity,error:'invalid symbol'}));return {dryRun:true,imported:batch.length,activities:[],validationFailures:invalidActivities};}};
  const options:Parameters<typeof runSync>[2]={ppiAccountId:'a',ghostfolioAccountId:'b',dryRun:true,symbolOverrides:[{symbol:'AAPL',mappedSymbol:'AAPL',dataSource:'YAHOO'},{symbol:'ATVI',mappedSymbol:'ATVI',dataSource:'YAHOO'}],cashAssets:{ARS:'GF_PPI_CASH_ARS'},cashActivityImport:true};
  try{await runSync({getTransactions:async()=>[valid,invalid]},ghostfolio,options);throw new Error('expected validation failure');}
  catch(error){
    expect(error).toBeInstanceOf(SyncRunError);
    expect((error as SyncRunError).summary).toMatchObject({mapped:4,imported:2,validationFailed:1,cashSettlementSkipped:1});
  }
  expect(batches).toHaveLength(2);
  expect(batches[1]).toMatchObject([{type:'SELL',symbol:'GF_PPI_CASH_ARS',quantity:20,unitPrice:1}]);
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
  expect(first).toMatchObject({type:'DEPOSIT',currency:'ARS',quantity:'100.25',unitPrice:'1'});
  expect(ppiToNormalized({...movements[0]}, 'synthetic-account')?.id).toBe(first?.id);
  expect(ppiToNormalized(movements[1], 'synthetic-account')).toMatchObject({type:'DEPOSIT',currency:'USD',quantity:'123.45',unitPrice:'1'});
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
