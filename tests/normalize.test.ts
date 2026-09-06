import { expect, test } from 'bun:test';
import { normalizeTransaction } from '../src/normalize.js';

const input={type:'BUY',date:'2024-01-01T12:00:00.000Z',currency:'ARS',symbol:'GGAL',quantity:'150',unitPrice:'7125.45',fee:'102.30'};
test('normalizes supported transaction without floating point conversion',()=>{const tx=normalizeTransaction(input,'account');expect(tx).toMatchObject({type:'BUY',accountId:'account',quantity:'150',unitPrice:'7125.45',fee:'102.30',source:'ppi'});expect(tx?.date).toBeInstanceOf(Date);});
test('normalizes all supported types',()=>{for(const type of ['SELL','DIVIDEND','INTEREST','FEE','DEPOSIT','WITHDRAWAL']) expect(normalizeTransaction({...input,type},'a')?.type as string).toBe(type);});
test('omits unsupported types',()=>expect(normalizeTransaction({...input,type:'ORDER_CANCELLED'},'a')).toBeUndefined());
test('uses external id as stable id',()=>expect(normalizeTransaction({...input,externalId:'ppi-123'},'a')?.id).toBe('ppi-123'));
