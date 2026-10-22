const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../static');
function setup(){
  const context=vm.createContext({window:{addEventListener(){}},app:{innerHTML:''},title:{},esc:x=>String(x??''),toast:()=>{},document:{querySelector:()=>null,querySelectorAll:()=>[]}});
  for(const file of ['matrix-core.js','standards.js','matrix-ui.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context);
  return context;
}
test('legacy iteration and existing drafts route directly to the matrix editor',async()=>{
  for(const status of ['迭代中','草稿']){
    const c=setup(),opened=[];
    c.api=async url=>url.includes('job-taxonomy')?{items:[]}:{standard:{id:'draft',status,framework:{}},modules:[]};
    c.openMatrixEditor=async detail=>opened.push(detail.standard.id);
    await c.openStandardEditor('draft');assert.deepEqual(opened,['draft']);assert.equal(c.app.innerHTML,'');
  }
});
test('legacy archived view remains read-only in its original format',async()=>{
  const c=setup();let opened=false;
  c.api=async url=>url.includes('job-taxonomy')?{items:[]}:{standard:{id:'old',status:'已存档',framework:{}},modules:[]};
  c.openMatrixEditor=async()=>{opened=true};await c.openStandardEditor('old');
  assert.equal(opened,false);assert.match(c.app.innerHTML,/已存档 · 只读/);
});
test('legacy requirements map to the selected grade and tier without changing the source',()=>{
  const c=setup(),original={standard:{framework:{basic:{content:'基本原文',method:'原方法'},knowledge:{content:'知识原文'}}},modules:[{section_type:'standard',module_name:'行为',standard:'第一项',weight:.5},{section_type:'standard',module_name:'行为',standard:'第二项',weight:.5}]};
  const before=JSON.stringify(original),value=c.legacyDescriptionMatrix(original,7);
  assert.equal(value.dimensions[0].rows[0].cells['7'],'基本原文');
  assert.equal(value.dimensions[1].rows[0].cells['4'],'知识原文');
  assert.equal(Object.keys(value.dimensions[0].rows[0].cells).length,1);
  assert.equal(new Set(value.dimensions[4].rows.map(r=>r.name)).size,2);
  assert.equal(JSON.stringify(original),before);assert.throws(()=>c.legacyDescriptionMatrix(original,0));
  for(const [label,grade] of [['T4',4],['七级',7],['3级',3],['',0],['T9',0]])assert.equal(c.legacySourceGrade(label),grade);
});
test('archive overview groups by subclass, not series or standard name',()=>{
  const c=setup(),rows=[
    {id:'a1',subcategory_id:'a',series_id:'s1',version_number:2,status:'已存档',archived_at:'2026-09-01'},
    {id:'a2',subcategory_id:'a',series_id:'s2',version_number:1,status:'已存档',archived_at:'2026-09-08'},
    {id:'b1',subcategory_id:'b',status:'已存档',archived_at:'2026-09-02'},
    {id:'a3',subcategory_id:'a',status:'迭代中',updated_at:'2026-09-09'},
  ];
  assert.deepEqual(Array.from(c.latestArchivedStandards(rows),r=>r.id),['a2','b1']);
  c.fixture=rows.filter(s=>s.status==='已存档');vm.runInContext('archivedStandardItems=fixture',c);
  assert.deepEqual(Array.from(c.archiveVersionsFor(rows[0]),r=>r.id),['a2','a1']);
});
test('archive grouping keeps unclassified series separate and resolves timestamp ties by version',()=>{
  const c=setup(),rows=[{id:'one',series_id:'s',version_number:1,status:'已存档',archived_at:'same'},{id:'two',series_id:'s',version_number:2,status:'已存档',archived_at:'same'},{id:'three',series_id:'other',status:'已存档',archived_at:'earlier'}];
  assert.deepEqual(Array.from(c.latestArchivedStandards(rows),r=>r.id),['two','three']);
});
test('dimension writing basis switches between grade, grade number and tier',()=>{
  const c=setup();
  const result=vm.runInContext('(()=>{const dim={basis:"grade",columnStyle:"name"};const first=dimensionBasisValue(dim);applyDimensionBasis(dim,"gradeNumber");const numbering=[dim.basis,dim.columnStyle,dimensionBasisLabel(dim)];applyDimensionBasis(dim,"tier");const tiered=[dim.basis,dimensionBasisLabel(dim)];return {first,numbering,tiered}})()',c);
  assert.equal(result.first,'grade');
  assert.deepEqual(Array.from(result.numbering),['grade','number','按等级号编写 · 1级至7级']);
  assert.deepEqual(Array.from(result.tiered),['tier','按层级编写 · 初做者至专家级']);
  assert.equal(typeof c.openDimensionPicker,'function');
  assert.equal(typeof c.removeMatrixDimension,'function');
  assert.equal(typeof c.openMatrixWeights,'function');
});
test('archive check blocks dimensions without subdimensions and warns about pending levels',async()=>{
  const c=setup(),messages=[];
  c.document.querySelector=()=>({textContent:''});
  vm.runInContext('matrixConfirm=async message=>{__messages.push(message);return true}',Object.assign(c,{__messages:messages}));
  vm.runInContext('matrixState={matrix:{schemaVersion:1,dimensions:[{id:"d",name:"基本条件",basis:"grade",columnStyle:"name",rows:[]}]}}',c);
  assert.equal(await c.confirmMatrixArchive(),false);
  assert.equal(messages.length,0);
  vm.runInContext('matrixState={matrix:{schemaVersion:1,dimensions:[{id:"d",name:"基本条件",basis:"grade",columnStyle:"name",rows:[{id:"r",name:"学历",cells:{"1":"本科"}}]}]}}',c);
  assert.equal(await c.confirmMatrixArchive(),true);
  assert.match(messages.at(-1),/还有 6 处等级标准未编写/);
  vm.runInContext('matrixState={matrix:{schemaVersion:1,dimensions:[{id:"d",name:"基本条件",basis:"grade",columnStyle:"number",rows:[{id:"r",name:"学历",cells:{"1":"本科","2":"本科"}}]}]}}',c);
  assert.equal(await c.confirmMatrixArchive(),true);
  assert.match(messages.at(-1),/5 处等级标准未编写/);
});
test('classification options hide inactive nodes but keep the current selection',()=>{
  const c=setup();
  vm.runInContext('taxonomyNodes=[{id:"a",kind:"family",parent_id:null,active:1,name:"研发族"},{id:"b",kind:"family",parent_id:null,active:0,name:"停用族"}]',c);
  const active=vm.runInContext('classificationOptions("family","","a")',c);
  assert.match(active,/研发族/);
  assert.doesNotMatch(active,/停用族/);
  const keep=vm.runInContext('classificationOptions("family","","b")',c);
  assert.match(keep,/停用族（已停用）/);
});
test('basic condition is informational and excluded from evidence requirements',()=>{
  const c=setup();
  const mods=[
    {section_type:'reference',evaluation_item:'基本条件',evidence:''},
    {section_type:'reference',evaluation_item:'知识标准',evidence:''},
    {section_type:'standard',evaluation_item:'行为标准',evidence:'x'},
    {section_type:'bonus',evaluation_item:'专业成果&团队成长贡献',evidence:''},
  ];
  assert.equal(c.isBasicConditionModule(mods[0]),true);
  assert.equal(c.isBasicConditionModule(mods[1]),false);
  assert.deepEqual(Array.from(c.evidenceRequiredModules(mods),m=>m.evaluation_item),['知识标准','行为标准']);
  assert.equal(vm.runInContext('BASIC_CONDITION_MARK',c),'已经经过初筛，符合基本条件');
});
