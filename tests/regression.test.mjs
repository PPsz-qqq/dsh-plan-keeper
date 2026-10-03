import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { PROJECTION_KEY, STATE_VERSION, reducePlan } from '../projection.js';

const todos = [
  { content: '检查', status: 'completed' },
  { content: '实现', status: 'in_progress' },
  { content: '测试', status: 'pending' },
];
const finished = todos.map(todo => ({ ...todo, status: 'completed' }));
const event = (type, data, seq = 5) => ({ type, data, seq, time: 1000 });
const write = (list = todos, seq = 5) => event('todo/write', { todos: list }, seq);
const initial = () => reducePlan(null, write());
const ready = (extra = {}) => ({
  running: false, removed: false, openState: 'open', awaitingFirstTurn: false,
  pendingSubmissions: [], subagent: null, ...extra,
});

// ---------------------------------------------------------------- client harness

function loadClient(windowExtra = {}) {
  let plugin;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: value => [typeof value === 'function' ? value() : value, () => {}],
    useEffect: effect => { effect(); },
    useRef: value => ({ current: value }),
  };
  const context = {
    window: { __ModuleLoader__: { load: def => { plugin = def.factory(() => React); } }, ...windowExtra },
    document: {},
    console,
  };
  vm.runInNewContext(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), context);
  return { plugin, context };
}
const { plugin } = loadClient();
const zh = plugin.translator(plugin.DICTS.zh);
const en = plugin.translator(plugin.DICTS.en);

function fixture(state = ready(), send = async () => ({ ok: true }), plan = initial()) {
  const calls = [];
  let abandoned = 0;
  const binding = {
    session: {
      getSnapshot: () => state,
      projections: { faceOf: key => ({ getSnapshot: () => (key === PROJECTION_KEY ? plan : null) }) },
      beginSubmission: input => {
        calls.push(['begin', input]);
        return { requestId: 'request-1', abandon: () => { abandoned++; } };
      },
      prompt: async (...args) => { calls.push(['prompt', ...args]); return send(...args); },
    },
  };
  const sessions = { binding: () => binding, using: async (id, options, fn) => fn({ binding }) };
  return { sessions, binding, calls, abandoned: () => abandoned };
}

function memoryStorage(initialValue) {
  const data = new Map(initialValue === undefined ? [] : [['dsh-plan-keeper:dismissed', initialValue]]);
  return {
    data,
    getItem: key => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => { data.set(key, String(value)); },
  };
}

/** The dock component, captured through the same registration path the runtime uses. */
const PlanDock = (() => {
  const { plugin: p, context } = loadClient();
  let view;
  context.document.createElement = () => ({ dataset: {}, remove() {} });
  context.document.head = { appendChild() {} };
  p.apply({
    sessions: fixture().sessions,
    effect: f => f(),
    locale: { register: () => () => {}, bind: () => zh },
    slots: { inject: (key, f) => f(), register: (options, component) => { view = component; return () => {}; } },
  });
  return view;
})();

/** Render the dock as a plain function with fake hooks and return its element tree. */
function render(options = {}) {
  // `plan: undefined` is meaningful (host half absent), so no default-parameter shortcut here.
  const { plan: _plan, original = null, state = ready(), dismissed = {}, t = zh, ...extra } = options;
  const plan = 'plan' in options ? options.plan : initial();
  return PlanDock({
    sessionId: 'a',
    t,
    useProjection: key => (key === PROJECTION_KEY ? plan : original),
    useSession: select => select(state),
    useDismissed: select => select(dismissed),
    onResume: async () => {},
    onDismiss: () => {},
    ...extra,
  });
}
function walk(node, visit) {
  if (node === null || node === undefined || node === false || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const child of node) walk(child, visit); return; }
  visit(node);
  walk(node.children, visit);
}
function textOf(node) {
  if (node === null || node === undefined || node === false) return '';
  if (typeof node !== 'object') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  return textOf(node.children);
}
function find(tree, className) {
  const found = [];
  walk(tree, node => { if (String(node.props.className || '').split(' ').includes(className)) found.push(node); });
  return found;
}

// ---------------------------------------------------------------- projection

test('no plan in blank history', () => {
  assert.equal(reducePlan(null, event('turn/start', {})), null);
  assert.equal(reducePlan(null, event('turn/end', { reason: { kind: 'completed' } })), null);
});

