export class ConfigurationError extends Error { constructor(message:string){super(message);this.name='ConfigurationError';} }
export class FatalSyncError extends Error { constructor(message:string,options?:ErrorOptions){super(message,options);this.name='FatalSyncError';} }
export function sanitizeHttpDetail(detail:string):string{return detail.replace(/((?:authorization|accessToken|securityToken|privateKey|password|apiSecret)\s*["']?\s*[:=]\s*["']?)(?:bearer\s+)?[^\s,}"']+/gi,'$1[REDACTED]').slice(0,500);}
