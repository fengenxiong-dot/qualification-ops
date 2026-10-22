const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../static/app.js'),'utf8');
function fixture(ready){
  const notice={hidden:true,innerHTML:''},controls=[{},{},{}],calls=[];
  const context=vm.createContext({window:{assignmentData:{submissions:[{id:'person',reviewWeightsReady:ready}]}},
    document:{querySelector:s=>s==='#assignment-submission'?{value:'person'}:notice,querySelectorAll:()=>controls},
    toast:message=>calls.push(['toast',message]),api:async()=>({}),reviewWeightsReady:()=>ready,
    openMatrixWeights:async id=>calls.push(['weights',id]),setView:view=>calls.push(['view',view])});
  vm.runInContext(app.slice(app.indexOf('function updateAssignmentWeightNotice('),app.indexOf('function toggleConfigBlock(')),context);
  vm.runInContext(app.split(/\r?\n/).find(line=>line.startsWith('async function saveAssignment()')),context);
  return {context,notice,controls,calls};
}
test('missing weights immediately prompt and block reviewer inputs and save',async()=>{
  const {context,notice,controls,calls}=fixture(false);
  assert.equal(context.updateAssignmentWeightNotice(true),false);
  assert.equal(notice.hidden,false);assert.match(notice.innerHTML,/先完整配置子维度权重/);
  assert.match(notice.innerHTML,/openMatrixWeights/);assert.ok(controls.every(c=>c.disabled));
  await context.saveAssignment();assert.ok(calls.every(c=>c[0]==='toast'));
});
test('complete weights enable reviewer configuration and hide prerequisite notice',()=>{
  const {context,notice,controls}=fixture(true);
  assert.equal(context.updateAssignmentWeightNotice(),true);
  assert.equal(notice.hidden,true);assert.ok(controls.every(c=>!c.disabled));
});
test('finalized material entry opens weights first and navigates only when ready',async()=>{
  const missing=fixture(false);await missing.context.openAssignmentConfiguration('person');
  assert.ok(missing.calls.some(c=>c[0]==='weights'));assert.ok(!missing.calls.some(c=>c[0]==='view'));
  const ready=fixture(true);await ready.context.openAssignmentConfiguration('person');
  assert.ok(ready.calls.some(c=>c[0]==='view'&&c[1]==='assignments'));
});
