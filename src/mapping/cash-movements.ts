import type { PpiTransaction } from '../ppi/types.js';

import { decimalSign } from '../ppi/decimals.js';

/** Exact broker labels observed in Account/Movements; transfers are not funding. */
export function classifyCashMovement(value: PpiTransaction): 'DEPOSIT' | 'WITHDRAWAL' | undefined {
  if (decimalSign(value.amount) === undefined || decimalSign(value.quantity) !== 0 || decimalSign(value.price) !== 0) return undefined;
  const label = value.description.trim().toUpperCase();
  if (label === 'INGRESO DE FONDOS' && decimalSign(value.amount) === 1) return 'DEPOSIT';
  if (label === 'RETIRO DE FONDOS' && decimalSign(value.amount) === -1) return 'WITHDRAWAL';
  return undefined;
}

export function isUnreferencedCommission(value: PpiTransaction): boolean {
  return value.description.trim().toUpperCase() === 'COMISIONES OPCIONES SAXO';
}
