import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { normalizedToGhostfolio } from '../src/mapping/normalized-to-ghostfolio.js';
import { ppiToNormalized } from '../src/mapping/ppi-to-normalized.js';
import { deriveTradeCashSettlement } from '../src/mapping/trade-settlements.js';
import { isUnreferencedCommission } from '../src/mapping/cash-movements.js';
import { transactionSchema } from '../src/ppi/schemas.js';
import type { PpiInstrument } from '../src/ppi/types.js';
import { runSync } from '../src/sync.js';

const manifest=JSON.parse(readFileSync(new URL('./fixtures/contract-fixture-manifest.json',import.meta.url),'utf8')) as {schemaVersion:number;anonymization:string;fixtures:{file:string;provider:string;observedOn:string;operations:string[];expected:Record<string,unknown>}[]};
const variants=JSON.parse(readFileSync(new URL('./fixtures/ppi-contract-variants.json',import.meta.url),'utf8')) as {cases:{id:string;transaction:unknown;instrument?:PpiInstrument;ambiguousInstruments?:PpiInstrument[];cashAsset?:string;expectedDate?:string;normalized?:Record<string,unknown>;payload?:Record<string,unknown>;settlement?:Record<string,unknown>;omitReason?:string;skipReason?:string}[]};

test('maintains anonymized contract-fixture provenance and supported-operation coverage',()=>{
  expect(manifest.schemaVersion).toBe(2);
  expect(manifest.anonymization).toContain('synthetic');
  const operations=new Set(manifest.fixtures.flatMap(fixture=>fixture.operations));
  for(const operation of ['BUY','SELL','DIVIDEND','INTEREST','FEE','DEPOSIT','WITHDRAWAL'])expect(operations.has(operation)).toBe(true);
  for(const fixture of manifest.fixtures){
    expect(readFileSync(new URL(`./fixtures/${fixture.file}`,import.meta.url),'utf8').length).toBeGreaterThan(0);
    expect(fixture.provider.length).toBeGreaterThan(0);
    expect(fixture.observedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Object.keys(fixture.expected).length).toBeGreaterThan(0);
  }
});

test('maps every supported contract variant to its explicit normalized result and Ghostfolio payload',async()=>{
  const covered=new Set<string>();
  for(const variant of variants.cases){
    const transaction=transactionSchema.parse(variant.transaction);
    if(variant.ambiguousInstruments){
      const warnings:string[]=[];
      const result=await runSync({getTransactions:async()=>[transaction],searchInstrument:async()=>variant.ambiguousInstruments!},{getActivities:async()=>[],importActivities:async()=>({dryRun:true,imported:0,activities:[]})},{ppiAccountId:'fixture-source-account',ghostfolioAccountId:'fixture-ghostfolio-account',dryRun:true,warn:warning=>warnings.push(warning)});
      expect(result,variant.id).toMatchObject({fetched:1,mapped:0,unsupported:1,imported:0});
      expect(warnings[0],variant.id).toContain('requires an instrument resolution');
      continue;
    }
    const normalized=ppiToNormalized(transaction,'fixture-source-account',variant.instrument);
    if(variant.omitReason){expect(normalized,variant.id).toBeUndefined();continue;}
    if(variant.skipReason){expect(isUnreferencedCommission(transaction),variant.id).toBe(true);continue;}
    expect(normalized,variant.id).toBeDefined();
    expect(normalized,variant.id).toMatchObject(variant.normalized!);
    expect(normalized?.date.toISOString(),variant.id).toBe(variant.expectedDate);
    const payloadSource=variant.cashAsset?{...normalized!,symbol:variant.cashAsset,dataSource:'MANUAL',market:'PPI_CASH'}:normalized!;
    const payload=normalizedToGhostfolio(payloadSource,'fixture-ghostfolio-account');
    expect(payload,variant.id).toMatchObject({accountId:'fixture-ghostfolio-account',date:variant.expectedDate,...variant.payload});
    expect(payload.comment,variant.id).toMatch(/^ppi-sync:ppi:v2:fixture-source-account:[a-f0-9]{64}$/);
    covered.add(normalized!.type);
    if(variant.settlement){
      const settlement=deriveTradeCashSettlement(transaction,normalized!,{ARS:'GF_PPI_CASH_ARS',USD_GLOBAL:'GF_PPI_CASH_USD_GLOBAL',USD_MEP:'GF_PPI_CASH_USD_MEP',USD_CCL:'GF_PPI_CASH_USD_CCL'});
      expect(settlement.settlement,variant.id).toBeDefined();
      expect(normalizedToGhostfolio(settlement.settlement!,'fixture-ghostfolio-account'),variant.id).toMatchObject({accountId:'fixture-ghostfolio-account',...variant.settlement});
    }
  }
  for(const operation of ['BUY','SELL','DIVIDEND','INTEREST','FEE','DEPOSIT','WITHDRAWAL'])expect(covered.has(operation)).toBe(true);
});
