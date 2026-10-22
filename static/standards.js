const qualificationSections = [
  {key:'basic',name:'基本条件',hint:'学历、工作经历、任职年限、绩效及其他任职前提'},
  {key:'knowledge',name:'知识标准',hint:'应掌握的专业知识、业务知识及掌握程度'},
  {key:'skills',name:'技能标准',hint:'应具备的专业技能、工具应用及熟练程度'},
  {key:'competencies',name:'能力素质标准',hint:'岗位所需的思维能力、协作能力及职业素质'},
  {key:'standard',name:'行为标准',hint:'可观察、可举证的工作行为与成果要求'},
  {key:'bonus',name:'专业成果&团队成长贡献',hint:'专业成果、知识沉淀、人才培养及团队成长贡献'}
];
let taxonomyNodes = [];
let standardItems = [];
let archivedStandardItems = [];
let selectedTaxonomy = '';
let standardArea = 'development';

function standardPath(s){return [s.family_name,s.category_name,s.subcategory_name].filter(Boolean).join(' / ') || `待归类${s.category?' · '+s.category:''}`}
function taxonomyName(id){return taxonomyNodes.find(x=>x.id===id)?.name||''}
function taxonomyChildren(id){return taxonomyNodes.filter(x=>(x.parent_id||'')===id)}
function standardUnder(s,id){return !id || (id==='unclassified'?!s.subcategory_id:[s.family_id,s.category_id,s.subcategory_id].includes(id))}

function archiveGroupKey(s){return s.subcategory_id?'subcategory:'+s.subcategory_id:'series:'+(s.series_id||s.id)}
function sortArchivedStandards(items){return [...items].sort((a,b)=>String(b.archived_at||b.updated_at||'').localeCompare(String(a.archived_at||a.updated_at||''))||Number(b.version_number||1)-Number(a.version_number||1)||String(b.id).localeCompare(String(a.id)))}
function latestArchivedStandards(items){const seen=new Set();return sortArchivedStandards(items.filter(s=>s.status==='已存档')).filter(s=>{const key=archiveGroupKey(s);if(seen.has(key))return false;seen.add(key);return true})}
function archiveVersionsFor(s){return sortArchivedStandards(archivedStandardItems.filter(item=>archiveGroupKey(item)===archiveGroupKey(s)))}
function showArchiveVersions(id){
  const standard=archivedStandardItems.find(s=>s.id===id);if(!standard)return;
  const versions=archiveVersionsFor(standard);
  const mask=matrixDialog('历史存档版本',`<p>${esc(standardPath(standard))}</p><p class="subtle">按存档时间倒序排列；历史版本只读保存，已有举证引用不变。</p>${versions.map((s,i)=>`<article class="panel history-entry"><h3>${esc(s.name)} · V${s.version_number}${i===0?' · 最新存档':''}</h3><p>${esc(s.archived_at||'')} · ${esc(s.archived_by||'')}</p><div class="actions"><button class="secondary" data-archive-view="${esc(s.id)}">查看${i===0?'最新':'历史'}存档</button><button class="ghost" data-archive-history="${esc(s.id)}">版本留痕</button></div></article>`).join('')}${versions.length===1?'<p class="subtle">暂无更早的存档版本。</p>':''}`);
  mask.querySelectorAll('[data-archive-view]').forEach(button=>button.onclick=()=>{mask.close();openStandardEditor(button.dataset.archiveView)});
  mask.querySelectorAll('[data-archive-history]').forEach(button=>button.onclick=()=>{mask.close();showStandardHistory(button.dataset.archiveHistory)});
}

