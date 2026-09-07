import type { GhostfolioConfig } from '../config.js';
import { GhostfolioImportError, GhostfolioUnknownImportOutcomeError, HttpRequestError, retryAfterMs, retryDelay, sanitizeHttpDetail } from '../errors.js';
import { activitiesSchema, importResponseSchema } from './schemas.js';
import type { GhostfolioActivity, GhostfolioClient, GhostfolioImportActivity, GhostfolioImportResult } from './types.js';

type Fetcher=(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>;
type Sleeper=(milliseconds:number)=>Promise<void>;
type ImportBatchResult={activities:GhostfolioActivity[];validationFailures:GhostfolioActivity[]};
const sleep:Sleeper=milliseconds=>new Promise(resolve=>setTimeout(resolve,milliseconds));

export class GhostfolioHttpClient implements GhostfolioClient {
  private bearerToken?:string;

  constructor(private readonly config:GhostfolioConfig,private readonly fetcher:Fetcher=fetch,private readonly sleeper:Sleeper=sleep){}

  private async token():Promise<string>{
    if(this.bearerToken)return this.bearerToken;
    if(!this.config.securityToken){this.bearerToken=this.config.accessToken;return this.bearerToken;}
    const res=await this.fetcher(new URL('/api/v1/auth/anonymous',this.config.url),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accessToken:this.config.securityToken}),signal:AbortSignal.timeout(15000)});
    if(!res.ok){const detail=sanitizeHttpDetail((await res.text()).replace(/\s+/g,' '));throw new HttpRequestError(`Ghostfolio authentication HTTP error ${res.status}${detail?`: ${detail}`:''}`,{service:'Ghostfolio',operation:'authentication',status:res.status,retryAfterMs:retryAfterMs(res.headers.get('retry-after'))});}
    const body=await res.json() as {authToken?:unknown};
    if(typeof body.authToken!=='string'||body.authToken.length===0)throw new Error('Ghostfolio authentication response did not contain authToken');
    this.bearerToken=body.authToken;
    return body.authToken;
  }

  private async headers(){return {'content-type':'application/json',authorization:`Bearer ${await this.token()}`};}

  async getActivities():Promise<GhostfolioActivity[]>{
    const res=await this.fetcher(new URL('/api/v1/activities',this.config.url),{headers:await this.headers(),signal:AbortSignal.timeout(15000)});
    if(!res.ok){const detail=sanitizeHttpDetail((await res.text()).replace(/\s+/g,' '));throw new HttpRequestError(`Ghostfolio activities HTTP error ${res.status}${detail?`: ${detail}`:''}`,{service:'Ghostfolio',operation:'activities',status:res.status,retryAfterMs:retryAfterMs(res.headers.get('retry-after'))});}
    const body:unknown=await res.json();
    if(Array.isArray(body))return activitiesSchema.parse(body) as GhostfolioActivity[];
    if(body&&typeof body==='object'&&Array.isArray((body as {activities?:unknown}).activities))return activitiesSchema.parse((body as {activities:unknown[]}).activities) as GhostfolioActivity[];
    throw new Error('Ghostfolio activities response shape unsupported');
  }

  private async reconcileUncertainBatch(activities:GhostfolioImportActivity[],cause:unknown):Promise<GhostfolioImportActivity[]>{
    const accountId=activities[0]?.accountId;
    const comments=activities.map(activity=>activity.comment);
    if(!accountId||activities.some(activity=>activity.accountId!==accountId)||comments.some(comment=>typeof comment!=='string'||!comment.startsWith('ppi-sync:'))){
      throw new GhostfolioUnknownImportOutcomeError({pending:activities.length,cause});
    }
    let existing:GhostfolioActivity[];
    try{existing=await this.getActivities();}catch(reconciliationCause){throw new GhostfolioUnknownImportOutcomeError({pending:activities.length,cause:reconciliationCause});}
    const persisted=new Set(existing.filter(activity=>activity.accountId===accountId&&typeof activity.comment==='string').map(activity=>activity.comment as string));
    return activities.filter(activity=>!persisted.has(activity.comment as string));
  }

  private async importBatch(activities:GhostfolioImportActivity[],options:{dryRun?:boolean}):Promise<ImportBatchResult>{
    const url=new URL('/api/v1/import',this.config.url);
    if(options.dryRun)url.searchParams.set('dryRun','true');
    let pending=activities;
    for(let attempt=0;attempt<3;attempt++){
      const headers=await this.headers();
      let res:Response;
      try{res=await this.fetcher(url,{method:'POST',headers,body:JSON.stringify({activities:pending}),signal:AbortSignal.timeout(15000)});}catch(cause){
        pending=await this.reconcileUncertainBatch(pending,cause);
        if(pending.length===0)return {activities:[],validationFailures:[]};
        if(attempt===2)throw new GhostfolioUnknownImportOutcomeError({pending:pending.length,cause});
        await this.sleeper(retryDelay(attempt,undefined));
        continue;
      }
      if(res.ok){
        let body:Record<string,unknown>;
        try{body=importResponseSchema.parse(await res.json()) as Record<string,unknown>;}catch(cause){throw new HttpRequestError('Ghostfolio import response was malformed',{service:'Ghostfolio',operation:'import',cause});}
        const imported=(Array.isArray(body.activities)?body.activities:[]) as GhostfolioActivity[];
        return {activities:imported,validationFailures:imported.filter(activity=>Boolean(activity.error))};
      }
      const retryAfter=retryAfterMs(res.headers.get('retry-after'));
      const transient=res.status===408||res.status===429||res.status>=500;
      if(!transient||attempt===2){const detail=sanitizeHttpDetail((await res.text()).replace(/\s+/g,' '));throw new HttpRequestError(`Ghostfolio import HTTP error ${res.status}${detail?`: ${detail}`:''}`,{service:'Ghostfolio',operation:'import',status:res.status,retryAfterMs:retryAfter});}
      await this.sleeper(retryDelay(attempt,retryAfter));
    }
    throw new Error('Ghostfolio import retry loop exited unexpectedly');
  }

  async importActivities(activities:GhostfolioImportActivity[],options:{dryRun?:boolean}={}):Promise<GhostfolioImportResult>{
    const batchSize=this.config.batchSize;
    const imported:GhostfolioActivity[]=[];
    const validationFailures:GhostfolioActivity[]=[];
    let completed=0;
    for(let index=0;index<activities.length;index+=batchSize){
      const batch=activities.slice(index,index+batchSize);
      try{
        const result=await this.importBatch(batch,options);
        imported.push(...result.activities);
        validationFailures.push(...result.validationFailures);
        completed+=batch.length;
      }catch(error){
        const batchNumber=Math.floor(index/batchSize)+1;
        throw new GhostfolioImportError(`Ghostfolio import failed for batch ${batchNumber} (activities ${index+1}-${index+batch.length}, size ${batch.length}): ${error instanceof Error?error.message:'unknown error'}`,{batchNumber,from:index+1,to:index+batch.length,size:batch.length,completed,failed:batch.length,cause:error});
      }
    }
    return {dryRun:options.dryRun===true,imported:activities.length,activities:imported,validationFailures};
  }
}
