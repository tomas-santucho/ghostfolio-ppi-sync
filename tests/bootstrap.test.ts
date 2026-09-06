import { expect, test } from 'bun:test';
import { bootstrapHolding, bootstrapHoldings } from '../src/bootstrap.js';

const holding={symbol:'aapl',currency:'USD',quantity:'2',unitPrice:'100.25',date:'2024-01-01T00:00:00.000Z',isin:'US0378331005',market:'NASDAQ'};
test('creates an explicit idempotent opening BUY',()=>{const result=bootstrapHolding(holding,'ppi-account');expect(result).toMatchObject({type:'BUY',symbol:'AAPL',quantity:'2',unitPrice:'100.25',isin:'US0378331005',market:'NASDAQ'});expect(result.id).toMatch(/^ppi:ppi-account:[a-f0-9]{64}$/);expect(result.id).toBe(bootstrapHolding(holding,'ppi-account').id);});
test('rejects invalid bootstrap data',()=>{expect(()=>bootstrapHolding({...holding,date:'invalid'},'a')).toThrow('valid date');expect(()=>bootstrapHolding({...holding,quantity:'-1'},'a')).toThrow('non-negative');});
test('normalizes bootstrap currency aliases and rejects unknown currencies',()=>{expect(bootstrapHolding({...holding,currency:'Dólar MEP'},'ppi').currency).toBe('USD');expect(()=>bootstrapHolding({...holding,currency:'XYZ money'},'ppi')).toThrow('supported currency');});
test('preserves an explicit bootstrap data source',()=>{expect(bootstrapHoldings([{...holding,dataSource:'MANUAL'}],'ppi','ghost')[0].dataSource).toBe('MANUAL');});
test('maps an explicit bootstrap batch to Ghostfolio activities',()=>{const result=bootstrapHoldings([holding], 'ppi-account','ghost-account');expect(result).toHaveLength(1);expect(result[0]).toMatchObject({accountId:'ghost-account',type:'BUY',symbol:'AAPL',quantity:2,unitPrice:100.25,dataSource:'YAHOO'});});
