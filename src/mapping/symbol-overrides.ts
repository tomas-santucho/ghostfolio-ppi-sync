import { z } from 'zod';

export interface SymbolOverride { symbol:string; mappedSymbol:string; isin?:string; market?:string; dataSource?:string; }
const schema=z.array(z.object({symbol:z.string().min(1),mappedSymbol:z.string().min(1),isin:z.string().optional(),market:z.string().optional(),dataSource:z.string().optional()}));
export function parseSymbolOverrides(value:unknown):SymbolOverride[]{return schema.parse(value);}
export function resolveSymbolOverride(symbol:string|undefined,overrides:SymbolOverride[]):SymbolOverride|undefined { if(!symbol)return undefined; const key=symbol.trim().toUpperCase(); return overrides.find(item=>item.symbol.trim().toUpperCase()===key); }