async function renderStandards(area=standardArea){
  standardArea=area;const archived=area==='archive';
  document.body.classList.remove('review-mode','assigned-review-mode');title.textContent=archived?'标准存档':'标准开发';
  app.innerHTML='<div class="content loading"><div class="spinner"></div>加载资格标准…</div>';
  try{
    const [data,taxonomy,sources]=await Promise.all([api('/api/admin/standards'),api('/api/admin/job-taxonomy'),api('/api/submissions')]);
    archivedStandardItems=data.items.filter(s=>s.status==='已存档');standardItems=archived?latestArchivedStandards(archivedStandardItems):data.items.filter(s=>s.status!=='已存档');taxonomyNodes=taxonomy.items;window.standardSourceSubmissions=sources.items;
    if(selectedTaxonomy && selectedTaxonomy!=='unclassified' && !taxonomyNodes.some(x=>x.id===selectedTaxonomy))selectedTaxonomy='';
    app.innerHTML=`<div class="content qualification-page"><section class="standard-hero"><div><div class="eyebrow">任职资格体系</div><h2>${archived?'已定稿标准 · 可引用的正式版本':'标准开发 · 起草与迭代'}</h2><p>${archived?'每个子类只展示最新存档，旧版本从“历史版本”查看；所有存档及已有材料引用均保留。':'按职族、职类和子类编写分级标准。每次保存留痕，定稿后进入标准存档。'}</p></div>${archived?'<div class="matrix-actions"><button class="secondary" onclick="exportSubclassStandard()">导出子类标准</button></div>':'<div class="matrix-actions"><button class="secondary" onclick="openDimensionTemplate()">维度模板配置</button><button class="primary" onclick="openStandardEditor()">＋ 新建标准</button></div>'}</section><div class="qualification-layout"><aside class="panel taxonomy-panel"><div class="taxonomy-heading"><strong>职族分类目录</strong><button class="text-button" onclick="editTaxonomyNode('','family')">＋ 职族</button></div><div id="taxonomy-tree"></div><p class="taxonomy-help">先建立职族，再添加职类和子类。选择分类查看其下的标准。</p></aside><section class="qualification-list"><details class="panel standard-copy" ${archived?'hidden':''}><summary>从已有材料复制标准结构</summary><p>行为标准与贡献项会被复制到对应部分，其他部分可继续补充。</p><div><select id="copy-standard-source"><option value="">选择已有材料</option>${sources.items.map(x=>`<option value="${x.id}">${esc(x.name)} · ${esc(x.category||'')} ${esc(x.level||'')}</option>`).join('')}</select><button class="secondary" onclick="copyStandardFromSubmission()">复制为草稿</button></div></details><div class="toolbar standard-list-toolbar"><h2 id="standard-list-title" class="section-title"></h2><span id="standard-list-count" class="subtle"></span></div><div id="standard-cards"></div></section></div></div>`;
    renderTaxonomyTree();renderStandardCards();
  }catch(e){app.innerHTML=`<div class="content panel empty"><h3>加载失败</h3><p>${esc(e.message)}</p><button class="secondary" onclick="renderStandards()">重试</button></div>`}
}

