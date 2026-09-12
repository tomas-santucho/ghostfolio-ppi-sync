import { expect, test } from 'bun:test';

const baseEnv=(apiUrl:string):Record<string,string>=>({
  PPI_API_URL:apiUrl,
  PPI_AUTHORIZED_CLIENT:'synthetic-authorized',
  PPI_CLIENT_KEY:'synthetic-client',
  PPI_PUBLIC_KEY:'synthetic-public',
  PPI_PRIVATE_KEY:'synthetic-private',
  PPI_ACCOUNT_ID:'synthetic-account',
  PPI_ACCOUNT_IDS:'synthetic-account',
  PPI_ORDER_FALLBACK:'false',
  GHOSTFOLIO_URL:apiUrl,
  GHOSTFOLIO_ACCESS_TOKEN:'synthetic-token',
  GHOSTFOLIO_ACCOUNT_ID:'synthetic-ghost',
  GHOSTFOLIO_ACCOUNT_ID_ARS:'',
  GHOSTFOLIO_ACCOUNT_ID_USD:'',
  LOG_LEVEL:'info'
});

async function runCli(args:string[],env:Record<string,string>):Promise<{exitCode:number;output:string}>{
  const child=Bun.spawn({cmd:['bun','src/index.ts',...args],cwd:process.cwd(),env:{...process.env,...env},stdout:'pipe',stderr:'pipe'});
  const [output,error,exitCode]=await Promise.all([new Response(child.stdout).text(),new Response(child.stderr).text(),child.exited]);
  return {exitCode,output:`${output}${error}`};
}

test('CLI reports an empty mocked sync as success',async()=>{
  const server=Bun.serve({port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/api/1.0/Account/LoginApi')return Response.json([{accessToken:'synthetic-access',refreshToken:'synthetic-refresh',tokenType:'Bearer',expires:3600}]);if(path==='/api/1.0/Account/Movements'||path==='/api/v1/activities')return Response.json([]);return new Response('not found',{status:404});}});
  try{const result=await runCli(['--dry-run'],baseEnv(server.url.toString()));expect(result.exitCode).toBe(0);expect(result.output).toContain('Fetched: 0');expect(result.output).toContain('Dry-run completed.');}finally{server.stop(true);}
});

test('CLI reports separate opaque source-account summaries for a shared Ghostfolio target',async()=>{
  const server=Bun.serve({port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/api/1.0/Account/LoginApi')return Response.json([{accessToken:'synthetic-access',refreshToken:'synthetic-refresh',tokenType:'Bearer',expires:3600}]);if(path==='/api/1.0/Account/Movements'||path==='/api/v1/activities')return Response.json([]);return new Response('not found',{status:404});}});
  try{const result=await runCli(['--dry-run'],{...baseEnv(server.url.toString()),PPI_ACCOUNT_IDS:'synthetic-source-one,synthetic-source-two'});expect(result.exitCode).toBe(0);expect(result.output).toContain('Source account 1 summary: fetched=0');expect(result.output).toContain('Source account 2 summary: fetched=0');expect(result.output).not.toContain('synthetic-source-one');expect(result.output).not.toContain('synthetic-source-two');}finally{server.stop(true);}
});

test('CLI rejects an inverted diagnostic range before the local PPI server is called',async()=>{
  let requests=0;
  const server=Bun.serve({port:0,fetch(){requests++;return new Response('unexpected');}});
  try{const result=await runCli(['--ppi-only'],{...baseEnv(server.url.toString()),SYNC_FROM_DATE:'2024-02-01',SYNC_TO_DATE:'2024-01-31'});expect(result.exitCode).toBe(1);expect(result.output).toContain('SYNC_TO_DATE must not be before SYNC_FROM_DATE');expect(requests).toBe(0);}finally{server.stop(true);}
});

test('CLI stops at a mocked PPI quota response with a nonzero exit',async()=>{
  let movements=0;
  const server=Bun.serve({port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/api/1.0/Account/LoginApi')return Response.json([{accessToken:'synthetic-access',refreshToken:'synthetic-refresh',tokenType:'Bearer',expires:3600}]);if(path==='/api/1.0/Account/Movements'){movements++;return new Response('limited',{status:429,headers:{'retry-after':'60'}});}return new Response('not found',{status:404});}});
  try{const result=await runCli(['--ppi-only'],baseEnv(server.url.toString()));expect(result.exitCode).toBe(1);expect(result.output).toContain('history may be incomplete');expect(movements).toBe(1);}finally{server.stop(true);}
});

test('CLI reports a mocked Ghostfolio validation rejection with a nonzero exit',async()=>{
  const server=Bun.serve({port:0,fetch(request){const path=new URL(request.url).pathname;if(path==='/api/1.0/Account/LoginApi')return Response.json([{accessToken:'synthetic-access',refreshToken:'synthetic-refresh',tokenType:'Bearer',expires:3600}]);if(path==='/api/1.0/Account/Movements')return Response.json([{agreementDate:'2024-01-01T12:00:00Z',currency:'USD',amount:100,price:10,description:'Compra',ticker:'MSFT',quantity:10,balance:0}]);if(path==='/api/1.0/MarketData/SearchInstrument')return Response.json([{ticker:'MSFT',description:'Microsoft',currency:'USD',type:'ACCIONES-USA',market:'NASDAQ'}]);if(path==='/api/v1/activities')return Response.json([]);if(path==='/api/v1/import')return Response.json({activities:[{comment:'ppi-sync:synthetic-failure',error:'invalid'}]});return new Response('not found',{status:404});}});
  try{const result=await runCli(['--dry-run'],baseEnv(server.url.toString()));expect(result.exitCode).toBe(1);expect(result.output).toContain('Validation failed: 1');expect(result.output).toContain('Mapped activities failed validation');}finally{server.stop(true);}
});
