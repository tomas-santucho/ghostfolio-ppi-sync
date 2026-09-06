export interface PpiTransaction { agreementDate:string; settlementDate?:string; currency:string; amount:number; price:number; description:string; ticker?:string; quantity:number; balance:number; }
export interface PpiToken { accessToken:string; refreshToken:string; tokenType:string; expires:number; }
export interface PpiInstrument { ticker:string; description:string; currency:string; type:string; market:string; isin?:string|null; }
export interface PpiClient { authenticate():Promise<void>; getTransactions(options:{accountId:string;from?:Date;to?:Date}):Promise<PpiTransaction[]>; getAccount(accountId:string):Promise<PpiAccountBalance[]>; searchInstrument?(ticker:string):Promise<PpiInstrument[]>; }
export interface PpiHolding { name:string; simbol?:string; amount:number; settlement:string; }
export interface PpiAccountBalance { currency:string; availability:PpiHolding[]; }