function taxonomyBranch(n){
  const kindName={family:'职族',category:'职类',subcategory:'子类'}[n.kind],children=taxonomyChildren(n.id);
  const next={family:'category',category:'subcategory'}[n.kind];
  const selected=selectedTaxonomy===n.id,inactive=n.active===0;
  const name=`<span>${esc(n.name)}</span>${inactive?'<em class="taxonomy-inactive">已停用</em>':''}`;
  return `<div class="taxonomy-node${inactive?' inactive':''}"><div class="taxonomy-row"><button class="taxonomy-select ${selected?'selected':''}" onclick="selectTaxonomy('${n.id}')"><span class="taxonomy-kind">${kindName}</span>${name}<small>${standardItems.filter(s=>standardUnder(s,n.id)).length}</small></button><button class="taxonomy-edit" aria-label="管理${esc(n.name)}" onclick="editTaxonomyNode('${n.id}')">⋯</button></div>${n.kind!=='subcategory'?`<div class="taxonomy-children">${children.map(taxonomyBranch).join('')}${!inactive?`<button class="taxonomy-add" onclick="editTaxonomyNode('','${next}','${n.id}')">＋ ${next==='category'?'职类':'子类'}</button>`:''}</div>`:''}</div>`;
}
function renderTaxonomyTree(){document.querySelector('#taxonomy-tree').innerHTML=`<button class="taxonomy-root ${!selectedTaxonomy?'selected':''}" onclick="selectTaxonomy('')">全部标准 <small>${standardItems.length}</small></button>${taxonomyChildren('').map(taxonomyBranch).join('')}${standardItems.some(s=>!s.subcategory_id)?`<button class="taxonomy-root ${selectedTaxonomy==='unclassified'?'selected':''}" onclick="selectTaxonomy('unclassified')">待归类 <small>${standardItems.filter(s=>!s.subcategory_id).length}</small></button>`:''}${!taxonomyNodes.length?'<p class="taxonomy-help">暂无分类，点击“＋ 职族”开始建立目录。</p>':''}`}
function selectTaxonomy(id){selectedTaxonomy=id;renderTaxonomyTree();renderStandardCards()}
function renderStandardCards(){
  const items=standardItems.filter(s=>standardUnder(s,selectedTaxonomy));
  document.querySelector('#standard-list-title').textContent=selectedTaxonomy==='unclassified'?'待归类标准':taxonomyName(selectedTaxonomy)||'全部标准';
  document.querySelector('#standard-list-count').textContent=`${items.length} 项标准`;
  document.querySelector('#standard-cards').innerHTML=items.length?`<div class="standard-admin-grid">${items.map(s=>`<article class="panel standard-admin-card"><header><span class="status-pill ${s.status==='已存档'?'done':'draft'}">${esc(s.status)} · V${s.version_number}</span>${s.level?`<span>${esc(s.level)}</span>`:''}</header><p class="standard-path">${esc(standardPath(s))}</p><h3>${esc(s.name)}</h3><div class="framework-tags">${(s.matrix?.dimensions||qualificationSections).map(section=>`<span>${esc(section.name)}</span>`).join('')}</div><p>${s.matrix?s.matrix.dimensions.reduce((n,d)=>n+d.rows.length,0):s.module_count} 个${s.matrix?'子维度':'行为 / 贡献评价项'} · ${s.application_count} 份申请</p><p class="subtle">${s.status==='已存档'?`存档：${esc(s.archived_at)} · ${esc(s.archived_by)}`:`保存记录：${s.revision} 次${s.parent_version_id?' · 从存档版本迭代':''}`}</p><footer><button class="secondary" onclick="openStandardEditor('${s.id}')">${s.status==='已存档'?'查看存档':'继续开发'}</button>${s.status==='已存档'?`<button class="primary" onclick="startStandardIteration('${s.id}')">发起迭代</button>`:''}${s.status==='已存档'?`<button class="ghost" onclick="showArchiveVersions('${s.id}')">历史版本（${archiveVersionsFor(s).length-1}）</button>`:`<button class="ghost" onclick="showStandardHistory('${s.id}')">版本留痕</button><button class="ghost danger" onclick="removeStandard('${s.id}')">删除</button>`}</footer></article>`).join('')}</div>`:`<div class="panel empty"><h3>当前分类下暂无标准</h3><p>${standardArea==='archive'?'开发中的标准定稿存档后，将在这里保存并允许材料举证引用。':'选择子类后点击“新建标准”，或从标准存档中发起迭代。'}</p></div>`;
}

function editTaxonomyNode(id='',kind='family',parentId=''){
  const node=taxonomyNodes.find(x=>x.id===id);if(node){kind=node.kind;parentId=node.parent_id||''}
  const label={family:'职族',category:'职类',subcategory:'子类'}[kind];
  const mask=document.createElement('div');mask.className='drawer-mask';mask.id='taxonomy-dialog';
  mask.innerHTML=`<aside class="drawer taxonomy-editor" role="dialog" aria-modal="true" aria-labelledby="taxonomy-dialog-title"><div class="drawer-head"><h2 id="taxonomy-dialog-title">${id?'编辑':'新建'}${label}</h2><button class="close" onclick="document.querySelector('#taxonomy-dialog').remove()" aria-label="关闭">×</button></div><p>${parentId?`所属${kind==='category'?'职族':'职类'}：${esc(taxonomyName(parentId))}`:'顶层分类：职族'}</p>${id?`<div class="taxonomy-status"><span>${node.active===0?'当前已停用':'当前使用中'}</span><button class="secondary" type="button" onclick="toggleTaxonomyActive('${id}',${node.active===0})">${node.active===0?'启用':'停用'}</button></div>`:''}${id&&kind==='subcategory'?`<button class="secondary" onclick="openPositionEditor(\'${id}\')">配置职级岗位名称</button>`:'' }<form id="taxonomy-form"><label for="taxonomy-name">${label}名称</label><input id="taxonomy-name" required maxlength="100" value="${esc(node?.name||'')}" placeholder="请输入${label}名称"/><p class="form-error" id="taxonomy-error" role="alert"></p><div class="actions">${id?`<button class="danger" type="button" onclick="removeTaxonomy('${id}')">删除${label}</button>`:''}<button class="primary" type="submit">保存</button></div></form></aside>`;
  document.body.append(mask);mask.onclick=e=>{if(e.target===mask)mask.remove()};mask.querySelector('#taxonomy-name').focus();
  mask.querySelector('#taxonomy-form').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{await api(id?`/api/admin/job-taxonomy/${id}/save`:'/api/admin/job-taxonomy',{method:'POST',body:JSON.stringify({name:mask.querySelector('#taxonomy-name').value,kind,parentId})});mask.remove();await renderStandards();toast('分类已保存')}catch(err){mask.querySelector('#taxonomy-error').textContent=err.message;btn.disabled=false}};
}
async function removeTaxonomy(id){if(!await matrixConfirm('确定删除该分类？只有没有下级分类、也没有资格标准的分类才能直接删除；否则请先处理，或改用停用保留历史。'))return;try{await api(`/api/admin/job-taxonomy/${id}/delete`,{method:'POST',body:'{}'});document.querySelector('#taxonomy-dialog')?.remove();await renderStandards();toast('分类已删除')}catch(e){document.querySelector('#taxonomy-error').textContent=e.message}}
async function toggleTaxonomyActive(id,active){try{await api(`/api/admin/job-taxonomy/${id}/toggle-active`,{method:'POST',body:JSON.stringify({active})});document.querySelector('#taxonomy-dialog')?.remove();await renderStandards();toast(active?'分类已启用':'分类已停用，不再出现在新建选择中')}catch(e){const error=document.querySelector('#taxonomy-error');if(error)error.textContent=e.message;else toast(e.message)}}

