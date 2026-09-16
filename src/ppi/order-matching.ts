import { normalizeCurrency } from '../mapping/currency.js';
import { normalizeSymbol } from '../mapping/symbols.js';
import { absoluteDecimal, type PpiDecimal } from './decimals.js';
import type { PpiOrder, PpiTransaction } from './types.js';

function canonicalDecimal(value: PpiDecimal): string {
  const text = absoluteDecimal(value).toLowerCase();
  const match = /^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/.exec(text);
  if (!match) return text;
  const integer = match[1].replace(/^0+/, '') || '0';
  const fraction = match[2] ?? '';
  const exponent = Number(match[3] ?? '0');
  if (!Number.isSafeInteger(exponent)) return text;
  const digits = `${integer}${fraction}`.replace(/^0+/, '') || '0';
  const decimalPlaces = fraction.length - exponent;
  if (digits === '0') return '0';
  if (decimalPlaces <= 0) return `${digits}${'0'.repeat(-decimalPlaces)}`;
  if (digits.length <= decimalPlaces) return `0.${'0'.repeat(decimalPlaces - digits.length)}${digits}`.replace(/0+$/, '').replace(/\.$/, '');
  return `${digits.slice(0, -decimalPlaces)}.${digits.slice(-decimalPlaces)}`.replace(/0+$/, '').replace(/\.$/, '');
}

function utcDay(value: string): string | undefined {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
}

function direction(value: string): 'BUY' | 'SELL' | undefined {
  const text = value.toUpperCase();
  if (text.includes('BUY') || text.includes('COMPRA')) return 'BUY';
  if (text.includes('SELL') || text.includes('VENTA')) return 'SELL';
  return undefined;
}

function matches(transaction: PpiTransaction, order: PpiOrder): boolean {
  return direction(transaction.description) === direction(order.operation)
    && normalizeSymbol(transaction.ticker) === normalizeSymbol(order.ticker)
    && normalizeCurrency(transaction.currency) === normalizeCurrency(order.currency)
    && utcDay(transaction.agreementDate) === utcDay(order.date)
    && canonicalDecimal(transaction.quantity) === canonicalDecimal(order.quantity)
    && canonicalDecimal(transaction.price) === canonicalDecimal(order.price)
    && canonicalDecimal(transaction.amount) === canonicalDecimal(order.amount);
}

// Orders are only used when exactly one documented order matches every stable trade field.
export function enrichTransactionsWithOrderIds(transactions: PpiTransaction[], orders: PpiOrder[]): PpiTransaction[] {
  return transactions.map(transaction => {
    if (direction(transaction.description) === undefined) return transaction;
    const candidates = orders.filter(order => matches(transaction, order));
    return candidates.length === 1 ? {...transaction, externalId: `order:${candidates[0].id}`} : transaction;
  });
}

function isCompleted(order: PpiOrder): boolean {
  return /FILLED|EXECUT|EJECUT|COMPLET|CONFIRM/i.test(order.status);
}

function orderTransaction(order: PpiOrder): PpiTransaction {
  const directionText = direction(order.operation) === 'SELL' ? 'Venta' : 'Compra';
  return {
    agreementDate: order.date,
    currency: order.currency,
    amount: order.amount,
    price: order.price,
    description: `${directionText} ${order.ticker}`,
    ticker: order.ticker,
    quantity: order.quantity,
    balance: '0',
    externalId: `order:${order.id}`,
  };
}

// A completed order can precede its accounting movement in PPI. Use it only
// when no movement with the same stable trade economics is already present.
export function addMissingCompletedOrders(transactions: PpiTransaction[], orders: PpiOrder[]): PpiTransaction[] {
  const missing = orders.filter(order => isCompleted(order)
    && !transactions.some(transaction => matches(transaction, order))
    && !transactions.some(transaction => transaction.externalId === `order:${order.id}`));
  return [...transactions, ...missing.map(orderTransaction)];
}
