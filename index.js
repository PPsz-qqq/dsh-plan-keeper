import { z } from 'zod';
import { PROJECTION_KEY, reducePlan } from './projection.js';

export const name = 'plan-keeper';
export const inject = ['sessionProjections'];

const schema = z.object({
  todos: z.array(z.object({
    content: z.string(),
    status: z.enum(['pending', 'in_progress', 'completed']),
  })),
  seq: z.number().int().nonnegative(),
  updatedAt: z.number(),
  stopReason: z.string().nullable(),
  stopMessage: z.string().nullable(),
}).nullable();

export function apply(ctx) {
  ctx.sessionProjections.register({
    key: PROJECTION_KEY,
    stateSchema: schema,
    init: () => null,
    apply: reducePlan,
    wire: { viewSchema: schema, view: state => state },
    stateVersion: 1,
  });
}