async function copyStandardFromSubmission(){const id=document.querySelector('#copy-standard-source').value;if(!id)return toast('请选择材料');try{const d=await api(`/api/admin/standards/copy-submission/${id}`,{method:'POST',body:'{}'});await openStandardEditor(d.standard.id);toast('已复制，请补充分类与标准内容')}catch(e){toast(e.message)}}

function classificationOptions(kind,parentId,selected){return `<option value="">请选择${{family:'职族',category:'职类',subcategory:'子类'}[kind]}</option>`+taxonomyNodes.filter(n=>n.kind===kind&&(n.parent_id||'')===(parentId||'')&&(n.active!==0||n.id===selected)).map(n=>`<option value="${n.id}" ${n.id===selected?'selected':''}>${esc(n.name)}${n.active===0?'（已停用）':''}</option>`).join('')}
function updateStandardClassification(level){
  const family=document.querySelector('#standard-family'),category=document.querySelector('#standard-job-category'),sub=document.querySelector('#standard-subcategory');
  if(level==='family'){category.innerHTML=classificationOptions('category',family.value,'');category.disabled=!family.value}
  sub.innerHTML=classificationOptions('subcategory',category.value,'');sub.disabled=!category.value;
}

function taxonomyPathLabel(id){const node=taxonomyNodes.find(x=>x.id===id);if(!node)return id;const parent=taxonomyNodes.find(x=>x.id===node.parent_id);const family=parent?taxonomyNodes.find(x=>x.id===parent.parent_id):null;return [family?.name,parent?.name,node.name].filter(Boolean).join(' / ')}
async function exportSubclassStandard(){
  const subs=taxonomyNodes.filter(n=>n.kind==='subcategory'&&n.active!==0&&archivedStandardItems.some(s=>s.subcategory_id===n.id));
  if(!subs.length)return toast('暂无已存档的子类标准可导出');
  const mask=matrixDialog('导出子类任职资格标准',`<p>选择一个子类，将导出其最新存档版本的全套维度、子维度与分级描述。</p><label>子类<select id="export-subclass"><option value="">请选择</option>${subs.map(n=>`<option value="${n.id}">${esc(taxonomyPathLabel(n.id))}</option>`).join('')}</select></label><p class="form-error" role="alert"></p><button class="primary" data-download>导出 Excel</button>`);
  mask.querySelector('[data-download]').onclick=()=>{const id=mask.querySelector('#export-subclass').value;if(!id){mask.querySelector('.form-error').textContent='请选择子类';return}const link=document.createElement('a');link.href=`/api/admin/job-taxonomy/${id}/standard-export`;link.download='';document.body.append(link);link.click();link.remove();mask.close()};
}

