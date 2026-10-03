export const PROJECTION_KEY = 'planKeeper';

/** Pure replay: plans survive turn/start; only a new todo/write replaces them. */
export function reducePlan(state, event) {
  if (event.type === 'todo/write') {
    const todos = event.data.todos.map(({ content, status }) => ({ content, status }));
    if (todos.length === 0) return null;
    return { todos, seq: event.seq, updatedAt: event.time, stopReason: null, stopMessage: null };
  }
  if (!state) return state;
  if (event.type === 'turn/start') {
    if (state.stopReason === null) return state;
    return { ...state, stopReason: null, stopMessage: null };
  }
  if (event.type === 'turn/end') {
    const reason = event.data.reason;
    return {
      ...state,
      stopReason: reason.kind,
      stopMessage: reason.kind === 'error' ? reason.error.message : null,
    };
  }
  return state;
}
