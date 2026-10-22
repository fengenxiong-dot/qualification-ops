const {test}=require('node:test');
const assert=require('node:assert/strict');
const core=require('../static/matrix-core.js');
const dimension=(basis='grade')=>({id:'d',name:'维度',basis,rows:[{id:'r1',name:'知识A',cells:{'1':'旧内容'}},{id:'r2',name:'知识B',cells:{}}]});
test('TSV preserves blank trailing cells and quoted multiline text',()=>{
  assert.deepEqual(core.parseText('A\t"B\nC"\t\nD\tE\t'),[['A','B\nC',''],['D','E','']]);
  assert.throws(()=>core.parseText('A\tB\nC'),/列数/);
  assert.throws(()=>core.parseText('"A\tB'),/引号/);
});
test('Markdown supports escaped pipes and line breaks without executing HTML',()=>{
  assert.deepEqual(core.parseText('| 子项 | 一级 |\n|---|---|\n| A | x\\|y<br>z |'),[['子项','一级'],['A','x|y\nz']]);
  assert.equal(core.parseText('<script>alert(1)</script>')[0][0],'<script>alert(1)</script>');
});
test('header and row matching supports reordered columns and creates new subdimensions',()=>{
  const input=dimension(),before=JSON.stringify(input);
  const result=core.pastePlan(input,[['子维度','三级','一级'],['知识B','描述3','描述1'],['知识C','新3','新1']],{header:true,rowNames:true});
  assert.equal(result.newRows,1);assert.equal(result.dimension.rows[1].cells['3'],'描述3');
  assert.equal(result.dimension.rows[2].cells['1'],'新1');assert.equal(JSON.stringify(input),before);
});
test('blank cells never erase existing content; overwrite is counted',()=>{
  const result=core.pastePlan(dimension(),[['','第二级'],['新增','']],{});
  assert.equal(result.dimension.rows[0].cells['1'],'旧内容');assert.equal(result.changes.length,2);
  assert.equal(core.pastePlan(dimension(),[['修改']],{}).overwrites,1);
});
test('rejects duplicate names, unknown headers, unsupported grades and rectangle overflow',()=>{
  for(const rows of [[['子维度','八级'],['A','x']],[['子维度','一级','一级'],['A','x','y']],[['子维度','一级'],['A','x'],['A','y']]]){
    assert.throws(()=>core.pastePlan(dimension(),rows,{header:true,rowNames:true}));
  }
  assert.throws(()=>core.pastePlan(dimension(),[['a','b']],{startColumn:6}),/范围/);
  assert.throws(()=>core.pastePlan(dimension(),[['a'],['b'],['c']]),/行数/);
});
test('tier table maps only four active tiers and inherited text excludes no-add sentinel',()=>{
  const result=core.pastePlan(dimension('tier'),[['子维度','专家级','初做者'],['知识A','复杂要求','基础要求']],{header:true,rowNames:true});
  assert.equal(result.dimension.rows[0].cells['4'],'复杂要求');
  assert.equal(core.inherited({cells:{'1':'基础','2':core.NO_ADD,'3':'提高'}},2),'基础\n提高');
  assert.throws(()=>core.pastePlan(dimension('tier'),[['子维度','教授级'],['A','x']],{header:true,rowNames:true}));
});
test('column labels follow the selected writing basis',()=>{
  assert.deepEqual(core.columns({basis:'grade'}),core.grades);
  assert.deepEqual(core.columns({basis:'grade',columnStyle:'number'}),['1级','2级','3级','4级','5级','6级','7级']);
  assert.deepEqual(core.columns({basis:'tier',columnStyle:'number'}),['初做者','专业级','骨干级','专家级']);
  assert.equal(core.columnStyle({basis:'grade',columnStyle:'number'}),'number');
  assert.equal(core.columnStyle({basis:'tier',columnStyle:'number'}),'name');
  assert.equal(core.headerIndex('1级','grade'),0);
  assert.equal(core.headerIndex('三级','grade'),2);
  assert.equal(core.headerIndex('骨干级','tier'),2);
});
