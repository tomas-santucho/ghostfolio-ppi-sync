import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const manifest=JSON.parse(readFileSync(new URL('./fixtures/contract-fixture-manifest.json',import.meta.url),'utf8')) as {schemaVersion:number;anonymization:string;fixtures:{file:string;provider:string;observedOn:string;operations:string[];expected:Record<string,unknown>}[]};

test('maintains anonymized contract-fixture provenance and supported-operation coverage',()=>{
  expect(manifest.schemaVersion).toBe(1);
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
