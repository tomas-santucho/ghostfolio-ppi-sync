import { z } from 'zod';
export const activitySchema=z.object({id:z.string().optional(),accountId:z.string().optional(),type:z.string().optional(),date:z.string().optional(),symbol:z.string().optional(),quantity:z.number().optional(),unitPrice:z.number().optional(),fee:z.number().optional(),currency:z.string().optional(),comment:z.string().optional()}).passthrough();
export const activitiesSchema=z.array(activitySchema);
export const importResponseSchema=z.object({}).passthrough();
