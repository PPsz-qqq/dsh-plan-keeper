import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { reducePlan } from '../projection.js';
const todos = [{content:'检查',status:'completed'},{content:'实现',status:'in_progress'},{content:'测试',status:'pending'}];
const event = (type,data) => ({type,data,seq:5,time:1000});
const initial = () => reducePlan(null,event('todo/write',{todos}));
const ready = (extra={}) => ({running:false,removed:false,openState:'open',awaitingFirstTurn:false,pendingSubmissions:[],subagent:null,...extra});
function loadClient() {
  let plugin;
  const React = { createElement:(type,props,...children)=>({type,props,children}), useState:v=>[v,()=>{}], useEffect:f=>{f();}, useRef:v=>({current:v}) };
  const context={window:{__ModuleLoader__:{load:def=>{plugin=def.factory(()=>React);}}},document:{},console};
  vm.runInNewContext(readFileSync(new URL('../client.js',import.meta.url),'utf8'),context);
  return {plugin,context};
}
const {plugin}=loadClient();
function fixture(state=ready(),send=async()=>({ok:true})) {
  const calls=[]; let abandoned=0;
  const binding={session:{getSnapshot:()=>state,projections:{faceOf:key=>({getSnapshot:()=>key==='planKeeper'?initial():null})},beginSubmission:input=>{calls.push(['begin',input]);return {requestId:'request-1',abandon:()=>{abandoned++;}};},prompt:async(...args)=>{calls.push(['prompt',...args]);return send(...args);}}};
  const sessions={binding:()=>binding,using:async(id,options,fn)=>fn({binding})};
  return {sessions,binding,calls,abandoned:()=>abandoned};
}
test('no plan in blank history',()=>assert.equal(reducePlan(null,event('turn/start',{})),null));
test('writes detached plan',()=>{const s=initial();assert.deepEqual(s.todos,todos);assert.notEqual(s.todos,todos);assert.notEqual(s.todos[0],todos[0]);});
test('new turn preserves original plan',()=>{const s=initial();assert.equal(reducePlan(s,event('turn/start',{})),s);});
for(const kind of ['error','aborted','interrupted','blocked','max-tokens','forked','completed']) test('preserves plan after '+kind,()=>{const s=initial();const n=reducePlan(s,event('turn/end',{reason:{kind,error:{message:'offline'}}}));assert.deepEqual(n.todos,todos);assert.equal(n.stopReason,kind);assert.equal(n.stopMessage,kind==='error'?'offline':null);assert.equal(s.stopReason,null);});
test('resume clears stop reason, not progress',()=>{const stopped=reducePlan(initial(),event('turn/end',{reason:{kind:'interrupted'}}));const s=reducePlan(stopped,event('turn/start',{}));assert.deepEqual(s.todos,todos);assert.equal(s.stopReason,null);});
test('new write replaces and empty write clears',()=>{const s=reducePlan(initial(),event('todo/write',{todos:[{content:'新计划',status:'pending'}]}));assert.equal(s.todos[0].content,'新计划');assert.equal(reducePlan(s,event('todo/write',{todos:[]})),null);});
test('history replay after restart restores plan',()=>{const log=[event('todo/write',{todos}),event('turn/end',{reason:{kind:'interrupted'}}),event('turn/start',{}),event('turn/end',{reason:{kind:'error',error:{message:'offline'}}})];const s=JSON.parse(JSON.stringify(log)).reduce(reducePlan,null);assert.deepEqual(s.todos,todos);assert.equal(s.stopReason,'error');});
test('sessions have independent plans',()=>{const a=initial();const b=reducePlan(null,event('todo/write',{todos:[{content:'B',status:'pending'}]}));assert.notDeepEqual(a.todos,b.todos);});
test('unrelated events retain identity',()=>{const s=initial();assert.equal(reducePlan(s,event('assistant/message',{})),s);});
test('resume prompt preserves statuses and permissions',()=>{const text=plugin.buildResumeText(todos);assert.ok(text.includes(JSON.stringify(todos,null,2)));assert.ok(text.includes('不要绕过权限'));assert.ok(text.includes('不要从头重复'));});
test('only ready idle root sessions can resume',()=>{assert.equal(plugin.canResume(ready(),todos),true);for(const extra of [{running:true},{removed:true},{openState:'loading'},{awaitingFirstTurn:true},{pendingSubmissions:[{}]},{subagent:{}}])assert.equal(plugin.canResume(ready(extra),todos),false);assert.equal(plugin.canResume(ready(),[]),false);assert.equal(plugin.canResume(ready(),todos.map(t=>({...t,status:'completed'}))),false);});
test('sends same-session prompt with optimistic id',async()=>{const f=fixture();await plugin.createResumeController(f.sessions)('session-a');const c=f.calls.find(c=>c[0]==='prompt');assert.equal(c[2],'queue');assert.equal(c[4],'request-1');assert.equal(c[1][0].text,plugin.buildResumeText(todos));assert.equal(f.abandoned(),0);});
test('transport error abandons echo and can retry',async()=>{const f=fixture(ready(),async()=>({ok:false,error:{message:'offline'}}));const r=plugin.createResumeController(f.sessions);await assert.rejects(r('a'),/offline/);await assert.rejects(r('a'),/offline/);assert.equal(f.abandoned(),2);});
test('thrown transport error abandons echo',async()=>{const f=fixture(ready(),async()=>{throw new Error('socket');});await assert.rejects(plugin.createResumeController(f.sessions)('a'),/socket/);assert.equal(f.abandoned(),1);});
test('running session never receives resume message',async()=>{const f=fixture(ready({running:true}));await assert.rejects(plugin.createResumeController(f.sessions)('a'),/正在运行/);assert.equal(f.calls.length,0);});
test('duplicate clicks share one send',async()=>{let finish;const f=fixture(ready(),()=>new Promise(resolve=>{finish=resolve;}));const r=plugin.createResumeController(f.sessions);const first=r('a');await assert.rejects(r('a'),/重复点击/);finish({ok:true});await first;assert.equal(f.calls.filter(c=>c[0]==='prompt').length,1);});
test('stale binding rejects resume',async()=>{const f=fixture();f.sessions.using=async(id,o,fn)=>fn({binding:{...f.binding}});await assert.rejects(plugin.createResumeController(f.sessions)('a'),/重新连接/);});
test('UI replaces todo cell and disposes CSS',()=>{const {plugin:p,context}=loadClient();let options,view,cleanup,removed=false;context.document.createElement=()=>({dataset:{},remove:()=>{removed=true;}});context.document.head={appendChild:()=>{}};p.apply({sessions:fixture().sessions,effect:f=>{cleanup=f();},slots:{inject:(key,f)=>f(),register:(o,v)=>{options=o;view=v;return ()=>{};}}});assert.equal(options.id,'todo');assert.equal(options.priority,-100);const render=plan=>view({sessionId:'a',useProjection:key=>key==='planKeeper'?plan:todos,useSession:fn=>fn(ready())});assert.ok(JSON.stringify(render(initial())).includes('继续执行'));assert.equal(render(null),null);assert.ok(!JSON.stringify(render({...initial(),todos:todos.map(t=>({...t,status:'completed'}))})).includes('继续执行'));cleanup();assert.equal(removed,true);});
