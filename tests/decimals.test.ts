import { expect, test } from 'bun:test';
import { parsePpiJson, decimalSign } from '../src/ppi/decimals.js';
import { transactionsSchema } from '../src/ppi/schemas.js';
import { ppiToNormalized } from '../src/mapping/ppi-to-normalized.js';
import { normalizedToGhostfolio } from '../src/mapping/normalized-to-ghostfolio.js';

function movement(amount: string) {
  return transactionsSchema.parse(parsePpiJson('[{"agreementDate":"2024-01-01T00:00:00Z","description":"Ingreso de Fondos","currency":"ARS","amount":'+amount+',"price":0,"quantity":0,"balance":0}]'))[0];
}

test('preserves exact money from raw JSON through normalization and refuses lossy HTTP output', () => {
  const input = movement('9007199254740993.25');
  expect(input.amount).toBe('9007199254740993.25');
  const normalized = ppiToNormalized(input,'a')!;
  expect(normalized.unitPrice).toBe('9007199254740993.25');
  expect(()=>normalizedToGhostfolio(normalized,'b')).toThrow('unitPrice');
});

test('ordinary JSON decimal formatting preserves existing fingerprints', () => {
  expect(ppiToNormalized(movement('100.2500'),'a')?.id).toBe(ppiToNormalized(movement('1.0025e2'),'a')?.id);
  expect(ppiToNormalized(movement('100.25'),'a')?.unitPrice).toBe('100.25');
});

test('classifies tiny decimals without floating point underflow', () => {
  expect(decimalSign('1e-400')).toBe(1);
  expect(decimalSign('-1e-400')).toBe(-1);
  expect(decimalSign('-0.00e20')).toBe(0);
  const normalized=ppiToNormalized(movement('1e-400'),'a')!;
  expect(normalized.type).toBe('DEPOSIT');
  expect(()=>normalizedToGhostfolio(normalized,'b')).toThrow('unitPrice');
});