async function openStandardEditor(id=''){
  try{
    const data=await api('/api/admin/job-taxonomy');taxonomyNodes=data.items;
    const d=id?await api(`/api/admin/standards/${id}`):{standard:{id:'',name:'',level:'',status:'草稿',framework:{}},modules:[]};
    if(typeof openMatrixEditor==='function'&&(!id||d.standard.matrix||d.standard.status!=='已存档'))return await openMatrixEditor(d,data);
    const s=d.standard;window.currentStandard=d;const archived=s.status==='已存档';
    const sub=taxonomyNodes.find(n=>n.id===(s.subcategory_id||(!id?selectedTaxonomy:''))&&n.kind==='subcategory');
    const category=taxonomyNodes.find(n=>n.id===sub?.parent_id),family=taxonomyNodes.find(n=>n.id===category?.parent_id);
    title.textContent=archived?'查看存档标准':id?'开发资格标准':'新建资格标准';
    app.innerHTML=`<div class="content standard-editor"><button class="ghost back-button" onclick="renderStandards()">← 返回${standardArea==='archive'?'标准存档':'标准开发'}</button><div class="standard-version-banner"><div><strong>${archived?'已存档 · 只读':s.parent_version_id?'迭代中':'开发草稿'} · V${s.version_number||1}</strong><p>${archived?`存档时间：${esc(s.archived_at)} · ${esc(s.archived_by)} · ${esc(standardPath(s))}`:s.parent_version_id?'本版本基于存档标准迭代，原版本及已有材料引用不变。':'保存会保留内容快照，定稿存档后才能被材料举证引用。'}</p></div>${id?`<button class="secondary" onclick="showStandardHistory('${id}')">版本留痕</button>`:''}${archived?`<button class="primary" onclick="startStandardIteration('${id}')">发起迭代</button>`:''}</div><section class="panel standard-basic-form"><div class="wide"><label for="standard-name">标准名称</label><input id="standard-name" value="${esc(s.name)}" placeholder="填写资格标准名称"/></div><div><label for="standard-family">职族</label><select id="standard-family" onchange="updateStandardClassification('family')">${classificationOptions('family','',family?.id)}</select></div><div><label for="standard-job-category">职类</label><select id="standard-job-category" onchange="updateStandardClassification('category')" ${family?'':'disabled'}>${classificationOptions('category',family?.id,category?.id)}</select></div><div><label for="standard-subcategory">子类</label><select id="standard-subcategory" ${category?'':'disabled'}>${classificationOptions('subcategory',category?.id,sub?.id)}</select></div>${!s.subcategory_id&&s.category?`<p class="wide form-notice">原分类：${esc(s.category)}。请选择对应的职族、职类和子类。</p>`:''}${!taxonomyNodes.some(n=>n.kind==='subcategory')?'<p class="wide form-notice">请先返回分类目录，建立职族、职类和子类。</p>':''}</section><label class="standard-note-label" for="standard-change-note">开发 / 迭代说明</label><textarea id="standard-change-note" class="standard-change-note" placeholder="记录本次开发或修订的原因和范围">${esc(s.change_note||'')}</textarea><nav class="framework-nav" aria-label="标准框架">${qualificationSections.map((section,i)=>`<a href="#framework-${section.key}" onclick="event.preventDefault();document.getElementById('framework-${section.key}').scrollIntoView({behavior:'smooth'})">${i+1} ${esc(section.name)}</a>`).join('')}</nav><div class="framework-editor">${qualificationSections.map((section,i)=>frameworkEditorSection(section,i,s.framework||{})).join('')}</div><p id="standard-save-error" class="form-error" role="alert"></p><div class="savebar"><span id="standard-weight-summary"></span><div>${archived?'<span>已存档版本不可修改，请发起迭代。</span>':`<button class="secondary" onclick="saveStandard('草稿')">保存${s.parent_version_id?'迭代':'草稿'}</button><button class="primary" onclick="saveStandard('已存档')">定稿并存档</button>`}</div></div></div>`;
    d.modules.forEach(m=>addStandardModule(m.section_type,m));updateStandardWeight();
    if(!archived&&typeof upgradeLegacyMatrix==='function'){const banner=document.querySelector('.standard-version-banner');banner.insertAdjacentHTML('beforeend','<button class="secondary" onclick="upgradeLegacyMatrix()">升级为分级矩阵</button>')}
    if(archived){document.querySelectorAll('.standard-editor input,.standard-editor textarea').forEach(el=>el.readOnly=true);document.querySelectorAll('.standard-editor select').forEach(el=>el.disabled=true);document.querySelectorAll('.framework-section button').forEach(el=>el.remove())}
  }catch(e){toast(e.message)}
}

