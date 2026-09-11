import { expect, test } from 'bun:test';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { acquireRunLock } from '../src/run-lock.js';

test('prevents two sync processes from holding the same lock',async()=>{
  const path=join(tmpdir(),`ghostfolio-ppi-sync-test-${randomUUID()}.lock`);
  const release=await acquireRunLock(path);
  await expect(acquireRunLock(path)).rejects.toThrow('Another sync is already running');
  await release();
  const secondRelease=await acquireRunLock(path);
  await secondRelease();
  await unlink(path).catch(()=>undefined);
});
