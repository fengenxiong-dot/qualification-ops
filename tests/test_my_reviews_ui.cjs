const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

async function render(items){
  const source=fs.readFileSync(path.join(__dirname,'../static/app.js'),'utf8');
  const start=source.indexOf('async function renderMyReviews()');
  const end=source.indexOf('\n}',start)+2;
  const app={innerHTML:''};
  const context=vm.createContext({app,title:{},document:{body:{classList:{remove(){}}}},
    api:async()=>({user:{name:'评委甲'},items}),
    esc:x=>String(x??'').replaceAll('<','&lt;').replaceAll('>','&gt;')});
  vm.runInContext(source.slice(start,end),context);
  await context.renderMyReviews();
  return app.innerHTML;
}

test('newly assigned task is counted as pending without a push',async()=>{
  const html=await render([{status:'未开始',submission_name:'张三',token:'assigned',pushed_at:null}]);
  assert.match(html,/1 项待评价/);
  assert.match(html,/张三/);
  assert.match(html,/开始评审/);
  assert.doesNotMatch(html,/当前没有评审任务/);
});

test('current and historical statuses count unfinished tasks and offer appropriate actions',async()=>{
  const html=await render(['未开始','评价中','待评价','已完成','已评价'].map((status,i)=>({status,token:'a'+i,submission_name:'张三'})));
  assert.match(html,/3 项待评价/);
  assert.equal((html.match(/继续评审/g)||[]).length,2);
  assert.equal((html.match(/查看评审/g)||[]).length,2);
  assert.equal((html.match(/status-pill done/g)||[]).length,2);
});

test('empty state explains assignment and identity, not a push prerequisite',async()=>{
  const html=await render([]);
  assert.match(html,/0 项待评价/);
  assert.match(html,/当前登录的评价人身份/);
  assert.doesNotMatch(html,/推送任务后/);
});