function frameworkEditorSection(section,i,framework){
  const modular=['standard','bonus'].includes(section.key),value=framework[section.key]||{};
  return `<section class="panel framework-section" id="framework-${section.key}"><header><div><span class="section-index">${String(i+1).padStart(2,'0')}</span><div><h2>${esc(section.name)}</h2><p>${esc(section.hint)}</p></div></div>${modular?`<button class="secondary" onclick="addStandardModule('${section.key}')">＋ 添加条目</button>`:''}</header>${modular?`<p class="framework-note">${section.key==='standard'?'各行为标准权重合计 100%，每项原始分满分 5 分。':'沿用现有贡献加分方式，每项最多 2 分。'}</p><div id="standard-module-list-${section.key}" class="framework-module-list"></div>`:`<div class="framework-fields"><label for="framework-content-${section.key}">标准要求</label><textarea id="framework-content-${section.key}" placeholder="${esc(section.hint)}；可分条描述，也可注明不适用及原因">${esc(value.content||'')}</textarea><label for="framework-method-${section.key}">认证方法</label><input id="framework-method-${section.key}" placeholder="例如：资格核验、考试、实操、访谈等" value="${esc(value.method||'')}"/></div>`}</section>`;
}

function addStandardModule(type='standard',m={}){
  const box=document.querySelector(`#standard-module-list-${type}`);if(!box)return;
  const row=document.createElement('article');row.className='standard-module-row';row.dataset.type=type;
  row.innerHTML=`<header><strong>条目 <span class="standard-module-order">${box.children.length+1}</span></strong><button class="danger compact" type="button">移除</button></header><div class="standard-module-fields"><div><label>评估项目</label><input data-field="evaluationItem" value="${esc(m.evaluation_item||'')}" placeholder="${type==='bonus'?'专业成果 / 团队成长贡献':'评估项目名称'}"/></div><div><label>${type==='bonus'?'成果 / 贡献条目':'工作模块'}</label><input data-field="moduleName" value="${esc(m.module_name||'')}" placeholder="填写条目名称"/></div>${type==='standard'?`<div><label>权重（%）</label><input data-field="weight" type="number" min="0" max="100" step="any" value="${m.weight!=null?Number(m.weight)*100:''}"/></div>`:''}<div class="wide"><label>标准要求</label><textarea data-field="standard" placeholder="填写该职级应满足的具体标准">${esc(m.standard||'')}</textarea></div><div class="wide"><label>认证方法</label><input data-field="certificationMethod" value="${esc(m.certification_method||'')}" placeholder="填写认证方法"/></div></div>`;
  row.querySelector('.danger').onclick=()=>{row.remove();renumberStandardModules();updateStandardWeight()};
  row.querySelector('[data-field="weight"]')?.addEventListener('input',updateStandardWeight);box.append(row);updateStandardWeight();
}
function renumberStandardModules(){document.querySelectorAll('.framework-module-list').forEach(box=>box.querySelectorAll('.standard-module-order').forEach((x,i)=>x.textContent=i+1))}
function updateStandardWeight(){const total=[...document.querySelectorAll('.standard-module-row[data-type="standard"] [data-field="weight"]')].reduce((n,x)=>n+(Number(x.value)||0),0),el=document.querySelector('#standard-weight-summary');if(el){el.textContent=`行为标准权重合计：${Number(total.toFixed(4))}%`;el.className=Math.abs(total-100)<.1?'weight-ok':'weight-warn'}}
function standardPayload(status){
  const framework={};qualificationSections.slice(0,4).forEach(s=>framework[s.key]={content:document.querySelector(`#framework-content-${s.key}`).value,method:document.querySelector(`#framework-method-${s.key}`).value});
  return {name:document.querySelector('#standard-name').value,level:window.currentStandard.standard.level||'',subcategoryId:document.querySelector('#standard-subcategory').value,description:window.currentStandard.standard.description||'',status:status||'草稿',revision:window.currentStandard.standard.revision||0,changeNote:document.querySelector('#standard-change-note').value,framework,modules:[...document.querySelectorAll('.standard-module-row')].map(row=>({sectionType:row.dataset.type,evaluationItem:row.querySelector('[data-field="evaluationItem"]').value,moduleName:row.querySelector('[data-field="moduleName"]').value,weight:row.dataset.type==='standard'?(Number(row.querySelector('[data-field="weight"]').value)||0)/100:null,standard:row.querySelector('[data-field="standard"]').value,certificationMethod:row.querySelector('[data-field="certificationMethod"]').value}))};
}
async function saveStandard(status=''){
  if(status==='已存档'&&!confirm('定稿存档后，本版本将只读保存并可用于材料举证。后续修改需发起新版本迭代，确定存档吗？'))return;
  const d=window.currentStandard,payload=standardPayload(status),error=document.querySelector('#standard-save-error');error.textContent='';
  const buttons=[...document.querySelectorAll('.standard-editor .savebar button')];buttons.forEach(b=>b.disabled=true);
  try{const result=await api(d.standard.id?`/api/admin/standards/${d.standard.id}/save`:'/api/admin/standards',{method:'POST',body:JSON.stringify(payload)});window.currentStandard=result;toast(payload.status==='已存档'?'标准已定稿存档':'已保存并记录版本留痕');if(payload.status==='已存档')setView('standard-archive');else await openStandardEditor(result.standard.id)}catch(e){error.textContent=e.message;toast(e.message)}finally{buttons.forEach(b=>b.disabled=false)}
}
async function removeStandard(id){if(!await matrixConfirm('删除这项未定稿的标准及其草稿内容？已存档版本和已被引用的标准不会受影响。'))return;try{await api(`/api/admin/standards/${id}/delete`,{method:'POST',body:'{}'});await renderStandards();toast('标准已删除')}catch(e){toast(e.message)}}