test('writes detached plan', () => {
  const s = initial();
  assert.deepEqual(s.todos, todos);
  assert.notEqual(s.todos, todos);
  assert.notEqual(s.todos[0], todos[0]);
  assert.equal(s.seq, 5);
  assert.equal(s.updatedAt, 1000);
});

test('new turn preserves an unfinished plan', () => {
  const s = initial();
  assert.equal(reducePlan(s, event('turn/start', {})), s);
});

test('finished plan stays until the next turn starts, then clears', () => {
  const done = reducePlan(initial(), write(finished, 9));
  const ended = reducePlan(done, event('turn/end', { reason: { kind: 'completed' } }));
  assert.deepEqual(ended.todos, finished);
  assert.equal(reducePlan(ended, event('turn/start', {})), null);
});

for (const kind of ['error', 'aborted', 'interrupted', 'blocked', 'max-tokens', 'forked', 'completed']) {
  test('preserves plan after ' + kind, () => {
    const s = initial();
    const n = reducePlan(s, event('turn/end', { reason: { kind, error: { message: 'offline' }, reason: { kind: 'user' } } }));
    assert.deepEqual(n.todos, todos);
    assert.equal(n.stopReason, kind);
    assert.equal(n.stopMessage, kind === 'error' ? 'offline' : null);
    assert.equal(s.stopReason, null);
  });
}

test('hook abort keeps its reason; other aborts carry no message', () => {
  const hook = reducePlan(initial(), event('turn/end', { reason: { kind: 'aborted', reason: { kind: 'hook', reason: 'budget exhausted' } } }));
  assert.equal(hook.stopMessage, 'budget exhausted');
  for (const cause of ['user', 'parent', 'disposed', 'legacy']) {
    const n = reducePlan(initial(), event('turn/end', { reason: { kind: 'aborted', reason: { kind: cause } } }));
    assert.equal(n.stopMessage, null);
  }
  const empty = reducePlan(initial(), event('turn/end', { reason: { kind: 'error', error: { message: '' } } }));
  assert.equal(empty.stopMessage, null);
});

test('resume clears stop reason, not progress', () => {
  const stopped = reducePlan(initial(), event('turn/end', { reason: { kind: 'interrupted' } }));
  const s = reducePlan(stopped, event('turn/start', {}));
  assert.deepEqual(s.todos, todos);
  assert.equal(s.stopReason, null);
  assert.equal(s.stopMessage, null);
});

test('new write replaces and empty write clears', () => {
  const s = reducePlan(initial(), write([{ content: '新计划', status: 'pending' }], 7));
  assert.equal(s.todos[0].content, '新计划');
  assert.equal(s.seq, 7);
  assert.equal(reducePlan(s, write([], 8)), null);
});

test('history replay after restart restores plan', () => {
  const log = [
    write(),
    event('turn/end', { reason: { kind: 'interrupted' } }),
    event('turn/start', {}),
    event('turn/end', { reason: { kind: 'error', error: { message: 'offline' } } }),
  ];
  const s = JSON.parse(JSON.stringify(log)).reduce(reducePlan, null);
  assert.deepEqual(s.todos, todos);
  assert.equal(s.stopReason, 'error');
  assert.equal(s.stopMessage, 'offline');
});

test('sessions have independent plans', () => {
  const a = initial();
  const b = reducePlan(null, write([{ content: 'B', status: 'pending' }]));
  assert.notDeepEqual(a.todos, b.todos);
});

test('unrelated events retain identity', () => {
  const s = initial();
  assert.equal(reducePlan(s, event('assistant/message', {})), s);
  assert.equal(reducePlan(s, event('tool/call', {})), s);
});

test('fold semantics changed, so checkpoint version is bumped', () => {
  assert.equal(STATE_VERSION, 2);
});

test('schema accepts every reducer state', async t => {
  let schema;
  try { ({ planStateSchema: schema } = await import('../schema.js')); }
  catch { t.skip('zod is not installed; run npm install to check the schema'); return; }
  const states = [
    null,
    initial(),
    reducePlan(initial(), event('turn/end', { reason: { kind: 'error', error: { message: 'offline' } } })),
    reducePlan(initial(), event('turn/end', { reason: { kind: 'aborted', reason: { kind: 'hook', reason: 'x' } } })),
  ];
  for (const state of states) assert.deepEqual(schema.parse(state), state);
  assert.throws(() => schema.parse({ ...initial(), todos: [{ content: 'x', status: 'done' }] }));
});

