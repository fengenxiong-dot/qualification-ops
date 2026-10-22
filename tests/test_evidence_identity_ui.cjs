const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
test('employee number autofills existing identity and current grade and both are submitted',async()=>{
  const fields=Object.fromEntries(['evidence-employee-no','evidence-person','evidence-current-level','evidence-standard','evidence-grade','evidence-instructions','evidence-identity-hint','evidence-create-error'].map(id=>[id,{value:'',textContent:''}]));
  const form={},posted=[];let html='';
  fields['evidence-standard'].value='standard';fields['evidence-grade'].value='3';
  const mask={querySelector:s=>s==='form'?form:fields[s.slice(1)],close(){}};
  const context=vm.createContext({window:{addEventListener(){}},location:{pathname:'/'},sessionStorage:{getItem(){return ''}},
    esc:x=>String(x??''),latestArchivedStandards:x=>x,standardPath:()=>'',MatrixCore:{grades:['一级'],tiers:['初做者'],tierIndex:()=>0},
    matrixDialog:(_,content)=>{html=content;return mask},api:async(url,options)=>{
      if(options){posted.push(JSON.parse(options.body));return {submission:{id:'task'},code:'demo-code'}}
      if(url.endsWith('/standards'))return {items:[{id:'standard',name:'标准',version_number:1,matrix:{}}]};
      return {items:[{id:'person',name:'示例员工',employee_no:'E001',currentLevel:'二级'}]};
    }});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/evidence.js'),'utf8'),context);
  context.renderEvidenceTasks=async()=>{};context.showEvidenceCode=()=>{};
  await context.newEvidenceTask();assert.match(html,/工号（唯一身份）/);assert.match(html,/当前职级/);
  fields['evidence-employee-no'].value=' e001 ';fields['evidence-employee-no'].onchange();
  assert.equal(fields['evidence-person'].value,'示例员工');assert.equal(fields['evidence-current-level'].value,'二级');
  assert.equal(fields['evidence-current-level'].readOnly,true);
  await form.onsubmit({preventDefault(){},submitter:{disabled:false}});
  assert.equal(posted[0].employeeNo,'E001');assert.equal(posted[0].currentLevel,'二级');assert.equal(posted[0].grade,3);
  fields['evidence-employee-no'].value='NEW';fields['evidence-employee-no'].onchange();
  assert.equal(fields['evidence-person'].value,'');assert.equal(fields['evidence-current-level'].value,'');assert.equal(fields['evidence-person'].readOnly,false);
});
