import { z } from 'zod';
import { normalizeCurrency } from './currency.js';

export const cashAssetBuckets = ['ARS', 'USD_GLOBAL', 'USD_MEP', 'USD_CCL'] as const;
export type CashAssetBucket = typeof cashAssetBuckets[number];
export type CashAssetMap = Partial<Record<CashAssetBucket, string>>;

// UUID-backed MANUAL assets are accepted by both older and current Ghostfolio
// releases. Retain GF_ for configurations from earlier synchronizer versions.
const manualAssetSymbol = z.string().trim().refine(value => z.string().uuid().safeParse(value).success || /^GF_[A-Z0-9_]+$/i.test(value), 'Ghostfolio MANUAL asset symbols must be UUIDs or start with GF_');

const cashAssetMapSchema = z.object({
  ARS: manualAssetSymbol.optional(),
  USD_GLOBAL: manualAssetSymbol.optional(),
  USD_MEP: manualAssetSymbol.optional(),
  USD_CCL: manualAssetSymbol.optional()
}).strict();

export function parseCashAssetMap(value: unknown): CashAssetMap {
  return cashAssetMapSchema.parse(value);
}

function normalizedLabel(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toUpperCase();
}

/**
 * PPI uses USD labels to identify distinct custody/settlement buckets. Keep
 * them separate even though Ghostfolio's ISO currency remains USD.
 */
export function cashAssetBucket(currency: string): CashAssetBucket | undefined {
  const label = normalizedLabel(currency);
  if (normalizeCurrency(currency) === 'ARS') return 'ARS';
  if (/(^|\s)(MEP|BILLETE)(\s|$)|DOLAR MEP/.test(label)) return 'USD_MEP';
  if (/(^|\s)(CCL|CABLE|DIVISA)(\s|$)|DOLAR CABLE/.test(label)) return 'USD_CCL';
  if (['USD', 'U$S', 'US$', 'U$D', 'DOLAR SAXO', 'DOLARES', 'DOLAR'].includes(label)) return 'USD_GLOBAL';
  return undefined;
}

export function cashAssetCurrency(bucket: CashAssetBucket): 'ARS' | 'USD' {
  return bucket === 'ARS' ? 'ARS' : 'USD';
}

export function resolveCashAsset(currency: string, assets: CashAssetMap): { bucket: CashAssetBucket; symbol: string; currency: 'ARS' | 'USD' } | undefined {
  const bucket = cashAssetBucket(currency);
  const symbol = bucket ? assets[bucket] : undefined;
  return bucket && symbol ? {bucket, symbol: symbol.trim(), currency: cashAssetCurrency(bucket)} : undefined;
}
