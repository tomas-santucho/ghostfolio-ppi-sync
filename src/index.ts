import { readFile } from 'node:fs/promises';
import { loadConfig, loadGhostfolioConfig, loadPpiConfig } from './config.js';
import { bootstrapHoldings, parseBootstrapHoldings } from './bootstrap.js';
import { GhostfolioHttpClient } from './ghostfolio/client.js';
import { Logger } from './logger.js';
import { PpiHttpClient } from './ppi/client.js';
import { runSync, runSyncForAccounts } from './sync.js';

async function main():Promise<void> {
  const logger=new Logger(process.env.LOG_LEVEL==='debug'||process.env.LOG_LEVEL==='warn'||process.env.LOG_LEVEL==='error'?process.env.LOG_LEVEL:'info');
  if(process.argv.includes('--help')||process.argv.includes('-h')) { console.log('ppi-ghostfolio-sync\n\nCommands:\n  --dry-run                  Validate sync without persisting\n  --ppi-only                 Read PPI movements only\n  --ppi-orders               Read PPI historical order count only\n  --ppi-account              Read PPI positions only\n  --ghostfolio-only          Read Ghostfolio activities only\n  --bootstrap-holdings       Import holdings from BOOTSTRAP_HOLDINGS_FILE\n  --ghostfolio-import-dry-run Validate a synthetic Ghostfolio import'); return; }
  if(process.argv.includes('--bootstrap-holdings')) {
    const file=process.env.BOOTSTRAP_HOLDINGS_FILE;
    if(!file) throw new Error('BOOTSTRAP_HOLDINGS_FILE is required with --bootstrap-holdings');
    const config=loadGhostfolioConfig(process.env);
    const holdings=parseBootstrapHoldings(JSON.parse(await readFile(file,'utf8')));
    const result=await new GhostfolioHttpClient(config).importActivities(bootstrapHoldings(holdings,process.env.PPI_ACCOUNT_ID??'bootstrap',config.accountId),{dryRun:process.argv.includes('--dry-run')});
    logger.info(`Bootstrap ${result.dryRun?'validated':'imported'} ${holdings.length} holdings.`);
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
  if(process.argv.includes('--ppi-only')) { const transactions=await ppiClient.getTransactions({accountId:ppi.accountId}); logger.info(`PPI connection successful. Found ${transactions.length} movements.`); return; }
  if(process.argv.includes('--ppi-orders')) { const orders=await ppiClient.getOrders({accountId:ppi.accountId}); logger.info(`PPI connection successful. Found ${orders.length} historical orders.`); return; }
  const config=loadConfig({...process.env,DRY_RUN:process.argv.includes('--dry-run')?'true':process.env.DRY_RUN});
  const ghostfolio=new GhostfolioHttpClient(config.ghostfolio);
  const summary=config.ppi.accountIds.length>1?await runSyncForAccounts(ppiClient,ghostfolio,config.ppi.accountIds,config.accountMap,{from:config.syncFromDate,dryRun:config.dryRun,enrichOrders:config.ppi.orderEnrichment,symbolOverrides:config.symbolOverrides,cashAssets:config.cashAssets,warn:message=>logger.warn(message)}):await runSync(ppiClient,ghostfolio,{ppiAccountId:config.ppi.accountId,ghostfolioAccountId:config.ghostfolio.accountId,from:config.syncFromDate,dryRun:config.dryRun,enrichOrders:config.ppi.orderEnrichment,symbolOverrides:config.symbolOverrides,cashAssets:config.cashAssets,warn:message=>logger.warn(message)});
  logger.info(`Found ${summary.fetched} PPI transactions.`); logger.info(`New activities: ${summary.imported}`); logger.info(`Skipped duplicates: ${summary.duplicates}`); logger.info(`Unsupported: ${summary.unsupported}`); logger.info(config.dryRun?'Dry-run completed.':'Sync completed successfully.');
}
void main().catch(error=>{console.error(error instanceof Error?error.message:'Fatal error');process.exitCode=1;});
