import { isNumber, isSafeNumber, parse } from 'lossless-json';

export type PpiDecimal = number | string;

// Keep unsafe numeric tokens as text rather than rounding before validation.
export function parsePpiJson(text: string): unknown {
  return parse(text, null, value => isSafeNumber(value) ? Number(value) : value);
}

export function decimalSign(value: PpiDecimal): -1 | 0 | 1 | undefined {
  const text = String(value);
  if (!isNumber(text)) return undefined;
  const coefficient = text.split(/[eE]/)[0];
  if (!/[1-9]/.test(coefficient)) return 0;
  return text.startsWith('-') ? -1 : 1;
}

export function absoluteDecimal(value: PpiDecimal): string {
  if (decimalSign(value) === undefined) throw new Error('Invalid PPI decimal');
  return String(value).replace(/^-/, '');
}
