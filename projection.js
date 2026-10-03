export const PROJECTION_KEY = 'planKeeper';

/**
 * Bump whenever the fold semantics or the state shape change: persisted
 * checkpoint rows with another version are discarded and refolded from the log.
 * 2: a fully completed plan is dropped when the next turn starts; a hook abort keeps its reason.
 */
export const STATE_VERSION = 2;

function isFinished(todos) {
  return todos.every(todo => todo.status === 'completed');
}

/** Human-readable detail for a stop, when the event carries one. */
function stopDetail(reason) {
  if (reason.kind === 'error') return reason.error?.message || null;
  if (reason.kind === 'aborted' && reason.reason?.kind === 'hook') return reason.reason.reason || null;
  return null;
}

/**
 * Pure replay. An unfinished plan survives every turn boundary and failure;
 * a finished plan stays visible until the next turn starts; only a new
 * `todo/write` replaces a plan, and an empty write clears it.
 */
export function reducePlan(state, event) {
  if (event.type === 'todo/write') {
    const todos = event.data.todos.map(({ content, status }) => ({ content, status }));
    if (todos.length === 0) return null;
    return { todos, seq: event.seq, updatedAt: event.time, stopReason: null, stopMessage: null };
  }
  if (!state) return state;
  if (event.type === 'turn/start') {
    if (isFinished(state.todos)) return null;
    if (state.stopReason === null) return state;
    return { ...state, stopReason: null, stopMessage: null };
  }
  if (event.type === 'turn/end') {
    const reason = event.data.reason;
    return { ...state, stopReason: reason.kind, stopMessage: stopDetail(reason) };
  }
  return state;
}
