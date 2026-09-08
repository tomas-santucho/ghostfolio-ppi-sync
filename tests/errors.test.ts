import { expect, test } from 'bun:test';
import { sanitizeHttpDetail } from '../src/errors.js';

test('redacts credentials, private account identifiers, and movement text from HTTP details',()=>{const detail=sanitizeHttpDetail('{"authorization":"Bearer token","accountNumber":"private-account","description":"private movement","accessToken":"secret"}');expect(detail).toContain('[REDACTED]');expect(detail).not.toContain('private-account');expect(detail).not.toContain('private movement');expect(detail).not.toContain('token');expect(detail).not.toContain('secret');});
