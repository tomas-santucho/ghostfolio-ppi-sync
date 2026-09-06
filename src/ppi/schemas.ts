import { z } from 'zod';
export const tokenSchema=z.object({accessToken:z.string().min(1),refreshToken:z.string().min(1),tokenType:z.string().min(1),expires:z.number()});
export const transactionSchema=z.object({agreementDate:z.string(),settlementDate:z.string().optional(),currency:z.string(),amount:z.number(),price:z.number(),description:z.string(),ticker:z.string().optional(),quantity:z.number(),balance:z.number()});
export const transactionsSchema=z.array(transactionSchema);
export const balancesSchema=z.array(z.object({currency:z.string(),availability:z.array(z.object({name:z.string(),simbol:z.string().optional(),amount:z.number(),settlement:z.string()}))}));
export const positionSchema=z.object({ticker:z.string(),description:z.string(),currency:z.string(),price:z.number(),amount:z.number(),quantity:z.number(),collateralQuantity:z.number().optional(),isin:z.string().nullable().optional(),cajaValoresCode:z.union([z.string(),z.number()]).nullable().optional(),ppc:z.unknown().optional()}).passthrough();
export const groupedInstrumentsSchema=z.object({name:z.string(),instruments:z.array(positionSchema),groupedValue:z.number()}).passthrough();
export const positionsResponseSchema=z.object({groupedInstruments:z.array(groupedInstrumentsSchema)}).passthrough();
export const instrumentsSchema=z.array(z.object({ticker:z.string(),description:z.string(),currency:z.string(),type:z.string(),market:z.string(),isin:z.string().nullable().optional()}));
