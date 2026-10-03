import { PROJECTION_KEY, STATE_VERSION, reducePlan } from './projection.js';
import { planStateSchema } from './schema.js';

export const name = 'plan-keeper';
export const inject = ['sessionProjections'];

export function apply(ctx) {
  ctx.sessionProjections.register({
    key: PROJECTION_KEY,
    stateSchema: planStateSchema,
    init: () => null,
    apply: reducePlan,
    wire: { viewSchema: planStateSchema, view: state => state },
    stateVersion: STATE_VERSION,
  });
}
