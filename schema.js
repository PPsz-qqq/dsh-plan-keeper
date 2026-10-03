import { z } from 'zod';

/** State and wire view of the `planKeeper` projection: the retained plan, or null. */
export const planStateSchema = z.object({
  todos: z.array(z.object({
    content: z.string(),
    status: z.enum(['pending', 'in_progress', 'completed']),
  })),
  seq: z.number().int().nonnegative(),
  updatedAt: z.number(),
  stopReason: z.string().nullable(),
  stopMessage: z.string().nullable(),
}).nullable();
