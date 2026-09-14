import type { MepBalanceProjection } from './config.js';
import type { GhostfolioActivity, GhostfolioClient, GhostfolioImportActivity } from './ghostfolio/types.js';

const symbolFor=(sourceIndex:number)=>`GF_PPI_MEP_SNAPSHOT_${sourceIndex+1}`;
const commentFor=(sourceIndex:number,value:number)=>`ppi-mep-snapshot:${sourceIndex+1}:${value.toFixed(2)}`;
const snapshotFor=(activities:GhostfolioActivity[],accountId:string,sourceIndex:number)=>activities.find(activity=>activity.accountId===accountId&&(activity.comment?.startsWith(`ppi-mep-snapshot:${sourceIndex+1}:`)||activity.comment?.startsWith(`ppi-balance-snapshot:source-${sourceIndex+1}:`))&&activity.type==='BUY');

export interface MepBalanceProjectionSummary {prepared:number;imported:number;updated:number;duplicates:number;}

export async function syncMepBalanceProjection(ghostfolio:Pick<GhostfolioClient,'getActivities'|'importActivities'|'updateActivity'>,projection:MepBalanceProjection,options:{dryRun:boolean;date?:Date}):Promise<MepBalanceProjectionSummary>{
  const existing=await ghostfolio.getActivities();
  const date=(options.date??new Date()).toISOString();
  const activities:GhostfolioImportActivity[]=[];
  const updates:(GhostfolioImportActivity&{id:string})[]=[];
  let duplicates=0;
  for(let sourceIndex=0;sourceIndex<projection.accountIds.length;sourceIndex++){
    const accountId=projection.accountIds[sourceIndex]!;
    const desired=projection.values[sourceIndex]!;
    const snapshot=snapshotFor(existing,accountId,sourceIndex);
    if(snapshot){
      if(Number(snapshot.quantity)===desired){duplicates++;continue;}
      if(!snapshot.id)throw new Error('Ghostfolio MEP balance projection activity is missing an id');
      updates.push({id:snapshot.id,accountId,type:'BUY',date:snapshot.date??date,symbol:String((snapshot.SymbolProfile as {symbol?:unknown}|undefined)?.symbol??symbolFor(sourceIndex)),currency:'USD',quantity:desired,unitPrice:1,fee:0,dataSource:'MANUAL',comment:commentFor(sourceIndex,desired)});
      continue;
    }
    activities.push({accountId,type:'BUY',date,symbol:symbolFor(sourceIndex),currency:'USD',quantity:desired,unitPrice:1,fee:0,dataSource:'MANUAL',comment:commentFor(sourceIndex,desired)});
  }
  if(options.dryRun)return {prepared:projection.accountIds.length,imported:activities.length,updated:updates.length,duplicates};
  if(activities.length>0){const result=await ghostfolio.importActivities(activities);const validationFailures=result.validationFailures?.length??0;if(validationFailures>0)throw new Error(`Ghostfolio rejected ${validationFailures} MEP balance projection activities`);}
  if(updates.length>0){if(!ghostfolio.updateActivity)throw new Error('Ghostfolio client does not support updating MEP balance projections');for(const update of updates)await ghostfolio.updateActivity(update);}
  return {prepared:projection.accountIds.length,imported:activities.length,updated:updates.length,duplicates};
}
