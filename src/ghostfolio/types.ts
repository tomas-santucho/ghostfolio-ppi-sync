export interface GhostfolioActivity { id?:string; accountId?:string; type?:string; date?:string; symbol?:string; quantity?:number; unitPrice?:number; fee?:number; currency?:string; comment?:string; [key:string]:unknown; }
export interface GhostfolioImportActivity { accountId:string; type:string; date:string; symbol?:string; quantity?:number; unitPrice?:number; fee?:number; currency:string; dataSource?:string; comment?:string; }
export interface GhostfolioImportResult { dryRun:boolean; imported:number; activities:GhostfolioActivity[]; validationFailures?:GhostfolioActivity[]; }
export interface GhostfolioClient { getActivities():Promise<GhostfolioActivity[]>; importActivities(activities:GhostfolioImportActivity[],options?:{dryRun?:boolean}):Promise<GhostfolioImportResult>; }
