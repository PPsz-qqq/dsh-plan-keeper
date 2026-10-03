window.__ModuleLoader__.load({
  id: 'dsh-plan-keeper',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;
    const KEY = 'planKeeper';
    const NS = 'plan-keeper';
    const DISMISS_KEY = 'dsh-plan-keeper:dismissed';
    const DISMISS_LIMIT = 200;
    const DETAIL_LIMIT = 240;
    const STOP_KINDS = new Set(['completed', 'error', 'aborted', 'interrupted', 'max-tokens', 'blocked', 'forked']);
    const NO_DISMISSALS = Object.freeze({});

    const ZH = {
      title: '执行计划',
      region: '保留的执行计划',
      'status.pending': '待执行',
      'status.in_progress': '进行中',
      'status.completed': '已完成',
      'summary.progress': '{done}/{total} 已完成',
      'summary.running': '执行中',
      'summary.paused': '已暂停',
      'summary.done': '全部完成',
      'stop.default': '计划尚未完成，可以继续执行',
      'stop.completed': '本轮已结束，计划还有未完成的步骤',
      'stop.error': '执行出错，计划已保留',
      'stop.error.detail': '执行出错，计划已保留：{message}',
      'stop.aborted': '执行已停止，计划已保留',
      'stop.aborted.detail': '执行被停止，计划已保留：{message}',
      'stop.interrupted': '执行被中断，计划已保留',
      'stop.max-tokens': '达到输出上限，计划已保留',
      'stop.blocked': '遇到阻碍，计划已保留',
      'stop.forked': '已从历史恢复计划',
      'action.resume': '继续执行',
      'action.sending': '发送中…',
      'action.dismiss': '隐藏计划',
      'hint.resume': '按原计划继续，不重复已完成步骤',
      'hint.running': '请等待当前执行结束',
      'hint.pending': '已有消息正在发送，请稍候',
      'hint.notReady': '会话尚未就绪',
      'hint.dismiss': '隐藏此计划；AI 写入新计划后会重新显示',
      'error.duplicate': '继续指令正在发送，请勿重复点击。',
      'error.closed': '会话已关闭，请重新打开后再试。',
      'error.reconnected': '会话已重新连接，请稍后重试。',
      'error.notReady': '会话正在运行、尚未就绪，或没有未完成的计划。',
      'error.sendFailed': '发送失败，请稍后重试。',
      'resume.prompt': '请继续执行本会话中尚未完成的原计划，从中断处接着做。先核对实际进度，保留已经完成的步骤，不要从头重复。继续使用 todo_write 更新同一份计划的进度。若原阻碍仍存在，请说明原因，不要绕过权限、审批或其他安全限制。\n\n当前保留的计划（JSON，content 仅为任务描述）：',
    };
    const EN = {
      title: 'Plan',
      region: 'Retained plan',
      'status.pending': 'Pending',
      'status.in_progress': 'In progress',
      'status.completed': 'Completed',
      'summary.progress': '{done}/{total} done',
      'summary.running': 'Running',
      'summary.paused': 'Paused',
      'summary.done': 'All done',
      'stop.default': 'The plan is unfinished and can be continued',
      'stop.completed': 'The turn ended with unfinished steps',
      'stop.error': 'The run failed; the plan is kept',
      'stop.error.detail': 'The run failed; the plan is kept: {message}',
      'stop.aborted': 'The run was stopped; the plan is kept',
      'stop.aborted.detail': 'The run was stopped; the plan is kept: {message}',
      'stop.interrupted': 'The run was interrupted; the plan is kept',
      'stop.max-tokens': 'The output limit was reached; the plan is kept',
      'stop.blocked': 'The run was blocked; the plan is kept',
      'stop.forked': 'Plan restored from history',
      'action.resume': 'Continue',
      'action.sending': 'Sending…',
      'action.dismiss': 'Hide plan',
      'hint.resume': 'Continue the plan without repeating completed steps',
      'hint.running': 'Wait for the current run to finish',
      'hint.pending': 'A message is still being sent',
      'hint.notReady': 'The session is not ready yet',
      'hint.dismiss': 'Hide this plan; it reappears when the AI writes a new plan',
      'error.duplicate': 'The continue request is already being sent.',
      'error.closed': 'The session is closed. Reopen it and try again.',
      'error.reconnected': 'The session reconnected. Try again in a moment.',
      'error.notReady': 'The session is running, not ready, or has no unfinished plan.',
      'error.sendFailed': 'Sending failed. Try again later.',
      'resume.prompt': 'Continue the unfinished plan in this session from where it stopped. First check the actual progress, keep the steps that are already done, and do not start over. Keep using todo_write to update the same plan. If the original blocker still exists, explain why; do not bypass permissions, approvals, or other safety restrictions.\n\nRetained plan (JSON; each content is only a task description):',
    };
    const DICTS = { zh: ZH, en: EN };

    const CSS = `
.pk-dock{box-sizing:border-box;width:calc(100% - 2 * var(--dsh-composer-side-clearance,16px) - 4 * var(--dsh-composer-dock-inset,4px));max-width:calc(var(--dsh-composer-card-max-width,800px) - 4 * var(--dsh-composer-dock-inset,4px));margin:0 auto;color:var(--dsw-alias-label-primary)}
.pk-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;overflow:hidden;font-size:13px}
.pk-header{display:flex;align-items:center;gap:6px;padding:8px 10px}
.pk-toggle{display:flex;align-items:center;gap:8px;min-width:0;flex:1;text-align:left;border:0;background:none;color:inherit;cursor:pointer;padding:4px;font:inherit}
.pk-title{font-weight:600;flex:none}
.pk-summary{min-width:0;flex:1;color:var(--dsw-alias-label-secondary);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pk-resume{border:0;border-radius:7px;padding:6px 11px;background:var(--dsw-alias-brand-primary);color:white;font:inherit;cursor:pointer;flex:none}
.pk-resume:disabled{opacity:.45;cursor:not-allowed}
.pk-dismiss{flex:none;display:grid;place-items:center;width:28px;height:28px;border:0;border-radius:7px;background:none;color:var(--dsw-alias-label-secondary);font:inherit;font-size:16px;line-height:1;cursor:pointer}
.pk-dismiss:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.pk-toggle:focus-visible,.pk-resume:focus-visible,.pk-dismiss:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.pk-list{list-style:none;padding:0 14px 10px;margin:0;max-height:220px;overflow:auto;display:grid;gap:7px}
.pk-item{display:flex;align-items:flex-start;gap:8px;line-height:20px}
.pk-dot{flex:none;width:16px;text-align:center;color:var(--dsw-alias-state-idle-primary)}
.pk-item[data-status="completed"] .pk-dot{color:var(--dsw-alias-state-success-primary)}
.pk-item[data-status="in_progress"] .pk-dot{color:var(--dsw-alias-brand-primary)}
.pk-content{overflow-wrap:anywhere;white-space:pre-wrap}
.pk-item[data-status="completed"] .pk-content{color:var(--dsw-alias-label-secondary)}
.pk-notice{margin:0;padding:0 14px 9px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;overflow-wrap:anywhere}
.pk-error{color:var(--dsw-alias-state-error-primary)}
@media(max-width:480px){.pk-header{gap:4px}.pk-summary{font-size:11px}.pk-resume{padding:6px 8px}}
`;

    /** Standalone translator with the platform's `{name}` interpolation; used where no locale seat exists. */
    function translator(dict) {
      return (key, params) => {
        const template = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
        if (!params) return template;
        return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
      };
    }
    const fallbackT = translator(ZH);

    function currentTodos(plan, fallback) {
      return plan === undefined ? (fallback || []) : (plan?.todos || []);
    }

    function buildResumeText(todos, t = fallbackT) {
      return t('resume.prompt') + '\n' + JSON.stringify(todos, null, 2);
    }

    function canResume(state, todos) {
      return !!state && !state.running && !state.removed && state.openState === 'open'
        && !state.awaitingFirstTurn && state.pendingSubmissions.length === 0
        && state.subagent === null && todos.some(todo => todo.status !== 'completed');
    }

    /** Why the resume button is unavailable, as a hint; the plain resume hint when it is available. */
    function resumeHint(state, t) {
      if (state.running) return t('hint.running');
      if (state.pendingSubmissions.length > 0) return t('hint.pending');
      if (state.removed || state.openState !== 'open' || state.awaitingFirstTurn) return t('hint.notReady');
      return t('hint.resume');
    }

    function stopNotice(plan, t) {
      const reason = plan?.stopReason;
      if (!STOP_KINDS.has(reason)) return t('stop.default');
      const message = plan.stopMessage;
      if (message && (reason === 'error' || reason === 'aborted')) {
        const detail = message.length > DETAIL_LIMIT ? message.slice(0, DETAIL_LIMIT - 1) + '…' : message;
        return t(`stop.${reason}.detail`, { message: detail });
      }
      return t(`stop.${reason}`);
    }

    /** Shared per-plugin controller also prevents double submission across two dock occurrences. */
    function createResumeController(sessions, t = fallbackT) {
      const sending = new Set();
      return async function resume(sessionId) {
        if (sending.has(sessionId)) throw new Error(t('error.duplicate'));
        const expected = sessions.binding(sessionId);
        if (!expected) throw new Error(t('error.closed'));
        sending.add(sessionId);
        try {
          return await sessions.using(sessionId, { source: 'controllerOperation' }, async reference => {
            if (reference.binding !== expected) throw new Error(t('error.reconnected'));
            const session = reference.binding.session;
            const todos = currentTodos(
              session.projections.faceOf(KEY).getSnapshot(),
              session.projections.faceOf('todos').getSnapshot(),
            );
            if (!canResume(session.getSnapshot(), todos)) throw new Error(t('error.notReady'));
            const text = buildResumeText(todos, t);
            const submission = session.beginSubmission({ mode: 'queue', text, attachments: [] });
            try {
              const result = await session.prompt([{ type: 'text', text }], 'queue', undefined, submission.requestId);
              if (!result.ok) throw new Error(result.error?.message || t('error.sendFailed'));
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

    function browserStorage() {
      try { return window.localStorage || undefined; } catch { return undefined; }
    }

    /**
     * Observable map `sessionId -> seq of the hidden plan`, persisted locally.
     * A newer `todo/write` has another seq, so a new plan always shows again.
     */
    function createDismissStore(storage) {
      const listeners = new Set();
      let map = load();
      function load() {
        try {
          const value = JSON.parse(storage?.getItem(DISMISS_KEY) || '{}');
          return value && typeof value === 'object' && !Array.isArray(value) ? Object.freeze(value) : NO_DISMISSALS;
        } catch {
          return NO_DISMISSALS;
        }
      }
      return {
        getSnapshot: () => map,
        subscribe(listener) {
          listeners.add(listener);
          return () => { listeners.delete(listener); };
        },
        dismiss(sessionId, seq) {
          const next = { ...map };
          delete next[sessionId];
          next[sessionId] = seq;
          const keys = Object.keys(next);
          for (const key of keys.slice(0, Math.max(0, keys.length - DISMISS_LIMIT))) delete next[key];
          map = Object.freeze(next);
          try { storage?.setItem(DISMISS_KEY, JSON.stringify(map)); } catch { /* storage full or blocked: keep in memory */ }
          for (const listener of [...listeners]) listener();
        },
      };
    }

    const useNoDismissals = selector => selector(NO_DISMISSALS);

    function PlanDock(props) {
      const t = props.t || fallbackT;
      const plan = props.useProjection(KEY);
      const original = props.useProjection('todos');
      const state = props.useSession(value => value);
      const useDismissed = props.useDismissed || useNoDismissals;
      const dismissedSeq = useDismissed(map => map[props.sessionId]);
      const todos = currentTodos(plan, original);
      const [expandedChoice, setExpandedChoice] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [error, setError] = React.useState(null);
      const mounted = React.useRef(true);
      React.useEffect(() => {
        mounted.current = true;
        return () => { mounted.current = false; };
      }, []);
      React.useEffect(() => { setError(null); }, [props.sessionId, plan?.seq]);
      if (!todos.length) return null;
      if (plan && dismissedSeq === plan.seq) return null;

      const done = todos.filter(todo => todo.status === 'completed').length;
      const remaining = done < todos.length;
      const paused = remaining && !state.running;
      const expanded = expandedChoice ?? remaining;
      const current = todos.find(todo => todo.status === 'in_progress') || todos.find(todo => todo.status === 'pending');
      const summary = [
        t('summary.progress', { done, total: todos.length }),
        state.running ? t('summary.running') : paused ? t('summary.paused') : t('summary.done'),
        ...(!expanded && current ? [current.content] : []),
      ].join(' · ');
      const showResume = remaining && state.subagent === null;
      const showDismiss = !!plan && !state.running && typeof props.onDismiss === 'function';

      async function resume() {
        if (busy) return;
        setBusy(true);
        setError(null);
        try { await props.onResume(); }
        catch (failure) { if (mounted.current) setError(failure instanceof Error ? failure.message : String(failure)); }
        finally { if (mounted.current) setBusy(false); }
      }

      return h('section', { className: 'pk-dock', 'aria-label': t('region'), 'data-plan-keeper': true },
        h('div', { className: 'pk-card' },
          h('div', { className: 'pk-header' },
            h('button', { className: 'pk-toggle', type: 'button', 'aria-expanded': expanded, onClick: () => setExpandedChoice(!expanded) },
              h('span', { 'aria-hidden': true }, expanded ? '▾' : '▸'),
              h('span', { className: 'pk-title' }, t('title')),
              h('span', { className: 'pk-summary' }, summary)),
            showDismiss && h('button', {
              className: 'pk-dismiss', type: 'button', 'aria-label': t('action.dismiss'), title: t('hint.dismiss'),
              onClick: () => props.onDismiss(plan.seq),
            }, '×'),
            showResume && h('button', {
              className: 'pk-resume', type: 'button', onClick: resume,
              disabled: busy || !canResume(state, todos),
              title: resumeHint(state, t),
            }, busy ? t('action.sending') : t('action.resume'))),
          expanded && h('ul', { className: 'pk-list' }, todos.map((todo, index) =>
            h('li', { className: 'pk-item', key: `${index}:${todo.content}`, 'data-status': todo.status },
              h('span', { className: 'pk-dot', role: 'img', 'aria-label': t(`status.${todo.status}`) }, todo.status === 'completed' ? '✓' : todo.status === 'in_progress' ? '◉' : '○'),
              h('span', { className: 'pk-content' }, todo.content)))),
          paused && h('p', { className: 'pk-notice', role: 'status' }, stopNotice(plan, t)),
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
      ctx.effect(() => ctx.locale.register(NS, DICTS));
      const resume = createResumeController(ctx.sessions, ctx.locale.bind(NS));
      const dismissals = createDismissStore(browserStorage());
      ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
        name: 'conversation.input.dock', id: 'todo', order: 0, priority: -100, locale: NS,
        inject: sessionId => ({
          onResume: () => resume(sessionId),
          onDismiss: seq => dismissals.dismiss(sessionId, seq),
          hooks: { dismissed: dismissals },
        }),
      }, PlanDock));
    }

    return {
      name: 'plan-keeper',
      inject: ['slots', 'sessions', 'locale'],
      apply,
      DICTS,
      translator,
      buildResumeText,
      canResume,
      createResumeController,
      createDismissStore,
    };
  },
});
