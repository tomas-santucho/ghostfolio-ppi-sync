import type { MepBalanceProjection } from './config.js';
import type { GhostfolioActivity, GhostfolioClient, GhostfolioImportActivity, GhostfolioManualAssetProfile } from './ghostfolio/types.js';

const symbolFor=(sourceIndex:number)=>`GF_PPI_MEP_SNAPSHOT_${sourceIndex+1}`;
const commentFor=(sourceIndex:number,value:number)=>`ppi-mep-snapshot:${sourceIndex+1}:${value.toFixed(2)}`;
const snapshotFor=(activities:GhostfolioActivity[],accountId:string,sourceIndex:number)=>activities.find(activity=>activity.accountId===accountId&&(activity.comment?.startsWith(`ppi-mep-snapshot:${sourceIndex+1}:`)||activity.comment?.startsWith(`ppi-balance-snapshot:source-${sourceIndex+1}:`))&&activity.type==='BUY');

export interface MepBalanceProjectionSummary {prepared:number;imported:number;updated:number;duplicates:number;marketData:number;}

const sameInstant=(left:string|undefined,right:string)=>left!==undefined&&new Date(left).getTime()===new Date(right).getTime();
const pricedProjection=(projection:MepBalanceProjection,sourceIndex:number,asOfDate:Date):{date:string;unitPrice:number;profile:GhostfolioManualAssetProfile}|undefined=>{
  const performance=projection.performancePercentages?.[sourceIndex];
  if(performance===undefined)return undefined;
  const startDate=new Date(asOfDate);startDate.setUTCDate(startDate.getUTCDate()-(projection.performanceDays??30));
  const start=startDate.toISOString();
  const end=asOfDate.toISOString();
  return {date:start,unitPrice:1/(1+performance/100),profile:{symbol:symbolFor(sourceIndex),name:`PPI MEP balance projection ${sourceIndex+1}`,currency:'USD',dataSource:'MANUAL',countries:[],holdings:[],isActive:true,sectors:[],marketData:[{date:start,marketPrice:1/(1+performance/100)},{date:end,marketPrice:1}]}};
};

export async function syncMepBalanceProjection(ghostfolio:Pick<GhostfolioClient,'getActivities'|'importActivities'|'updateActivity'|'upsertManualAssetProfiles'>,projection:MepBalanceProjection,options:{dryRun:boolean;date?:Date}):Promise<MepBalanceProjectionSummary>{
  const existing=await ghostfolio.getActivities();
  const asOfDate=options.date??(projection.asOfDate?new Date(`${projection.asOfDate}T00:00:00.000Z`):new Date());
  const date=asOfDate.toISOString();
  const activities:GhostfolioImportActivity[]=[];
  const updates:(GhostfolioImportActivity&{id:string})[]=[];
  const profiles:GhostfolioManualAssetProfile[]=[];
  let duplicates=0;
  for(let sourceIndex=0;sourceIndex<projection.accountIds.length;sourceIndex++){
    const accountId=projection.accountIds[sourceIndex]!;
    const desired=projection.values[sourceIndex]!;
    const priced=pricedProjection(projection,sourceIndex,asOfDate);
    if(priced)profiles.push(priced.profile);
    const snapshot=snapshotFor(existing,accountId,sourceIndex);
    const desiredDate=priced?.date??snapshot?.date??date;
    const desiredUnitPrice=priced?.unitPrice??1;
    if(snapshot){
      if(Number(snapshot.quantity)===desired&&(!priced||(Number(snapshot.unitPrice)===desiredUnitPrice&&sameInstant(snapshot.date,desiredDate)))){duplicates++;continue;}
      if(!snapshot.id)throw new Error('Ghostfolio MEP balance projection activity is missing an id');
      updates.push({id:snapshot.id,accountId,type:'BUY',date:desiredDate,symbol:String((snapshot.SymbolProfile as {symbol?:unknown}|undefined)?.symbol??symbolFor(sourceIndex)),currency:'USD',quantity:desired,unitPrice:desiredUnitPrice,fee:0,dataSource:'MANUAL',comment:commentFor(sourceIndex,desired)});
      continue;
    }
    activities.push({accountId,type:'BUY',date:desiredDate,symbol:symbolFor(sourceIndex),currency:'USD',quantity:desired,unitPrice:desiredUnitPrice,fee:0,dataSource:'MANUAL',comment:commentFor(sourceIndex,desired)});
  }
  if(options.dryRun)return {prepared:projection.accountIds.length,imported:activities.length,updated:updates.length,duplicates,marketData:profiles.length};
  if(profiles.length>0){if(!ghostfolio.upsertManualAssetProfiles)throw new Error('Ghostfolio client does not support manual market-data projections');await ghostfolio.upsertManualAssetProfiles(profiles);}
  if(activities.length>0){const result=await ghostfolio.importActivities(activities);const validationFailures=result.validationFailures?.length??0;if(validationFailures>0)throw new Error(`Ghostfolio rejected ${validationFailures} MEP balance projection activities`);}
  if(updates.length>0){if(!ghostfolio.updateActivity)throw new Error('Ghostfolio client does not support updating MEP balance projections');for(const update of updates)await ghostfolio.updateActivity(update);}
  return {prepared:projection.accountIds.length,imported:activities.length,updated:updates.length,duplicates,marketData:profiles.length};
}