function applicationStandardSnapshot(submission){try{return JSON.parse(submission.standard_snapshot_json||'{}')}catch{return {}}}
function standardReferenceHtml(submission){
  const snapshot=applicationStandardSnapshot(submission);if(!snapshot.framework)return '';
  if(snapshot.matrix)return matrixReferenceHtml(submission);
  return `<section class="standard-reference"><h2 class="section-title">任职要求</h2><p>${esc([snapshot.family_name,snapshot.category_name,snapshot.subcategory_name].filter(Boolean).join(' / '))} · ${esc(snapshot.name||'')}${snapshot.version_number?` · V${snapshot.version_number}（存档版本）`:''}</p>${qualificationSections.slice(0,4).map((s,i)=>`<details class="panel reference-section"><summary>${i+1}、${esc(s.name)}</summary><div><label>标准要求</label><p>${esc(snapshot.framework[s.key]?.content||'未设置')}</p><label>认证方法</label><p>${esc(snapshot.framework[s.key]?.method||'未设置')}</p></div></details>`).join('')}</section>`;
}

function applicationGroupedModules(d,editable){
  if(applicationStandardSnapshot(d.submission).matrix)return matrixApplicationModules(d,editable);
  return standardReferenceHtml(d.submission)+qualificationSections.slice(4).map((section,i)=>{
    const items=d.modules.filter(m=>m.section_type===section.key);
    return `<section><h2 class="section-title">${i+5}、${esc(section.name)}</h2>${items.map((m,index)=>applicationModuleCard(m,index,editable)).join('')||'<p class="subtle">未设置条目</p>'}</section>`;
  }).join('');
}

const BASIC_CONDITION_MARK='已经经过初筛，符合基本条件';
function isBasicConditionModule(m){return m?.evaluation_item==='基本条件'}
function evidenceRequiredModules(modules){return (modules||[]).filter(m=>['standard','reference'].includes(m.section_type)&&!isBasicConditionModule(m))}

