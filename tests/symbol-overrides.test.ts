import { expect, test } from 'bun:test';
import { parseSymbolOverrides, resolveSymbolOverride } from '../src/mapping/symbol-overrides.js';

const overrides=[{symbol:'AAPLD',mappedSymbol:'AAPL',isin:'ARDEUT116183',market:'BYMA',dataSource:'MANUAL'}];
test('resolves a case-insensitive explicit symbol override',()=>expect(resolveSymbolOverride(' aapLd ',parseSymbolOverrides(overrides))).toEqual(overrides[0]));
test('returns no override when absent and rejects malformed input',()=>{expect(resolveSymbolOverride('MSFT',parseSymbolOverrides(overrides))).toBeUndefined();expect(()=>parseSymbolOverrides([{symbol:'AAPL'}])).toThrow();});