// ---------------------------------------------------------------- client logic

test('zh and en dictionaries have the same keys', () => {
  assert.deepEqual(Object.keys(plugin.DICTS.en).sort(), Object.keys(plugin.DICTS.zh).sort());
});

test('translator interpolates like the platform and falls back to the key', () => {
  assert.equal(zh('summary.progress', { done: 1, total: 3 }), '1/3 已完成');
  assert.equal(en('summary.progress', { done: 1 }), '1/{total} done');
  assert.equal(zh('missing.key'), 'missing.key');
});

test('resume prompt preserves statuses and permissions', () => {
  const text = plugin.buildResumeText(todos);
  assert.ok(text.includes(JSON.stringify(todos, null, 2)));
  assert.ok(text.includes('不要绕过权限'));
  assert.ok(text.includes('不要从头重复'));
  const english = plugin.buildResumeText(todos, en);
  assert.ok(english.includes(JSON.stringify(todos, null, 2)));
  assert.ok(english.includes('do not bypass permissions'));
});

test('only ready idle root sessions can resume', () => {
  assert.equal(plugin.canResume(ready(), todos), true);
  for (const extra of [{ running: true }, { removed: true }, { openState: 'loading' }, { awaitingFirstTurn: true }, { pendingSubmissions: [{}] }, { subagent: {} }]) {
    assert.equal(plugin.canResume(ready(extra), todos), false, JSON.stringify(extra));
  }
  assert.equal(plugin.canResume(ready(), []), false);
  assert.equal(plugin.canResume(ready(), finished), false);
  assert.equal(plugin.canResume(undefined, todos), false);
});

test('sends same-session prompt with optimistic id', async () => {
  const f = fixture();
  await plugin.createResumeController(f.sessions)('session-a');
  const begin = f.calls.find(c => c[0] === 'begin');
  const call = f.calls.find(c => c[0] === 'prompt');
  assert.equal(begin[1].mode, 'queue');
  assert.equal(call[2], 'queue');
  assert.equal(call[4], 'request-1');
  assert.equal(call[1][0].text, plugin.buildResumeText(todos));
  assert.equal(f.abandoned(), 0);
});

test('resume prompt follows the bound locale', async () => {
  const f = fixture();
  await plugin.createResumeController(f.sessions, en)('a');
  assert.equal(f.calls.find(c => c[0] === 'prompt')[1][0].text, plugin.buildResumeText(todos, en));
});

test('falls back to the built-in todos projection when the host half is absent', async () => {
  const f = fixture(ready(), async () => ({ ok: true }), undefined);
  f.binding.session.projections.faceOf = key => ({ getSnapshot: () => (key === 'todos' ? todos : undefined) });
  await plugin.createResumeController(f.sessions)('a');
  assert.equal(f.calls.filter(c => c[0] === 'prompt').length, 1);
});

test('transport error abandons echo and can retry', async () => {
  const f = fixture(ready(), async () => ({ ok: false, error: { message: 'offline' } }));
  const resume = plugin.createResumeController(f.sessions);
  await assert.rejects(resume('a'), /offline/);
  await assert.rejects(resume('a'), /offline/);
  assert.equal(f.abandoned(), 2);
});

test('transport error without message uses localized fallback', async () => {
  const f = fixture(ready(), async () => ({ ok: false, error: {} }));
  await assert.rejects(plugin.createResumeController(f.sessions, en)('a'), /Sending failed/);
});

test('thrown transport error abandons echo', async () => {
  const f = fixture(ready(), async () => { throw new Error('socket'); });
  await assert.rejects(plugin.createResumeController(f.sessions)('a'), /socket/);
  assert.equal(f.abandoned(), 1);
});

test('running session never receives resume message', async () => {
  const f = fixture(ready({ running: true }));
  await assert.rejects(plugin.createResumeController(f.sessions)('a'), /正在运行/);
  assert.equal(f.calls.length, 0);
});

test('closed session is reported in the bound locale', async () => {
  const f = fixture();
  f.sessions.binding = () => undefined;
  await assert.rejects(plugin.createResumeController(f.sessions, en)('a'), /session is closed/);
});

