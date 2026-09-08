export type TransactionType = 'BUY'|'SELL'|'DIVIDEND'|'INTEREST'|'FEE'|'DEPOSIT'|'WITHDRAWAL';
export interface ResolvedInstrument { sourceSymbol:string; canonicalIsin?:string; market:string; instrumentType:string; tradingCurrency:'ARS'|'USD'; ghostfolioSymbol:string; dataSource:'YAHOO'|'MANUAL'; }
export interface NormalizedTransaction { id:string; accountId:string; type:TransactionType; symbol?:string; sourceSymbol?:string; isin?:string; market?:string; dataSource?:string; instrumentType?:string; currency:string; date:Date; quantity?:string; unitPrice?:string; fee?:string; externalId?:string; sourceBalance?:string; description?:string; source:'ppi'; }

export interface PpiTransactionInput { type:string; date:string; currency:string; symbol?:string; isin?:string; quantity?:string; unitPrice?:string; fee?:string; externalId?:string; description?:string; }
