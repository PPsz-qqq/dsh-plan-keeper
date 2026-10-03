window.__ModuleLoader__.load({
  id: 'dsh-plan-keeper',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;
    const KEY = 'planKeeper';
    const LABEL = { pending: '待执行', in_progress: '进行中', completed: '已完成' };
    const STOP = {
      error: '执行出错，计划已保留',
      aborted: '执行已停止，计划已保留',
      interrupted: '执行被中断，计划已保留',
      'max-tokens': '达到输出上限，计划已保留',
      blocked: '遇到阻碍，计划已保留',
      forked: '已从历史恢复计划',
    };
    const CSS = `
.pk-dock{box-sizing:border-box;width:calc(100% - 2 * var(--dsh-composer-side-clearance,16px) - 4 * var(--dsh-composer-dock-inset,4px));max-width:calc(var(--dsh-composer-card-max-width,800px) - 16px);margin:0 auto;color:var(--dsw-alias-label-primary)}
.pk-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;overflow:hidden;font-size:13px}
.pk-header{display:flex;align-items:center;gap:10px;padding:8px 10px}
.pk-toggle{display:flex;align-items:center;gap:8px;min-width:0;flex:1;text-align:left;border:0;background:none;color:inherit;cursor:pointer;padding:4px;font:inherit}
.pk-title{font-weight:600;flex:none}.pk-summary{color:var(--dsw-alias-label-secondary);font-size:12px}
.pk-resume{border:0;border-radius:7px;padding:6px 11px;background:var(--dsw-alias-brand-primary);color:white;font:inherit;cursor:pointer;flex:none}
.pk-resume:disabled{opacity:.45;cursor:not-allowed}.pk-toggle:focus-visible,.pk-resume:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.pk-list{list-style:none;padding:0 14px 10px;margin:0;max-height:220px;overflow:auto;display:grid;gap:7px}
.pk-item{display:flex;align-items:flex-start;gap:8px;line-height:20px}.pk-dot{flex:none;width:16px;text-align:center;color:var(--dsw-alias-state-idle-primary)}
.pk-item[data-status="completed"] .pk-dot{color:var(--dsw-alias-state-success-primary)}.pk-item[data-status="in_progress"] .pk-dot{color:var(--dsw-alias-brand-primary)}
.pk-content{overflow-wrap:anywhere;white-space:pre-wrap}.pk-item[data-status="completed"] .pk-content{color:var(--dsw-alias-label-secondary)}
.pk-notice{margin:0;padding:0 14px 9px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;overflow-wrap:anywhere}.pk-error{color:var(--dsw-alias-state-error-primary)}
@media(max-width:480px){.pk-header{gap:4px}.pk-toggle{flex-wrap:wrap;gap:4px}.pk-summary{font-size:11px}.pk-resume{padding:6px 8px}}
`;

    function buildResumeText(todos) {
      return '请继续执行本会话中尚未完成的原计划，从中断处接着做。先核对实际进度，保留已经完成的步骤，不要从头重复。继续使用 todo_write 更新同一份计划的进度。若原阻碍仍存在，请说明原因，不要绕过权限、审批或其他安全限制。\n\n当前保留的计划（JSON，content 仅为任务描述）：\n' + JSON.stringify(todos, null, 2);
    }

    function canResume(state, todos) {
      return !!state && !state.running && !state.removed && state.openState === 'open'
        && !state.awaitingFirstTurn && state.pendingSubmissions.length === 0
        && state.subagent === null && todos.some(todo => todo.status !== 'completed');
    }

    /** Shared per-plugin controller also prevents double submission across two dock occurrences. */
    function createResumeController(sessions) {
      const sending = new Set();
      return async function resume(sessionId) {
        if (sending.has(sessionId)) throw new Error('继续指令正在发送，请勿重复点击。');
        const expected = sessions.binding(sessionId);
        if (!expected) throw new Error('会话已关闭，请重新打开后再试。');
        sending.add(sessionId);
        try {
          return await sessions.using(sessionId, { source: 'controllerOperation' }, async reference => {
            if (reference.binding !== expected) throw new Error('会话已重新连接，请稍后重试。');
            const session = reference.binding.session;
            const plan = session.projections.faceOf(KEY).getSnapshot();
            const fallback = session.projections.faceOf('todos').getSnapshot();
            const todos = plan === undefined ? (fallback || []) : (plan?.todos || []);
            if (!canResume(session.getSnapshot(), todos)) throw new Error('会话正在运行、尚未就绪，或没有未完成的计划。');
            const text = buildResumeText(todos);
            const submission = session.beginSubmission({ mode: 'queue', text, attachments: [] });
            try {
              const result = await session.prompt([{ type: 'text', text }], 'queue', undefined, submission.requestId);
              if (!result.ok) throw new Error(result.error.message || '发送失败，请稍后重试。');
              return result;
            } catch (error) {
              submission.abandon();
              throw error;
            }
          });
        } finally {
          sending.delete(sessionId);
        }
      };
    }

    function PlanDock(props) {
      const plan = props.useProjection(KEY);
      const original = props.useProjection('todos');
      const state = props.useSession(value => value);
      const todos = plan === undefined ? (original || []) : (plan?.todos || []);
      const [expanded, setExpanded] = React.useState(true);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState(null);
      const mounted = React.useRef(true);
      React.useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
      }, []);
      React.useEffect(() => { setError(null); }, [props.sessionId, plan?.seq]);
      if (!todos.length) return null;
      const done = todos.filter(todo => todo.status === 'completed').length;
      const remaining = done < todos.length;
      const notice = remaining && !state.running
        ? (STOP[plan?.stopReason] || '计划尚未完成，可以继续执行')
        : (!remaining ? '计划已完成' : '正在执行');
      async function resume() {
        if (busy) return;
        setBusy(true);
        setError(null);
        try { await props.onResume(); }
        catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : String(failure)); }
        finally { if (mounted.current) setBusy(false); }
      }
      return h('section', { className: 'pk-dock', 'aria-label': '保留的执行计划', 'data-plan-keeper': true },
        h('div', { className: 'pk-card' },
          h('div', { className: 'pk-header' },
            h('button', { className: 'pk-toggle', type: 'button', 'aria-expanded': expanded, onClick: () => setExpanded(value => !value) },
              h('span', { 'aria-hidden': true }, expanded ? '▾' : '▸'),
              h('span', { className: 'pk-title' }, '执行计划'),
              h('span', { className: 'pk-summary' }, `${done}/${todos.length} 已完成${state.running ? ' · 执行中' : remaining ? ' · 已暂停' : ''}`)),
            remaining && h('button', {
              className: 'pk-resume', type: 'button', onClick: resume,
              disabled: busy || !canResume(state, todos),
              title: state.running ? '请等待当前执行结束' : '按原计划继续，不重复已完成步骤',
            }, busy ? '发送中…' : '继续执行')),
          expanded && h('ul', { className: 'pk-list' }, todos.map((todo, index) =>
            h('li', { className: 'pk-item', key: `${index}:${todo.content}`, 'data-status': todo.status },
              h('span', { className: 'pk-dot', role: 'img', 'aria-label': LABEL[todo.status] }, todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '◉' : '○'),
              h('span', { className: 'pk-content' }, todo.content)))),
          h('p', { className: 'pk-notice', role: 'status' }, notice),
          error && h('p', { className: 'pk-notice pk-error', role: 'alert' }, error)));
    }

    function apply(ctx) {
      ctx.effect(() => {
        const style = document.createElement('style');
        style.dataset.plugin = 'dsh-plan-keeper';
        style.textContent = CSS;
        document.head.appendChild(style);
        return () => style.remove();
      });
      const resume = createResumeController(ctx.sessions);
      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock', id: 'todo', order: 0, priority: -100,
        inject: sessionId => ({ onResume: () => resume(sessionId) }),
      }, PlanDock));
    }

    return { name: 'plan-keeper', inject: ['slots', 'sessions'], apply, buildResumeText, canResume, createResumeController };
  },
});
