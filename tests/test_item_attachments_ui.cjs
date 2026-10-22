const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=name=>fs.readFileSync(path.join(__dirname,'../static',name),'utf8');
function fixture(){
  const detail={submission:{},modules:[{id:'one',module_name:'需求分析',evaluation_item:'行为标准',section_type:'standard',evidence:'文字举证',attachment_ids:['a','b']},{id:'two',module_name:'设计',evaluation_item:'行为标准',section_type:'standard',attachment_ids:[]}],attachments:[{id:'a',material_name:'成果.pdf',uploaded_file_path:'files/proof.pdf'},{id:'b',material_name:'报告.docx',uploaded_file_path:'files/report.docx'},{id:'old',material_name:'历史未归类附件.pdf'}]};
  const context=vm.createContext({window:{currentApplication:detail,addEventListener(){}},sessionStorage:{getItem(){return ''}},location:{pathname:'/'},esc:x=>String(x??''),formatWeight:()=>''});
  vm.runInContext(source('evidence.js'),context);
  vm.runInContext(source('app.js').split(/\r?\n/).find(l=>l.startsWith('function applicationModuleCard(')),context);
  return {context,detail};
}
test('candidate uploads and lists multiple attachments directly below the matching text',()=>{
  const {context,detail}=fixture(),first=context.applicationModuleCard(detail.modules[0],0,true),second=context.applicationModuleCard(detail.modules[1],1,true);
  assert.match(first,/成果.pdf/);assert.match(first,/报告.docx/);
  assert.ok(first.indexOf('文字举证')<first.indexOf('成果.pdf'));
  assert.match(first,/uploadEvidenceFiles\('one'\)/);assert.match(first,/type="file" multiple/);
  assert.doesNotMatch(second,/成果.pdf|报告.docx/);
  assert.match(second,/uploadEvidenceFiles\('two'\)/);
  const locked=context.applicationItemAttachments(detail.modules[0],false);
  assert.doesNotMatch(locked,/上传并关联|调整归属|删除/);assert.match(locked,/下载文件/);
});
test('legacy unlinked and shared attachments offer a single owner selector',()=>{
  const {context,detail}=fixture();let html=context.applicationUnassignedAttachments(detail,true);
  assert.match(html,/历史未归类附件.pdf/);assert.doesNotMatch(html,/成果.pdf/);
  detail.modules[1].attachment_ids=['a'];html=context.applicationUnassignedAttachments(detail,true);
  assert.match(html,/成果.pdf/);assert.match(html,/reassignApplicationAttachment/);
  assert.doesNotMatch(html,/<select[^>]*multiple/);
});
