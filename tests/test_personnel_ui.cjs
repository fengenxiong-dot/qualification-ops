const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../static/personnel.js'),'utf8');
function fixture(){
  const calls=[];
  const context=vm.createContext({esc:x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),toast:x=>calls.push(x)});
  vm.runInContext(source,context);return {context,calls};
}
test('personnel navigation follows results and is handled by the existing admin-only navigation',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../static/index.html'),'utf8');
  assert.ok(html.indexOf('data-view="results"')<html.indexOf('data-view="personnel"'));
  assert.ok(html.indexOf('data-view="personnel"')<html.indexOf('data-view="operations"'));
  assert.match(html,/personnel.js/);
});
test('timeline distinguishes failure, pending review and future promotion without injecting names',()=>{
  const {context}=fixture(),person={id:'p'};
  const record={id:'r',source:{origin:'系统认证',category:'<img onerror=attack>',level:'三级'},scoreData:{weightedTotal:80,status:'已完成',completedCount:1,assignmentCount:1,weightTotal:1,reviewers:[{reviewerName:'评委',status:'已完成',weight:1,score:80,weightedContribution:80}]},outcome:'未通过',beforeLevel:'二级',effectStatus:'未通过',promoted:0,note:''};
  let html=context.personnelRecordHtml(person,record);
  assert.match(html,/二级 → 二级/);assert.match(html,/未晋级/);assert.match(html,/80.00/);assert.doesNotMatch(html,/<img onerror=/);
  html=context.personnelRecordHtml(person,{...record,outcome:'通过',promoted:1,result_level:'三级',effectStatus:'待生效',effective_on:'2099-01-01'});
  assert.match(html,/待生效/);assert.match(html,/二级 → 三级/);
  html=context.personnelRecordHtml(person,{...record,outcome:'待确认',submission_id:'s',reviewReady:false});
  assert.match(html,/确认认证结论/);assert.match(html,/方可确认结论/);
});
test('incomplete review blocks the decision form before any edits',async()=>{
  const {context,calls}=fixture();context.api=async()=>({person:{records:[{id:'r',outcome:'待确认',reviewReady:false}]}});
  context.matrixDialog=()=>{throw Error('Decision form should not open')};
  await context.editPersonnelRecord('p','r');assert.match(calls[0],/先完成全部评委评审/);
});
