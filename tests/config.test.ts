import { expect, test } from 'bun:test';
import { loadConfig, parseAccountMap, parsePpiAccountIds } from '../src/config.js';

const env = { PPI_API_URL:'https://ppi.example', PPI_AUTHORIZED_CLIENT:'authorized', PPI_CLIENT_KEY:'client', PPI_PUBLIC_KEY:'public', PPI_PRIVATE_KEY:'private', PPI_ACCOUNT_ID:'ppi', GHOSTFOLIO_URL:'https://ghostfolio.example', GHOSTFOLIO_ACCESS_TOKEN:'token', GHOSTFOLIO_ACCOUNT_ID:'ghost', SYNC_FROM_DATE:'2024-01-01' };
test('validates and maps configuration', () => expect(loadConfig(env)).toMatchObject({ dryRun:false, syncFromDate:new Date('2024-01-01T00:00:00.000Z') }));
test('rejects invalid configuration', () => expect(() => loadConfig({...env, PPI_API_URL:'not-url'})).toThrow());
test('validates symbol overrides from environment JSON',()=>{const config=loadConfig({...env,PPI_SYMBOL_OVERRIDES:'[{"symbol":"AAPLD","mappedSymbol":"AAPL","market":"BYMA"}]'});expect(config.symbolOverrides[0]).toMatchObject({symbol:'AAPLD',mappedSymbol:'AAPL',market:'BYMA'});expect(()=>loadConfig({...env,PPI_SYMBOL_OVERRIDES:'[{"symbol":"AAPL"}]'})).toThrow();});
test('parses multiple PPI account ids without duplicates',()=>{expect(parsePpiAccountIds('a, b, a','fallback')).toEqual(['a','b']);expect(parsePpiAccountIds(undefined,'fallback')).toEqual(['fallback']);expect(()=>parsePpiAccountIds(' , ','fallback')).toThrow();});
test('parses an explicit PPI to Ghostfolio account map',()=>{expect(parseAccountMap('{"ppi-a":"ghost-a"," ppi-b ":" ghost-b "}')).toEqual({'ppi-a':'ghost-a','ppi-b':'ghost-b'});expect(()=>parseAccountMap('[]')).toThrow();expect(()=>parseAccountMap('{"ppi-a":""}')).toThrow();});
test('validates and maps log level',()=>{expect(loadConfig({...env,LOG_LEVEL:'debug'}).logLevel).toBe('debug');expect(()=>loadConfig({...env,LOG_LEVEL:'verbose'})).toThrow();});