test('duplicate clicks share one send', async () => {
  let finish;
  const f = fixture(ready(), () => new Promise(resolve => { finish = resolve; }));
  const resume = plugin.createResumeController(f.sessions);
  const first = resume('a');
  await assert.rejects(resume('a'), /重复点击/);
  finish({ ok: true });
  await first;
  assert.equal(f.calls.filter(c => c[0] === 'prompt').length, 1);
});

test('stale binding rejects resume', async () => {
  const f = fixture();
  f.sessions.using = async (id, options, fn) => fn({ binding: { ...f.binding } });
  await assert.rejects(plugin.createResumeController(f.sessions)('a'), /重新连接/);
});

// ---------------------------------------------------------------- dismissals

test('dismissal persists per session and notifies subscribers', () => {
  const storage = memoryStorage();
  const store = plugin.createDismissStore(storage);
  let notified = 0;
  const unsubscribe = store.subscribe(() => { notified++; });
  const before = store.getSnapshot();
  store.dismiss('a', 5);
  assert.notEqual(store.getSnapshot(), before);
  assert.equal(store.getSnapshot().a, 5);
  assert.equal(notified, 1);
  unsubscribe();
  store.dismiss('b', 6);
  assert.equal(notified, 1);
  const reloaded = plugin.createDismissStore(storage);
  assert.deepEqual({ ...reloaded.getSnapshot() }, { a: 5, b: 6 });
});

test('dismissal map is bounded and keeps the most recent sessions', () => {
  const store = plugin.createDismissStore(memoryStorage());
  for (let i = 0; i < 205; i++) store.dismiss('s' + i, i);
  store.dismiss('s3', 99);
  const keys = Object.keys(store.getSnapshot());
  assert.equal(keys.length, 200);
  assert.ok(!keys.includes('s0'));
  assert.equal(keys.at(-1), 's3');
});

test('dismissal tolerates corrupt or unavailable storage', () => {
  assert.deepEqual({ ...plugin.createDismissStore(memoryStorage('not json')).getSnapshot() }, {});
  assert.deepEqual({ ...plugin.createDismissStore(memoryStorage('[1]')).getSnapshot() }, {});
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  const store = plugin.createDismissStore(broken);
  store.dismiss('a', 1);
  assert.equal(store.getSnapshot().a, 1);
  const memoryOnly = plugin.createDismissStore(undefined);
  memoryOnly.dismiss('a', 2);
  assert.equal(memoryOnly.getSnapshot().a, 2);
});

// ---------------------------------------------------------------- UI

test('registration replaces the todo cell, owns its locale and disposes CSS', () => {
  const { plugin: p, context } = loadClient();
  let options, view, removed = false;
  const cleanups = [];
  const registered = [];
  context.document.createElement = () => ({ dataset: {}, remove: () => { removed = true; } });
  context.document.head = { appendChild: () => {} };
  p.apply({
    sessions: fixture().sessions,
    effect: f => { cleanups.push(f()); },
    locale: {
      register: (ns, dicts) => { registered.push([ns, dicts]); return () => { registered.length = 0; }; },
      bind: () => zh,
    },
    slots: { inject: (key, f) => f(), register: (o, v) => { options = o; view = v; return () => {}; } },
  });
  assert.deepEqual([...p.inject], ['slots', 'sessions', 'locale']);
  assert.equal(options.id, 'todo');
  assert.equal(options.priority, -100);
  assert.equal(options.locale, 'plan-keeper');
  assert.equal(registered.length, 1);
  assert.equal(registered[0][0], 'plan-keeper');
  assert.deepEqual(Object.keys(registered[0][1]).sort(), ['en', 'zh']);
  const injected = options.inject('a');
  assert.equal(typeof injected.onResume, 'function');
  assert.equal(typeof injected.onDismiss, 'function');
  assert.equal(typeof injected.hooks.dismissed.getSnapshot, 'function');
  assert.equal(typeof view, 'function');
  for (const cleanup of cleanups) cleanup();
  assert.equal(removed, true);
  assert.equal(registered.length, 0);
});

