const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../static/app.js'),'utf8');
function fixture(){
  const detail={submission:{matrix:true},modules:['基本条件','知识标准','技能标准','能力素质标准','行为标准','专业成果'].map((name,i)=>({id:'m'+i,evaluation_item:name,module_name:name+'子项',section_type:i<4?'reference':i===4?'standard':'bonus',standard:'定义标准',evidence:'项目成果',weight:i===5?null:.2,attachment_ids:i===0?['image','document']:i===1?['image']:[]})),attachments:[{id:'image',material_name:'项目图片.png',uploaded_file_path:'submissions/test/项目 图片.png'},{id:'document',material_name:'说明.docx',uploaded_file_path:'submissions/test/说明.docx'},{id:'other',material_name:'补充材料.pdf'}],scores:[{module_id:'m0',score:4,comment:'已保存的判断'}]};
  const context=vm.createContext({window:{currentDetail:detail},esc:x=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'),formatWeight:x=>x==null?'—':x*100+'%',applicationStandardSnapshot:s=>s});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../static/review-items.js'),'utf8'),context);
  vm.runInContext(app.split(/\r?\n/).find(l=>l.startsWith('function moduleCard(')),context);
  return {detail,context};
}
test('all six dimensions use grouped cards; ordinary reference items have 5-point inputs and saved comments',()=>{
  const {detail,context}=fixture(),html=context.reviewDimensionsHtml(detail);
  assert.equal((html.match(/class="module-score"/g)||[]).length,6);
  assert.equal((html.match(/max="5"/g)||[]).length,5);
  assert.equal((html.match(/max="2"/g)||[]).length,1);
  assert.match(html,/已保存的判断/);
  for(const m of detail.modules)assert.match(html,new RegExp(m.module_name));
  assert.doesNotMatch(html,/其他维度举证|不计分|分级标准参考/);
  assert.equal((html.match(/class="standard"/g)||[]).length,6);
  assert.equal((html.match(/class="evidence evidence-current-text"/g)||[]).length,6);
});
test('attachments appear in the associated subitem with inline image previews and file downloads',()=>{
  const {detail,context}=fixture(),html=context.moduleCard(detail.modules[0]);
  assert.match(html,/关联举证附件 · 2 份/);
  assert.match(html,/<img src="\/media\//);
  assert.match(html,/loading="lazy"/);
  assert.match(html,/说明.docx/);
  assert.match(html,/download>下载文件/);
  assert.doesNotMatch(html,/补充材料.pdf/);
  assert.match(context.moduleCard(detail.modules[1]),/项目图片.png/);
  const remainder=context.reviewUnlinkedAttachmentsHtml(detail);
  assert.match(remainder,/补充材料.pdf/);
  assert.doesNotMatch(remainder,/项目图片.png|说明.docx|附件详情/);
  detail.attachments=detail.attachments.slice(0,2);
  assert.match(context.reviewUnlinkedAttachmentsHtml(detail),/id="attachments" hidden/);
});
test('navigation covers every dimension and subitem; reviewer page no longer injects a separate standards block',()=>{
  const {detail,context}=fixture(),nav=context.reviewDimensionNavigation(detail);
  for(const m of detail.modules){assert.match(nav,new RegExp(m.evaluation_item));assert.match(nav,new RegExp("m-"+m.id))}
  const review=app.slice(app.indexOf('async function openSubmission('),app.indexOf('function moduleCard('));
  assert.doesNotMatch(review,/standardReferenceHtml\(s\)|attachmentTable\(d.attachments\)/);
  assert.match(review,/reviewDimensionsHtml\(d\)/);
});
test('weights require all ordinary dimensions and 100 percent; attachment names cannot inject markup',()=>{
  const {detail,context}=fixture();assert.equal(context.reviewWeightsReady(detail),true);
  detail.modules[0].weight=null;assert.equal(context.reviewWeightsReady(detail),false);
  const html=context.reviewAttachmentsHtml([{id:'safe',material_name:'<img onerror="attack">',uploaded_file_path:'files/a # b.png'}]);
  assert.match(html,/&lt;img onerror=&quot;attack&quot;&gt;/);
  assert.match(html,/a%20%23%20b.png/);
  assert.doesNotMatch(html,/<img onerror=/);
});

test('PDF preview and downloads retain reviewer authorization and do not mix attachments between items',()=>{
  const {context,detail}=fixture();detail.evidenceTask={finalizedAt:'today'};context.window.currentReviewToken='review-token';
  const pdf={id:'pdf',material_name:'报告.pdf',uploaded_file_path:'submissions/test/报告.pdf'};
  const html=context.reviewAttachmentPreviewHtml(pdf);
  assert.match(html,/<iframe/);assert.match(html,/preview=1/);assert.match(html,/review=review-token/);
  assert.match(context.reviewAttachmentsHtml([pdf]),/download=1/);
  assert.doesNotMatch(context.reviewAttachmentPreviewHtml({uploaded_file_path:'files/report.docx'}),/<iframe/);
  detail.modules[1].attachment_ids=[];
  assert.doesNotMatch(context.moduleCard(detail.modules[1]),/项目图片.png|说明.docx/);
  const card=context.moduleCard(detail.modules[0]);
  assert.ok(card.indexOf('项目成果')<card.indexOf('关联举证附件'));
});