function startStandardIteration(id){
  // Embedded browsers may not support window.prompt. Keep this workflow in the page.
  if(document.querySelector('#standard-iteration-dialog'))return;
  const previousFocus=document.activeElement;
  const mask=document.createElement('div');mask.className='drawer-mask';mask.id='standard-iteration-dialog';
  mask.innerHTML=`<aside class="drawer taxonomy-editor" role="dialog" aria-modal="true" aria-labelledby="iteration-dialog-title"><div class="drawer-head"><h2 id="iteration-dialog-title">发起标准迭代</h2><button class="close" type="button" aria-label="关闭迭代窗口">×</button></div><p>原存档版本及已有材料引用保持不变。填写修订原因和范围后，将创建新的迭代版本。</p><form id="standard-iteration-form"><label for="iteration-note">迭代说明</label><textarea id="iteration-note" class="standard-change-note" required placeholder="请填写本次修订的原因和范围"></textarea><p id="iteration-error" class="form-error" role="alert"></p><div class="actions"><button class="secondary" type="button" id="iteration-cancel">取消</button><button class="primary" type="submit" id="iteration-submit">创建迭代版本</button></div></form></aside>`;
  document.body.append(mask);
  const form=mask.querySelector('#standard-iteration-form'),note=mask.querySelector('#iteration-note'),error=mask.querySelector('#iteration-error'),submit=mask.querySelector('#iteration-submit');
  let pending=false;
  const close=()=>{if(pending)return;mask.remove();previousFocus?.focus()};
  mask.querySelector('.close').onclick=close;
  mask.querySelector('#iteration-cancel').onclick=close;
  mask.onclick=e=>{if(e.target===mask)close()};
  mask.onkeydown=e=>{
    if(e.key==='Escape'){e.preventDefault();close()}
    if(e.key==='Tab'){
      const controls=[...mask.querySelectorAll('button:not(:disabled),textarea')];
      const first=controls[0],last=controls[controls.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
    }
  };
  form.onsubmit=async e=>{
    e.preventDefault();if(pending)return;
    const changeNote=note.value.trim();error.textContent='';
    if(!changeNote){error.textContent='请填写迭代说明';note.focus();return}
    pending=true;note.readOnly=true;form.setAttribute('aria-busy','true');
    mask.querySelectorAll('button').forEach(button=>button.disabled=true);submit.textContent='正在创建…';
    try{
      const d=await api(`/api/admin/standards/${id}/iterate`,{method:'POST',body:JSON.stringify({changeNote})});
      mask.remove();standardArea='development';
      document.querySelectorAll('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.view==='standards'));
      await openStandardEditor(d.standard.id);toast(`已创建 V${d.standard.version_number} 迭代版本`);
    }catch(err){error.textContent=err.message||'创建失败，请重试';note.focus()}
    finally{
      pending=false;note.readOnly=false;form.removeAttribute('aria-busy');
      mask.querySelectorAll('button').forEach(button=>button.disabled=false);submit.textContent='创建迭代版本';
    }
  };
  note.focus();
}
function historySnapshotHtml(d){
  const s=d.standard;
  if(s.matrix)return matrixSnapshotHtml(s);
  return `<div class="history-snapshot"><h3>${esc(s.name)} · ${esc(s.level)} · ${esc(s.status)}</h3><p>${esc(standardPath(s))}</p><p>${esc(s.description)}</p>${qualificationSections.map((section,i)=>`<section><h4>${i+1}、${esc(section.name)}</h4>${i<4?`<p>${esc(s.framework[section.key]?.content||'未设置')}</p><small>认证方法：${esc(s.framework[section.key]?.method||'未设置')}</small>`:(d.modules||[]).filter(m=>m.section_type===section.key).map(m=>`<article><strong>${esc(m.evaluation_item)} · ${esc(m.module_name)}${m.weight!=null?` · ${Number((m.weight*100).toFixed(4))}%`:''}</strong><p>${esc(m.standard)}</p><small>认证方法：${esc(m.certification_method)}</small></article>`).join('')||'<p>未设置条目</p>'}</section>`).join('')}</div>`;
}
async function showStandardHistory(id){
  try{
    const data=await api(`/api/admin/standards/${id}/history`);
    document.querySelector('#standard-history-dialog')?.remove();
    const mask=document.createElement('div');mask.className='drawer-mask';mask.id='standard-history-dialog';
    mask.innerHTML=`<aside class="drawer standard-history" role="dialog" aria-modal="true" aria-label="版本留痕"><div class="drawer-head"><h2>版本留痕</h2><button class="close" aria-label="关闭" onclick="document.querySelector('#standard-history-dialog').remove()">×</button></div><p>同一标准的完整开发与迭代记录。展开查看当次保存的完整内容。</p>${data.items.map(h=>`<details class="history-entry"><summary><strong>V${h.snapshot.standard.version_number} · 记录 ${h.snapshot.standard.revision} · ${esc(h.action)}</strong><span>${esc(h.created_at)} · ${esc(h.actor_name||h.actor_id||'系统')}</span></summary><p>修订说明：${esc(h.note||'未填写')}${h.snapshot.standard.parent_version_id?` · 来源版本 ID：${esc(h.snapshot.standard.parent_version_id)}`:''}</p>${historySnapshotHtml(h.snapshot)}</details>`).join('')||'<p>暂无记录</p>'}</aside>`;
    document.body.append(mask);mask.onclick=e=>{if(e.target===mask)mask.remove()};
  }catch(e){toast(e.message)}
}