test('paused plan shows resume, dismiss and its stop reason', () => {
  const stopped = reducePlan(initial(), event('turn/end', { reason: { kind: 'error', error: { message: 'rate limited' } } }));
  const tree = render({ plan: stopped });
  assert.equal(find(tree, 'pk-resume').length, 1);
  assert.equal(find(tree, 'pk-resume')[0].props.disabled, false);
  assert.equal(find(tree, 'pk-dismiss').length, 1);
  assert.equal(textOf(find(tree, 'pk-notice')), '执行出错，计划已保留：rate limited');
  assert.match(textOf(find(tree, 'pk-summary')), /1\/3 已完成 · 已暂停/);
  assert.equal(find(tree, 'pk-list').length, 1, 'unfinished plan starts expanded');
});

test('long error details are truncated', () => {
  const stopped = reducePlan(initial(), event('turn/end', { reason: { kind: 'error', error: { message: 'x'.repeat(1000) } } }));
  const notice = textOf(find(render({ plan: stopped }), 'pk-notice'));
  assert.ok(notice.length < 300);
  assert.ok(notice.endsWith('…'));
});

test('unknown stop reasons use the generic notice', () => {
  const tree = render({ plan: { ...initial(), stopReason: 'future-kind' } });
  assert.equal(textOf(find(tree, 'pk-notice')), '计划尚未完成，可以继续执行');
});

test('running plan shows no notice, no dismiss and no unusable resume button', () => {
  const tree = render({ state: ready({ running: true }) });
  assert.equal(find(tree, 'pk-notice').length, 0);
  assert.equal(find(tree, 'pk-dismiss').length, 0);
  assert.equal(find(tree, 'pk-resume').length, 0);
  assert.match(textOf(find(tree, 'pk-summary')), /执行中/);
});

test('resume button label stays readable in light and dark themes', () => {
  // brand-primary is near-white in the dark theme, so it must never sit behind the white label.
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const rule = source.match(/\.pk-resume\{[^}]*\}/)[0];
  assert.match(rule, /background:var\(--dsw-alias-button-info-fill/);
  assert.match(rule, /color:#fff/);
  assert.doesNotMatch(rule, /brand-primary/);
});

test('pending submission explains why resume is disabled', () => {
  const button = find(render({ state: ready({ pendingSubmissions: [{}] }) }), 'pk-resume')[0];
  assert.equal(button.props.disabled, true);
  assert.equal(button.props.title, '已有消息正在发送，请稍候');
});

test('finished plan has no resume, starts collapsed and says all done', () => {
  const tree = render({ plan: reducePlan(null, write(finished)) });
  assert.equal(find(tree, 'pk-resume').length, 0);
  assert.equal(find(tree, 'pk-list').length, 0);
  assert.equal(find(tree, 'pk-notice').length, 0);
  assert.match(textOf(find(tree, 'pk-summary')), /3\/3 已完成 · 全部完成/);
});

test('subagent sessions hide the resume button', () => {
  const tree = render({ state: ready({ subagent: { address: 'x' } }) });
  assert.equal(find(tree, 'pk-resume').length, 0);
});

test('dismissed plan is hidden until a newer write arrives', () => {
  assert.equal(render({ dismissed: { a: 5 } }), null);
  assert.notEqual(render({ dismissed: { a: 4 } }), null);
  assert.notEqual(render({ dismissed: { b: 5 } }), null);
});

test('dismiss button hands the plan seq to the controller', () => {
  let dismissed;
  const tree = render({ onDismiss: seq => { dismissed = seq; } });
  find(tree, 'pk-dismiss')[0].props.onClick();
  assert.equal(dismissed, 5);
});

test('fallback todos render without dismiss', () => {
  const tree = render({ plan: undefined, original: todos });
  assert.notEqual(tree, null);
  assert.equal(find(tree, 'pk-dismiss').length, 0);
  assert.equal(textOf(find(tree, 'pk-notice')), '计划尚未完成，可以继续执行');
});

test('empty plans render nothing', () => {
  assert.equal(render({ plan: null }), null);
  assert.equal(render({ plan: undefined, original: null }), null);
});

test('English locale renders English copy', () => {
  const stopped = reducePlan(initial(), event('turn/end', { reason: { kind: 'interrupted' } }));
  const tree = render({ plan: stopped, t: en });
  assert.equal(textOf(find(tree, 'pk-title')), 'Plan');
  assert.equal(textOf(find(tree, 'pk-resume')), 'Continue');
  assert.equal(textOf(find(tree, 'pk-notice')), 'The run was interrupted; the plan is kept');
  assert.equal(tree.props['aria-label'], 'Retained plan');
});
