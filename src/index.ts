import { readFile } from 'node:fs/promises';
import { loadConfig, loadGhostfolioConfig, loadPpiConfig, parseBootstrapCutoffDate, parseSyncRange } from './config.js';
import { importBootstrapHoldings, parseBootstrapHoldings } from './bootstrap.js';
import { GhostfolioHttpClient } from './ghostfolio/client.js';
import { Logger } from './logger.js';
import { PpiHttpClient } from './ppi/client.js';
import { runSync, runSyncForAccounts, SyncRunError, type SyncSummary } from './sync.js';

function report(summary:SyncSummary,logger:Logger):void {
  logger.info(`Fetched: ${summary.fetched}`);
  logger.info(`Mapped: ${summary.mapped}`);
  logger.info(`Imported: ${summary.imported}`);
  logger.info(`Duplicates: ${summary.duplicates}`);
  logger.info(`Unsupported: ${summary.unsupported}`);
  logger.info(`Cash settlements skipped: ${summary.cashSettlementSkipped}`);
  logger.info(`Validation failed: ${summary.validationFailed}`);
  logger.info(`HTTP failed: ${summary.httpFailed}`);
  logger.info(`Unattempted: ${summary.unattempted}`);
  logger.info(`Uncertain: ${summary.uncertain}`);
  if(summary.skippedFingerprints.length>0) logger.warn(`Skipped fingerprints: ${summary.skippedFingerprints.join(', ')}`);
  if(summary.failedFingerprints.length>0) logger.error(`Failed fingerprints: ${summary.failedFingerprints.join(', ')}`);
}
function reportSourceAccount(index:number,summary:SyncSummary,logger:Logger):void {
  logger.info(`Source account ${index} summary: fetched=${summary.fetched}; mapped=${summary.mapped}; imported=${summary.imported}; duplicates=${summary.duplicates}; unsupported=${summary.unsupported}; validationFailed=${summary.validationFailed}; httpFailed=${summary.httpFailed}; unattempted=${summary.unattempted}; uncertain=${summary.uncertain}.`);
}

async function main():Promise<void> {
  const logger=new Logger(process.env.LOG_LEVEL==='debug'||process.env.LOG_LEVEL==='warn'||process.env.LOG_LEVEL==='error'?process.env.LOG_LEVEL:'info');
  if(process.argv.includes('--help')||process.argv.includes('-h')) { console.log('ppi-ghostfolio-sync\n\nCommands:\n  --dry-run                  Validate sync without persisting\n  --ppi-only                 Read PPI movements only\n  --ppi-orders               Read PPI historical order count only\n  --ppi-account              Read PPI positions only\n  --ghostfolio-only          Read Ghostfolio activities only\n  --bootstrap-holdings       Import holdings from BOOTSTRAP_HOLDINGS_FILE\n  --ghostfolio-import-dry-run Validate a synthetic Ghostfolio import'); return; }
  if(process.argv.includes('--bootstrap-holdings')) {
    const file=process.env.BOOTSTRAP_HOLDINGS_FILE;
    if(!file) throw new Error('BOOTSTRAP_HOLDINGS_FILE is required with --bootstrap-holdings');
    const config=loadGhostfolioConfig(process.env);
    const cutoffDate=parseBootstrapCutoffDate(process.env.BOOTSTRAP_CUTOFF_DATE);
    if(!cutoffDate) throw new Error('BOOTSTRAP_CUTOFF_DATE is required with --bootstrap-holdings');
    const holdings=parseBootstrapHoldings(JSON.parse(await readFile(file,'utf8')));
    const dryRun=process.argv.includes('--dry-run')||process.env.DRY_RUN==='true';
    const result=await importBootstrapHoldings(holdings,process.env.PPI_ACCOUNT_ID??'bootstrap',new GhostfolioHttpClient(config),config.accountId,{dryRun,cutoffDate});
    logger.info(`Bootstrap ${dryRun?'validated':'imported'} ${result.imported} holdings; skipped ${result.duplicates} duplicates.`);
    return;
  }
  if(process.argv.includes('--ghostfolio-import-dry-run')) {
    const config=loadGhostfolioConfig(process.env);
    const result=await new GhostfolioHttpClient(config).importActivities([{accountId:config.accountId,type:'BUY',date:'2024-01-01T00:00:00.000Z',symbol:'MSFT',currency:'USD',quantity:1,unitPrice:1,fee:0,dataSource:'YAHOO',comment:'ppi-sync-test-dry-run'}],{dryRun:true});
    logger.info('Ghostfolio import dry-run successful. No data was persisted.');
    logger.info(`Validated activities: ${result.imported}`);
    return;
  }
  if(process.argv.includes('--ghostfolio-only')) { const activities=await new GhostfolioHttpClient(loadGhostfolioConfig(process.env)).getActivities(); logger.info(`Ghostfolio connection successful. Found ${activities.length} activities.`); return; }
  const ppi=loadPpiConfig(process.env); const ppiClient=new PpiHttpClient(ppi);
  if(process.argv.includes('--ppi-account')) { const positions=await ppiClient.getPositions(ppi.accountId); for(const position of positions) logger.info(`${position.ticker}: ${position.quantity} ${position.currency} (price: ${position.price})`); return; }
  const ppiRange=parseSyncRange(process.env.SYNC_FROM_DATE,process.env.SYNC_TO_DATE);
  if(process.argv.includes('--ppi-only')) { const transactions=await ppiClient.getTransactions({accountId:ppi.accountId,...ppiRange}); logger.info(`PPI connection successful. Found ${transactions.length} movements.`); return; }
  if(process.argv.includes('--ppi-orders')) { const orders=await ppiClient.getOrders({accountId:ppi.accountId,...ppiRange}); logger.info(`PPI connection successful. Found ${orders.length} historical orders.`); return; }
  const config=loadConfig({...process.env,DRY_RUN:process.argv.includes('--dry-run')?'true':process.env.DRY_RUN});
  const ghostfolio=new GhostfolioHttpClient(config.ghostfolio);
  const summary=config.ppi.accountIds.length>1?await runSyncForAccounts(ppiClient,ghostfolio,config.ppi.accountIds,{ghostfolioAccountId:config.ghostfolio.accountId,from:config.syncFromDate,to:config.syncToDate,dryRun:config.dryRun,enrichOrders:config.ppi.orderEnrichment,symbolOverrides:config.symbolOverrides,cashAssets:config.cashAssets,cashActivityImport:config.cashActivityImport,warn:message=>logger.warn(message),onAccountComplete:(index,result)=>reportSourceAccount(index,result,logger)}):await runSync(ppiClient,ghostfolio,{ppiAccountId:config.ppi.accountId,ghostfolioAccountId:config.ghostfolio.accountId,from:config.syncFromDate,to:config.syncToDate,dryRun:config.dryRun,enrichOrders:config.ppi.orderEnrichment,symbolOverrides:config.symbolOverrides,cashAssets:config.cashAssets,cashActivityImport:config.cashActivityImport,warn:message=>logger.warn(message)});
  report(summary,logger); logger.info(config.dryRun?'Dry-run completed.':'Sync completed successfully.');
}
void main().catch(error=>{if(error instanceof SyncRunError){const logger=new Logger(process.env.LOG_LEVEL==='debug'||process.env.LOG_LEVEL==='warn'||process.env.LOG_LEVEL==='error'?process.env.LOG_LEVEL:'info');logger.error(error.message);report(error.summary,logger);}else console.error(error instanceof Error?error.message:'Fatal error');process.exitCode=1;});
