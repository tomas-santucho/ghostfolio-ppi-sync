import { open, readFile, unlink } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { join } from 'node:path';

type LockRecord={pid:number;startedAt:string;hostname:string};
const defaultLockPath=join(tmpdir(),'ghostfolio-ppi-sync.lock');
const foreignHostLeaseMs=6*60*60*1000;

async function processIsRunning(pid:number):Promise<boolean>{
  try{process.kill(pid,0);return true;}catch(error){return !(error instanceof Error&&'code' in error&&(error as NodeJS.ErrnoException).code==='ESRCH');}
}

async function staleLock(path:string):Promise<boolean>{
  try{
    const value=JSON.parse(await readFile(path,'utf8')) as Partial<LockRecord>;
    if(typeof value.pid!=='number'||!Number.isInteger(value.pid)||value.pid<=0||typeof value.hostname!=='string'||typeof value.startedAt!=='string')return false;
    if(value.hostname===hostname())return !(await processIsRunning(value.pid));
    const startedAt=Date.parse(value.startedAt);
    return Number.isFinite(startedAt)&&Date.now()-startedAt>foreignHostLeaseMs;
  }catch{return false;}
}

export async function acquireRunLock(path=process.env.SYNC_LOCK_PATH||defaultLockPath):Promise<() => Promise<void>>{
  for(let attempt=0;attempt<2;attempt++){
    try{
      const handle=await open(path,'wx');
      await handle.writeFile(JSON.stringify({pid:process.pid,startedAt:new Date().toISOString(),hostname:hostname()} satisfies LockRecord));
      await handle.close();
      let released=false;
      return async()=>{if(!released){released=true;await unlink(path).catch(error=>{if(!(error instanceof Error&&'code' in error&&(error as NodeJS.ErrnoException).code==='ENOENT'))throw error;});}};
    }catch(error){
      if(!(error instanceof Error&&'code' in error&&(error as NodeJS.ErrnoException).code==='EEXIST'))throw error;
      if(attempt===0&&await staleLock(path)){await unlink(path);continue;}
      throw new Error(`Another sync is already running (lock: ${path}).`);
    }
  }
  throw new Error('Could not acquire sync lock.');
}
