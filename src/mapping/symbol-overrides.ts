import { z } from 'zod';

export interface SymbolOverride {
  symbol:string;
  mappedSymbol:string;
  accountId?:string;
  currency?:'ARS'|'USD';
  isin?:string;
  market?:string;
  dataSource?:'YAHOO'|'MANUAL';
}

export interface SymbolOverrideContext {
  symbol?:string;
  accountId:string;
  currency:string;
  isin?:string;
  market?:string;
}

const itemSchema=z.object({
  symbol:z.string().trim().min(1),
  mappedSymbol:z.string().trim().min(1),
  accountId:z.string().trim().min(1).optional(),
  currency:z.enum(['ARS','USD']).optional(),
  isin:z.string().trim().min(1).optional(),
  market:z.string().trim().min(1).optional(),
  dataSource:z.enum(['YAHOO','MANUAL']).optional()
}).superRefine((value,context)=>{
  if(value.dataSource==='MANUAL'&&!z.string().uuid().safeParse(value.mappedSymbol).success&&!/^GF_[A-Z0-9_]+$/i.test(value.mappedSymbol)){
    context.addIssue({code:z.ZodIssueCode.custom,message:'MANUAL symbol overrides must target a Ghostfolio custom-asset UUID or GF_ asset'});
  }
});
const schema=z.array(itemSchema);
const normalized=(value:string|undefined):string|undefined=>value?.trim().toUpperCase();
const scopeKeys=['accountId','currency','isin','market'] as const;
const specificity=(override:SymbolOverride):number=>scopeKeys.filter(key=>override[key]!==undefined).length;
const overlaps=(left:SymbolOverride,right:SymbolOverride):boolean=>scopeKeys.every(key=>{const a=normalized(left[key]);const b=normalized(right[key]);return !a||!b||a===b;});

export function parseSymbolOverrides(value:unknown):SymbolOverride[]{
  const overrides=schema.parse(value);
  for(let index=0;index<overrides.length;index++)for(let other=index+1;other<overrides.length;other++){
    if(normalized(overrides[index].symbol)===normalized(overrides[other].symbol)&&specificity(overrides[index])===specificity(overrides[other])&&overlaps(overrides[index],overrides[other])){
      throw new Error(`Conflicting equally specific symbol overrides for ${overrides[index].symbol}`);
    }
  }
  return overrides;
}

export function resolveSymbolOverride(context:SymbolOverrideContext,overrides:SymbolOverride[]):SymbolOverride|undefined {
  const symbol=normalized(context.symbol);
  if(!symbol)return undefined;
  const candidates=overrides.filter(override=>normalized(override.symbol)===symbol&&(!override.accountId||override.accountId===context.accountId)&&(!override.currency||override.currency===context.currency)&&(!override.isin||!context.isin||normalized(override.isin)===normalized(context.isin))&&(!override.market||!context.market||normalized(override.market)===normalized(context.market)));
  if(candidates.length===0)return undefined;
  const highest=Math.max(...candidates.map(specificity));
  const selected=candidates.filter(override=>specificity(override)===highest);
  if(selected.length!==1)throw new Error(`Ambiguous equally specific symbol overrides for ${symbol}`);
  return selected[0];
}
