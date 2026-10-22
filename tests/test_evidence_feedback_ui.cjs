const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function setup(){
  const fields=Array.from({length:6},(_,i)=>({dataset:{module:'m'+i},value:'',listeners:{},addEventListener(name,fn){this.listeners[name]=fn}}));
  const counter={textContent:'',setAttribute(){}};
  const context=vm.createContext({location:{pathname:'/evidence'},sessionStorage:{getItem(){return ''}},window:{addEventListener(){}},
    esc:x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'),
    document:{querySelectorAll:()=>fields,querySelector:()=>counter}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/standards.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/evidence.js'),'utf8'),context);
  return {context,fields,counter};
}
test('reviewer views never render applicant instructions, feedback or workflow controls',()=>{
  const {context}=setup();
  context.document.createElement=()=>{throw Error('Workflow UI must not be created')};
  const detail={evidenceTask:{instructions:'仅给举证人的指引',events:[{action:'退回修改',note:'私人反馈'}],changes:{modules:[]}}};
  for(const [role,token,publicMode] of [['评委','assigned',false],['管理员','assigned',false],['管理员','',true],['评委','',false]]){
    context.currentActor={role};context.window.currentReviewToken=token;context.publicReviewMode=publicMode;
    assert.doesNotThrow(()=>context.setupEvidenceAdmin(detail));
  }
  context.currentActor={role:'管理员'};context.window.currentReviewToken='';context.publicReviewMode=false;
  assert.throws(()=>context.setupEvidenceAdmin(detail),/Workflow UI must not be created/);
});
test('progress reacts to typing, paste and clear without save; blanks and optional items excluded',()=>{
  const {context,fields,counter}=setup();const d={modules:fields.map((_,i)=>({id:'m'+i,section_type:i===5?'bonus':i===0?'standard':'reference'}))};
  context.setupEvidenceApplication(d,true);assert.equal(counter.textContent,'0/5');
  fields[0].value='文字';fields[0].listeners.input();assert.equal(counter.textContent,'1/5');
  for(const field of fields){field.value='粘贴举证';field.listeners.input()}assert.equal(counter.textContent,'5/5');
  fields[1].value=' \n ';fields[1].listeners.input();assert.equal(counter.textContent,'4/5');
  fields[0].value='';fields[0].listeners.input();assert.equal(counter.textContent,'3/5');
});
test('return feedback is prominent, bold and escaped, with older notes preserved',()=>{
  const {context}=setup();const html=context.evidenceFeedback({instructions:'指引',events:[{action:'退回修改',note:'请补充<数据>',created_at:'现在',actor_name:'管理员'},{action:'管理员反馈',note:'旧意见',created_at:'之前'}]});
  assert.match(html,/evidence-feedback-alert/);assert.match(html,/<strong>请补充&lt;数据&gt;<\/strong>/);assert.match(html,/旧意见/);assert.match(html,/evidence-feedback-important/);
});
test('admin change summary distinguishes before, after, cleared text and attachment changes',()=>{
  const {context}=setup();const html=context.evidenceChangesHtml({baselineAt:'退回时间',pendingResubmission:true,modules:[{id:'m1',dimension:'知识',name:'专业知识',fields:[{label:'举证说明',before:'旧文本',after:''}]}],attachments:[{action:'新增附件',name:'证明.pdf'}]});
  assert.match(html,/尚未再次提交/);assert.match(html,/本轮修改：1 项文字 · 1 项附件/);assert.match(html,/已清空/);assert.match(html,/旧文本/);assert.match(html,/新增附件：证明.pdf/);assert.match(html,/data-change-jump="m1"/);
});
