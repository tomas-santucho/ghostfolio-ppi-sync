import { expect, test } from 'bun:test';
import { parseSymbolOverrides, resolveSymbolOverride } from '../src/mapping/symbol-overrides.js';

const context={symbol:'AAPLD',accountId:'ppi-a',currency:'ARS',isin:'ARDEUT116183',market:'BYMA'};

test('uses a global fallback when no scoped override applies',()=>{
  const global={symbol:'AAPLD',mappedSymbol:'AAPL',dataSource:'YAHOO' as const};
  expect(resolveSymbolOverride(context,parseSymbolOverrides([global]))).toEqual(global);
});

test('prefers account, currency, market and ISIN-specific overrides',()=>{
  const global={symbol:'AAPLD',mappedSymbol:'AAPL',dataSource:'YAHOO' as const};
  const scoped={symbol:'AAPLD',mappedSymbol:'GF_PPI_AAPLD',accountId:'ppi-a',currency:'ARS' as const,market:'BYMA',isin:'ARDEUT116183',dataSource:'MANUAL' as const};
  expect(resolveSymbolOverride(context,parseSymbolOverrides([global,scoped]))).toEqual(scoped);
  expect(resolveSymbolOverride({...context,accountId:'ppi-b'},parseSymbolOverrides([global,scoped]))).toEqual(global);
});

test('rejects ambiguous selectors and invalid provider identities before importing',()=>{
  expect(()=>parseSymbolOverrides([{symbol:'AAPL',mappedSymbol:'AAPL.US',accountId:'a',currency:'USD'},{symbol:'AAPL',mappedSymbol:'AAPL',accountId:'a',market:'NASDAQ'}])).toThrow('Conflicting equally specific');
  expect(()=>parseSymbolOverrides([{symbol:'AL30',mappedSymbol:'AL30',dataSource:'MANUAL'}])).toThrow('GF_');
  expect(()=>parseSymbolOverrides([{symbol:'AAPL'}])).toThrow();
});
