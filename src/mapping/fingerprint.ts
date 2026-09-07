import { createHash } from 'node:crypto';
import type { NormalizedTransaction } from '../types.js';
export function transactionFingerprint(transaction:NormalizedTransaction):string { const canonical=['ppi',transaction.accountId,transaction.externalId??'',transaction.type,transaction.date.toISOString(),transaction.symbol??'',transaction.quantity??'',transaction.unitPrice??'',transaction.fee??'',transaction.currency,transaction.sourceBalance??''].join('|'); return createHash('sha256').update(canonical,'utf8').digest('hex'); }
export function transactionId(transaction:NormalizedTransaction):string { return `ppi:${transaction.accountId}:${transactionFingerprint(transaction)}`; }
