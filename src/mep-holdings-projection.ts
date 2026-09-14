import type { MepBalanceProjection } from './config.js';
import type { GhostfolioClient, GhostfolioImportActivity, GhostfolioManualAssetProfile } from './ghostfolio/types.js';
import type { PpiPositionGroup } from './ppi/types.js';

const manualSymbol=(sourceIndex:number,ticker:string)=>`GF_PPI_MEP_S${sourceIndex+1}_${ticker.trim().toUpperCase().replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'')}`;
const commentFor=(sourceIndex:number,ticker:string)=>`ppi-mep-holding:${sourceIndex+1}:${ticker.trim().toUpperCase()}`;
const sameInstant=(left:string|undefined,right:string)=>left!==undefined&&new Date(left).getTime()===new Date(right).getTime();
const positionWeight=(amount:number)=>Math.abs(amount);

export interface MepHoldingProjectionSummary {prepared:number;imported:number;updated:number;duplicates:number;marketData:number;}

function sourceHoldings(groups:PpiPositionGroup[],sourceIndex:number,total:number){
  const groupTotal=groups.reduce((sum,group)=>sum+Math.max(0,group.groupedValue),0);
  if(groupTotal<=0)throw new Error(`PPI source ${sourceIndex+1} has no positive current position value`);
  return groups.flatMap(group=>{
    const groupValue=Math.max(0,group.groupedValue);
    const weighted=group.instruments.filter(position=>position.quantity>0&&positionWeight(position.amount)>0);
    const instrumentsTotal=weighted.reduce((sum,position)=>sum+positionWeight(position.amount),0);
    if(instrumentsTotal<=0)return [];
    return weighted.map(position=>({ticker:position.ticker,quantity:position.quantity,value:total*(groupValue/groupTotal)*(positionWeight(position.amount)/instrumentsTotal)}));
  });
}

export async function syncMepHoldingsProjection(ghostfolio:Pick<GhostfolioClient,'getActivities'|'importActivities'|'updateActivity'|'upsertManualAssetProfiles'>,projection:MepBalanceProjection,groupsBySource:PpiPositionGroup[][],options:{dryRun:boolean;date?:Date}):Promise<MepHoldingProjectionSummary>{
  const existing=await ghostfolio.getActivities();
  const asOfDate=options.date??(projection.asOfDate?new Date(`${projection.asOfDate}T00:00:00.000Z`):new Date());
  const end=asOfDate.toISOString();
  const activities:GhostfolioImportActivity[]=[];
  const updates:(GhostfolioImportActivity&{id:string})[]=[];
  const profiles:GhostfolioManualAssetProfile[]=[];
  let duplicates=0;
  for(let sourceIndex=0;sourceIndex<projection.accountIds.length;sourceIndex++){
    const accountId=projection.accountIds[sourceIndex]!;
    const performance=projection.performancePercentages?.[sourceIndex];
    const startDate=new Date(asOfDate);startDate.setUTCDate(startDate.getUTCDate()-(projection.performanceDays??30));
    const start=startDate.toISOString();
    for(const holding of sourceHoldings(groupsBySource[sourceIndex]??[],sourceIndex,projection.values[sourceIndex]!)){
      const symbol=manualSymbol(sourceIndex,holding.ticker);
      const currentPrice=holding.value/holding.quantity;
      const initialPrice=performance===undefined?currentPrice:currentPrice/(1+performance/100);
      const date=performance===undefined?end:start;
      const comment=commentFor(sourceIndex,holding.ticker);
      if(performance!==undefined)profiles.push({symbol,name:`${holding.ticker.toUpperCase()} (PPI MEP fuente ${sourceIndex+1})`,currency:'USD',dataSource:'MANUAL',countries:[],holdings:[],isActive:true,sectors:[],marketData:[{date:start,marketPrice:initialPrice},{date:end,marketPrice:currentPrice}]});
      const snapshot=existing.find(activity=>activity.accountId===accountId&&activity.comment===comment&&activity.type==='BUY');
      if(snapshot&&Number(snapshot.quantity)===holding.quantity&&Number(snapshot.unitPrice)===initialPrice&&sameInstant(snapshot.date,date)){duplicates++;continue;}
      const activity:GhostfolioImportActivity={accountId,type:'BUY',date,symbol,currency:'USD',quantity:holding.quantity,unitPrice:initialPrice,fee:0,dataSource:'MANUAL',comment};
      if(snapshot){if(!snapshot.id)throw new Error('Ghostfolio MEP holding projection activity is missing an id');updates.push({...activity,id:snapshot.id});}else activities.push(activity);
    }
  }
  if(options.dryRun)return {prepared:activities.length+updates.length,imported:activities.length,updated:updates.length,duplicates,marketData:profiles.length};
  if(profiles.length>0){if(!ghostfolio.upsertManualAssetProfiles)throw new Error('Ghostfolio client does not support manual market-data projections');await ghostfolio.upsertManualAssetProfiles(profiles);}
  if(activities.length>0){const result=await ghostfolio.importActivities(activities);const validationFailures=result.validationFailures?.length??0;if(validationFailures>0)throw new Error(`Ghostfolio rejected ${validationFailures} MEP holding projection activities`);}
  if(updates.length>0){if(!ghostfolio.updateActivity)throw new Error('Ghostfolio client does not support updating MEP holding projections');for(const update of updates)await ghostfolio.updateActivity(update);}
  return {prepared:activities.length+updates.length,imported:activities.length,updated:updates.length,duplicates,marketData:profiles.length};
}
