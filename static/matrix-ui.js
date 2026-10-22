let matrixState=null;
let matrixDirty=false;
window.addEventListener('beforeunload',event=>{if(matrixDirty){event.preventDefault();event.returnValue=''}});
const mc=MatrixCore;
function matrixDialog(heading,html){
  const mask=document.createElement('div');mask.className='drawer-mask matrix-mask';
  mask.innerHTML=`<aside class="drawer matrix-dialog" role="dialog" aria-modal="true" aria-label="${esc(heading)}"><div class="drawer-head"><h2>${esc(heading)}</h2><button class="close" type="button" aria-label="关闭">×</button></div>${html}</aside>`;
  const focus=document.activeElement;mask.close=()=>{mask.remove();focus?.focus()};
  mask.querySelector('.close').onclick=()=>mask.close();mask.onclick=e=>{if(e.target===mask)mask.close()};
  mask.onkeydown=e=>{if(e.key==='Escape')mask.close();if(e.key==='Tab'){const controls=[...mask.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')].filter(x=>x.getClientRects().length);if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls.at(-1)?.focus()}else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0]?.focus()}}};
  document.body.append(mask);mask.querySelector('textarea,input,select,button')?.focus();return mask;
}
function matrixConfirm(message){return new Promise(resolve=>{
  const mask=matrixDialog('请确认',`<p>${esc(message)}</p><div class="actions"><button class="secondary" data-cancel>取消</button><button class="primary" data-ok>确定</button></div>`);
  const close=mask.close;mask.close=()=>{close();resolve(false)};
  mask.querySelector('[data-cancel]').onclick=()=>mask.close();mask.querySelector('[data-ok]').onclick=()=>{close();resolve(true)};
})}
function matrixChanged(){matrixDirty=true;if(matrixState)matrixState.undo=null;const button=document.querySelector('#matrix-undo');if(button)button.disabled=true;const status=document.querySelector('#matrix-save-state');if(status)status.textContent='有未保存修改'}
async function openMatrixEditor(detail,taxonomy){
  const template=await api('/api/admin/qualification-template');taxonomyNodes=taxonomy.items;
  const s=detail.standard,fresh=!s.id&&!s.matrix;
  matrixState={detail,matrix:fresh?{schemaVersion:1,dimensions:[]}:mc.clone(s.matrix||template.matrix),active:0,row:0,column:0,readOnly:s.status==='已存档',template:false,tiers:template.tiers,positions:mc.clone(s.positions||{}),undo:null,palette:mc.clone((template.matrix||{}).dimensions||[])};
  window.currentStandard=detail;matrixDirty=false;
  if(s.id&&!s.matrix&&!matrixState.readOnly&&(Object.values(s.framework||{}).some(v=>v.content||v.method)||(detail.modules||[]).length))matrixState.legacySource=mc.clone(detail);
  renderMatrixShell();
  renderLegacyMatrixSource();
  if(!matrixState.readOnly)await loadMatrixPositions();
  if(fresh&&!matrixState.readOnly)openDimensionPicker('create');
}

const dimensionBasisChoices=[['grade','按职级（一级至七级）'],['gradeNumber','按等级号（1级至7级）'],['tier','按层级（初做者至专家级）']];
function dimensionBasisValue(dim){return dim.basis==='tier'?'tier':mc.columnStyle(dim)==='number'?'gradeNumber':'grade'}
function applyDimensionBasis(dim,value){dim.basis=value==='tier'?'tier':'grade';dim.columnStyle=value==='gradeNumber'?'number':'name'}
function dimensionBasisOptions(selected){return dimensionBasisChoices.map(([value,label])=>`<option value="${value}" ${value===selected?'selected':''}>${label}</option>`).join('')}
function dimensionBasisLabel(dim){return dim.basis==='tier'?'按层级编写 · 初做者至专家级':mc.columnStyle(dim)==='number'?'按等级号编写 · 1级至7级':'按职级编写 · 一级至七级'}

/* 新建标准时挑选维度组合，也可以随时从模板补充维度或新建自定义维度。 */
function openDimensionPicker(mode='create'){
  const state=matrixState;if(!state||state.readOnly)return;
  const palette=state.palette||[],existing=state.matrix.dimensions.map(d=>d.name);
  const options=palette.map((dim,index)=>({dim,index})).filter(item=>mode==='create'||!existing.includes(item.dim.name));
  const customs=[];
  const listHtml=options.length?options.map(item=>`<label class="dimension-pick-row"><input type="checkbox" data-pick="${item.index}" checked><span><strong>${esc(item.dim.name)}</strong><small>${dimensionBasisLabel(item.dim)} · 模板子维度 ${item.dim.rows.length} 项</small></span></label>`).join(''):`<p class="subtle">${mode==='create'?'全局模板中暂无维度，可在下方新增自定义维度。':'模板中的维度都已在本标准中，可在下方新增自定义维度。'}</p>`;
  const mask=matrixDialog(mode==='create'?'选择本标准的认证维度':'从模板添加维度',`<p>不同标准可以自由搭配维度组合，未选中的维度不会写入本标准。保存后仍可继续新增或移除维度。</p>
    <div class="dimension-pick-toolbar"><button type="button" class="text-button" data-all>全选</button><button type="button" class="text-button" data-none>全不选</button><span class="subtle">模板维护入口：资格标准 → 维度模板配置</span></div>
    <div class="dimension-pick-list">${listHtml}</div>
    <fieldset class="dimension-pick-custom"><legend>新增自定义维度</legend><div class="dimension-pick-custom-row"><label>维度名称<input id="dimension-custom-name" maxlength="100" placeholder="例如：项目管理能力"></label><label>编写口径<select id="dimension-custom-basis">${dimensionBasisOptions('grade')}</select></label><button type="button" class="secondary" data-add-custom>加入清单</button></div><ul class="dimension-pick-custom-list" id="dimension-custom-list"></ul></fieldset>
    <p class="form-error" role="alert"></p>
    <div class="actions"><button type="button" class="secondary" data-cancel>取消</button><button type="button" class="primary" data-apply>${mode==='create'?'使用所选维度':'加入所选维度'}</button></div>`);
  const error=mask.querySelector('.form-error');
  mask.querySelector('[data-cancel]').onclick=()=>mask.close();
  mask.querySelector('[data-all]').onclick=()=>{error.textContent='';mask.querySelectorAll('input[type="checkbox"]').forEach(box=>box.checked=true)};
  mask.querySelector('[data-none]').onclick=()=>{error.textContent='';mask.querySelectorAll('input[type="checkbox"]').forEach(box=>box.checked=false)};
  mask.querySelector('[data-add-custom]').onclick=()=>{
    const input=mask.querySelector('#dimension-custom-name'),name=input.value.trim(),value=mask.querySelector('#dimension-custom-basis').value;
    if(!name){error.textContent='请填写自定义维度名称';return}
    if(state.matrix.dimensions.some(d=>d.name===name)||palette.some(d=>d.name===name)||customs.some(d=>d.name===name)){error.textContent='维度名称已存在，请换一个名称';return}
    const dim={id:mc.uid(),name,basis:'grade',columnStyle:'name',description:'',reviewType:'reference',rows:[]};applyDimensionBasis(dim,value);
    customs.push(dim);input.value='';error.textContent='';
    mask.querySelector('#dimension-custom-list').insertAdjacentHTML('beforeend',`<li><label class="dimension-pick-row"><input type="checkbox" data-custom="${customs.length-1}" checked><span><strong>${esc(dim.name)}</strong><small>${dimensionBasisLabel(dim)} · 自定义维度</small></span></label><button type="button" class="text-button" data-drop-custom="${customs.length-1}">移除</button></li>`);
    mask.querySelector(`[data-drop-custom="${customs.length-1}"]`).onclick=event=>{event.preventDefault();event.currentTarget.closest('li').remove()};
  };
  mask.querySelector('[data-apply]').onclick=()=>{
    const chosen=options.filter(item=>mask.querySelector(`[data-pick="${item.index}"]`)?.checked).map(item=>mc.clone(item.dim));
    const picked=customs.filter((dim,index)=>mask.querySelector(`[data-custom="${index}"]`)?.checked).map(dim=>mc.clone(dim));
    const result=[...chosen,...picked];
    if(result.some(dim=>existing.includes(dim.name))){error.textContent='维度名称与已有维度重复';return}
    if(!state.matrix.dimensions.length&&!result.length){error.textContent='请至少选择一个维度，或用“新增自定义维度”建立维度';return}
    if(!result.length){error.textContent='请先勾选要加入的维度';return}
    state.matrix.dimensions=state.matrix.dimensions.concat(result);
    state.active=mode==='create'?0:state.matrix.dimensions.length-1;
    matrixChanged();mask.close();renderMatrixDimension();toast(`已加入 ${result.length} 个维度`);
  };
}

function legacySourceGrade(level){const value=String(level||'').trim();const chinese=mc.grades.indexOf(value);if(chinese>=0)return chinese+1;const match=value.match(/^(?:[TP])?([1-7])(?:级)?$/i);return match?Number(match[1]):0}
function legacyDescriptionMatrix(original,grade){
  if(!Number.isInteger(grade)||grade<1||grade>7)throw Error('请选择原内容对应的一级至七级');
  const dimensions=qualificationSections.map((section,index)=>({id:section.key,name:section.name,basis:index===0||index>=4?'grade':'tier',columnStyle:'name',description:section.hint,reviewType:index===4?'standard':index===5?'bonus':'reference',rows:[]}));
  dimensions.forEach((dim,index)=>{
    const column=dim.basis==='grade'?grade:mc.tierIndex(grade)+1;
    if(index<4){const content=original.standard.framework?.[dim.id]?.content;if(content)dim.rows.push({id:mc.uid(),name:dim.name,cells:{[column]:content}})}
    else (original.modules||[]).filter(m=>m.section_type===dim.id).forEach((m,i)=>{
      const base=m.module_name||m.evaluation_item||`子维度 ${i+1}`;let name=base,suffix=2;while(dim.rows.some(r=>r.name===name))name=`${base}（${suffix++}）`;
      dim.rows.push({id:mc.uid(),name,cells:{[column]:m.standard||''}});
    });
  });
  return {schemaVersion:1,dimensions};
}
function renderLegacyMatrixSource(){
  const state=matrixState,original=state?.legacySource;if(!original)return;
  const grade=legacySourceGrade(original.standard.level);
  const box=document.createElement('section');box.className='panel';box.id='matrix-legacy-source';
  box.innerHTML=`<h2 class="section-title">旧版内容转入分级矩阵</h2><p>已切换为新版编辑界面。旧版内容完整保留在下方，确认原内容对应的职级后填入矩阵；其他等级留待编写，原存档不变。</p><div class="matrix-actions"><label for="matrix-legacy-grade">原内容对应职级</label><select id="matrix-legacy-grade"><option value="">请选择</option>${mc.grades.map((g,i)=>`<option value="${i+1}" ${grade===i+1?'selected':''}>${g}</option>`).join('')}</select><button class="primary" data-map-legacy>填入对应等级</button></div><details><summary>查看原版完整内容（含原认证方法和权重）</summary>${historySnapshotHtml(original)}</details><p role="alert" class="form-error"></p>`;
  document.querySelector('#matrix-dimension').before(box);
  box.querySelector('[data-map-legacy]').onclick=async()=>{
    const selected=Number(box.querySelector('select').value),error=box.querySelector('.form-error');
    if(!selected){error.textContent='请确认原内容对应的职级，避免标准放错等级';return}
    if(matrixDirty&&!await matrixConfirm('转入旧版内容将替换当前尚未保存的矩阵描述，确定继续？'))return;
    state.matrix=legacyDescriptionMatrix(original,selected);state.active=0;state.row=0;state.column=0;state.legacySource=null;matrixChanged();box.querySelector('.matrix-actions').remove();error.textContent='';box.querySelector('p').textContent='旧版要求已转入所选等级，其他等级仍待编写。保存草稿后生效，原版完整内容可在版本留痕中回看。';renderMatrixDimension();
  };
}
async function openDimensionTemplate(){
  if(matrixDirty&&!await matrixConfirm('当前修改尚未保存，确定离开？'))return;
  try{const data=await api('/api/admin/qualification-template');matrixState={matrix:mc.clone(data.matrix),active:0,row:0,column:0,readOnly:false,template:true,templateRevision:data.revision,tiers:data.tiers,undo:null,positions:{}};matrixDirty=false;renderMatrixShell()}catch(e){toast(e.message)}
}
function renderMatrixShell(){
  const state=matrixState,s=state.detail?.standard||{},sub=taxonomyNodes.find(n=>n.id===(s.subcategory_id||selectedTaxonomy)&&n.kind==='subcategory'),category=taxonomyNodes.find(n=>n.id===sub?.parent_id),family=taxonomyNodes.find(n=>n.id===category?.parent_id);
  title.textContent=state.template?'认证维度模板':state.readOnly?'存档分级标准':'分级标准开发';
  app.innerHTML=`<div class="content matrix-page"><button class="ghost" onclick="leaveMatrixEditor()">← 返回标准${standardArea==='archive'?'存档':'开发'}</button><div class="standard-version-banner"><div><strong>${state.template?'全局认证维度模板':`${esc(s.status||'草稿')} · V${s.version_number||1}`}</strong><p>${state.template?'模板用于后续新建标准，已有标准和历史存档不随模板变化。':state.readOnly?'存档版本只读，包含当时的维度、子维度和岗位名称。':'当前开发至七级。只填写本级新增要求，引用时自动包含低等级要求。'}</p></div>${s.id?`<button class="secondary" onclick="showStandardHistory('${s.id}')">版本留痕</button>`:''}${state.readOnly?`<button class="primary" onclick="startStandardIteration('${s.id}')">发起迭代</button>`:''}</div>
  ${state.template?'':`<section class="panel standard-basic-form"><div class="wide"><label for="matrix-name">标准名称</label><input id="matrix-name" value="${esc(s.name||'')}" ${state.readOnly?'readonly':''}></div><div><label for="matrix-family">职族</label><select id="matrix-family" ${state.readOnly?'disabled':''} onchange="matrixClassification('family')">${classificationOptions('family','',family?.id)}</select></div><div><label for="matrix-category">职类</label><select id="matrix-category" ${state.readOnly||!family?'disabled':''} onchange="matrixClassification('category')">${classificationOptions('category',family?.id,category?.id)}</select></div><div><label for="matrix-subcategory">子类</label><select id="matrix-subcategory" ${state.readOnly||!category?'disabled':''} onchange="matrixChanged();loadMatrixPositions()">${classificationOptions('subcategory',category?.id,sub?.id)}</select></div><div class="wide"><label for="matrix-note">开发 / 迭代说明</label><textarea id="matrix-note" ${state.readOnly?'readonly':''}>${esc(s.change_note||'')}</textarea></div></section>`}
  <div class="matrix-actions">${state.readOnly?'':`<button class="secondary" onclick="addMatrixDimension()">＋ 新增维度</button>${state.template?'':'<button class="secondary" onclick="openDimensionPicker(\'add\')">从模板添加维度</button>'}`}${!state.template&&!state.readOnly?'<button class="secondary" onclick="positionsForMatrix()">配置子类岗位名称</button>':''}<span class="subtle">初做者 1—2 · 专业级 3—4 · 骨干级 5—6 · 专家级 7—9 · 教授级 10—12</span></div><div class="matrix-tabs" id="matrix-tabs" aria-label="认证维度"></div><section id="matrix-dimension"></section><p id="matrix-error" class="form-error" role="alert"></p><div class="savebar"><span id="matrix-save-state">${state.readOnly?'存档版本不可修改':'尚无新修改'}</span>${state.readOnly?'':`<div><button id="matrix-undo" class="secondary" disabled onclick="undoMatrixPaste()">撤销本次粘贴</button><button class="secondary" onclick="saveMatrix(false)">${state.template?'保存模板':'保存草稿'}</button>${state.template?'':'<button class="primary" onclick="saveMatrix(true)">定稿并存档</button>'}</div>`}</div></div>`;
  document.querySelectorAll('#matrix-name,#matrix-note').forEach(el=>el.oninput=matrixChanged);renderMatrixDimension();
}
async function leaveMatrixEditor(){if(matrixDirty&&!await matrixConfirm('尚有未保存修改，确定返回？'))return;matrixDirty=false;matrixState=null;renderStandards()}
function matrixClassification(level){
  const family=document.querySelector('#matrix-family'),category=document.querySelector('#matrix-category'),sub=document.querySelector('#matrix-subcategory');
  if(level==='family'){category.innerHTML=classificationOptions('category',family.value,'');category.disabled=!family.value}
  sub.innerHTML=classificationOptions('subcategory',category.value,'');sub.disabled=!category.value;matrixChanged();loadMatrixPositions();
}
async function loadMatrixPositions(){
  const state=matrixState,id=document.querySelector('#matrix-subcategory')?.value;
  state.positions={};renderMatrixDimension();if(!id)return;
  try{const result=await api(`/api/admin/job-taxonomy/${id}/positions`);if(matrixState===state&&document.querySelector('#matrix-subcategory')?.value===id){state.positions=result.positions;renderMatrixDimension()}}catch(e){toast(e.message)}
}
function positionsForMatrix(){const id=document.querySelector('#matrix-subcategory')?.value;if(!id)return toast('请先选择子类');openPositionEditor(id)}
function activeMatrixDimension(){return matrixState.matrix.dimensions[matrixState.active]}
function selectMatrixDimension(index){matrixState.active=index;matrixState.row=0;matrixState.column=0;renderMatrixDimension()}
function matrixColumnHeaders(dim,positions){
  if(dim.basis==='tier')return mc.columns(dim).map((name,i)=>`<th>${esc(name)}<small>${mc.ranges[i]}${i===3?' · 当前仅7级':''}</small><small>${Array.from({length:7},(_,g)=>g+1).filter(g=>mc.tierIndex(g)===i).map(g=>positions[g]?`${mc.grades[g-1]}：${esc(positions[g])}`:'').filter(Boolean).join('<br>')}</small></th>`).join('');
  return mc.columns(dim).map((name,i)=>`<th>${esc(name)}<small>${esc(positions[i+1]||'岗位名称未配置')}</small></th>`).join('');
}
function renderMatrixDimension(){
  const state=matrixState,dim=activeMatrixDimension();
  document.querySelector('#matrix-tabs').innerHTML=state.matrix.dimensions.map((d,i)=>`<button class="secondary" aria-pressed="${i===state.active}" onclick="selectMatrixDimension(${i})">${esc(d.name)}</button>`).join('');
  const box=document.querySelector('#matrix-dimension');
  if(!dim){box.innerHTML='<div class="panel empty">请新增认证维度</div>';return}
  const readonly=state.readOnly;
  box.innerHTML=`<div class="toolbar"><div><h2 class="section-title">${esc(dim.name)}</h2><p class="subtle">${dimensionBasisLabel(dim)}${dim.description?' · '+esc(dim.description):''}</p></div><div class="matrix-actions">${readonly?'':`<button class="secondary" onclick="configureMatrixDimension()">维度设置</button><button class="secondary" onclick="addMatrixRow()">＋ 子维度</button>${state.template?'':'<button class="primary" onclick="openMatrixPaste()">批量粘贴</button>'}${state.matrix.dimensions.length>1?'<button class="secondary danger" onclick="removeMatrixDimension()">移除本维度</button>':''}`}</div></div>
  <div class="matrix-scroll"><table class="matrix-grid"><thead>${!state.template&&dim.basis==='grade'?'<tr><th rowspan="2">子维度</th><th colspan="2">初做者</th><th colspan="2">专业级</th><th colspan="2">骨干级</th><th>专家级</th></tr>':''}<tr>${state.template||dim.basis==='tier'?'<th>子维度</th>':''}${state.template?'<th>说明</th>':matrixColumnHeaders(dim,state.positions)}</tr></thead><tbody>${dim.rows.map((row,r)=>`<tr><th><label class="sr-only" for="matrix-row-${r}">子维度名称</label><input id="matrix-row-${r}" value="${esc(row.name)}" ${readonly?'readonly':''} oninput="activeMatrixDimension().rows[${r}].name=this.value;matrixChanged()">${readonly?'':`<div class="matrix-row-actions"><button aria-label="上移子维度" onclick="moveMatrixRow(${r},-1)" ${r===0?'disabled':''}>↑</button><button aria-label="下移子维度" onclick="moveMatrixRow(${r},1)" ${r===dim.rows.length-1?'disabled':''}>↓</button><button onclick="removeMatrixRow(${r})">移除</button></div>`}</th>${state.template?'<td>新建标准时生成此子维度，分级描述由开发者填写。</td>':mc.columns(dim).map((column,c)=>`<td><textarea aria-label="${esc(row.name)} ${esc(column)}标准要求" data-mrow="${r}" data-mcol="${c}" ${readonly?'readonly':''} placeholder="本级新增要求" onfocus="selectMatrixCell(${r},${c})" oninput="editMatrixCell(${r},${c},this.value)">${esc(row.cells[String(c+1)]||'')}</textarea>${readonly?'':`<button class="matrix-no-add" onclick="setMatrixNoAddition(${r},${c})">无新增要求</button>`}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${state.template?2:mc.columns(dim).length+1}"><p class="empty">暂无子维度。${readonly?'':'可点击“＋ 子维度”，或粘贴含子维度名称的整张表格。'}</p></td></tr>`}</tbody></table></div>${state.template?'':`<div class="matrix-reference panel"><strong id="matrix-cell-label"></strong><p id="matrix-tier-definition"></p><label>当前等级完整要求（包含低等级）</label><pre id="matrix-inherited"></pre><small>空白＝待编写；${mc.NO_ADD}＝明确沿用低等级要求。不重复填写继承文字。</small></div>`}`;
  if(!state.template){box.querySelectorAll('textarea[data-mrow]').forEach(input=>input.addEventListener('paste',event=>{
    if(readonly)return;const plain=event.clipboardData.getData('text/plain'),html=event.clipboardData.getData('text/html');
    if(plain.includes('\t')||plain.trim().startsWith('|')||html.includes('<table')){event.preventDefault();state.row=Number(input.dataset.mrow);state.column=Number(input.dataset.mcol);openMatrixPaste(plain,html)}
  }));updateMatrixReference()}
}
function selectMatrixCell(r,c){matrixState.row=r;matrixState.column=c;updateMatrixReference()}
function editMatrixCell(r,c,value){activeMatrixDimension().rows[r].cells[String(c+1)]=value;matrixChanged();selectMatrixCell(r,c)}
function setMatrixNoAddition(r,c){editMatrixCell(r,c,mc.NO_ADD);const input=document.querySelector(`[data-mrow="${r}"][data-mcol="${c}"]`);input.value=mc.NO_ADD}
function updateMatrixReference(){
  const dim=activeMatrixDimension(),row=dim.rows[matrixState.row],c=matrixState.column,tier=dim.basis==='tier'?c:mc.tierIndex(c+1);
  document.querySelector('#matrix-cell-label').textContent=row?`${row.name} / ${mc.columns(dim)[c]}`:'请选择单元格';
  document.querySelector('#matrix-tier-definition').textContent=`${mc.tiers[tier]}：${matrixState.tiers[tier]?.definition||''}`;
  document.querySelector('#matrix-inherited').textContent=row?mc.inherited(row,c)||'尚无新增要求':'暂无内容';
}
function addMatrixDimension(){matrixState.matrix.dimensions.push({id:mc.uid(),name:'新维度 '+(matrixState.matrix.dimensions.length+1),basis:'grade',columnStyle:'name',description:'',reviewType:'reference',rows:[]});matrixState.active=matrixState.matrix.dimensions.length-1;matrixChanged();renderMatrixDimension();configureMatrixDimension()}
function addMatrixRow(){const dim=activeMatrixDimension();if(dim.rows.length>=100)return toast('每个维度最多 100 个子维度');let i=dim.rows.length+1;while(dim.rows.some(r=>r.name==='子维度 '+i))i++;dim.rows.push({id:mc.uid(),name:'子维度 '+i,cells:{}});matrixChanged();renderMatrixDimension()}
function moveMatrixRow(index,direction){const rows=activeMatrixDimension().rows,to=index+direction;if(to<0||to>=rows.length)return;[rows[index],rows[to]]=[rows[to],rows[index]];matrixState.row=to;matrixChanged();renderMatrixDimension()}
async function removeMatrixRow(index){if(!await matrixConfirm('移除此子维度及当前草稿中的分级描述？历史版本不受影响。'))return;activeMatrixDimension().rows.splice(index,1);matrixState.row=0;matrixChanged();renderMatrixDimension()}
async function removeMatrixDimension(){
  const state=matrixState,dim=activeMatrixDimension();if(!dim)return;
  if(state.matrix.dimensions.length<=1)return toast('至少保留一个维度');
  if(!await matrixConfirm(`移除「${dim.name}」及其全部子维度？已存档版本不受影响。`))return;
  state.matrix.dimensions.splice(state.active,1);state.active=Math.max(0,state.active-1);matrixState.row=0;matrixState.column=0;matrixChanged();renderMatrixDimension();toast('维度已移除，保存后生效')
}
function configureMatrixDimension(){
  const dim=activeMatrixDimension(),state=matrixState;
  const mask=matrixDialog('维度设置',`<form><label>维度名称<input name="name" maxlength="100" required value="${esc(dim.name)}"></label><label>编写口径<select name="basis">${dimensionBasisOptions(dimensionBasisValue(dim))}</select></label><label>维度说明<textarea name="description">${esc(dim.description||'')}</textarea></label><label>后续评审用途<select name="reviewType"><option value="reference">普通评分（基础、知识、技能、素质）</option><option value="standard">普通评分（行为标准）</option><option value="bonus">成果贡献加分</option></select></label><p class="subtle">编写口径决定分级列：按职级为“一级至七级”，按等级号为“1级至7级”，按层级为“初做者至专家级”。改变口径前必须清空该维度的描述，防止等级错位。现有标准的配置不影响全局模板。</p><p class="form-error" role="alert"></p><div class="actions"><button type="button" data-up>上移维度</button><button type="button" data-down>下移维度</button><button type="button" class="danger" data-delete>删除维度</button><button class="primary">保存设置</button></div></form>`);
  mask.querySelector('[name="reviewType"]').value=dim.reviewType||'reference';
  const move=direction=>{const i=state.active,to=i+direction;if(to<0||to>=state.matrix.dimensions.length)return;[state.matrix.dimensions[i],state.matrix.dimensions[to]]=[state.matrix.dimensions[to],state.matrix.dimensions[i]];state.active=to;matrixChanged();renderMatrixDimension()};
  mask.querySelector('[data-up]').onclick=()=>move(-1);mask.querySelector('[data-down]').onclick=()=>move(1);
  mask.querySelector('[data-delete]').onclick=async()=>{if(state.matrix.dimensions.length<=1){mask.querySelector('.form-error').textContent='至少保留一个维度';return}if(await matrixConfirm('删除该维度及子维度？已存档版本不受影响。')){state.matrix.dimensions.splice(state.active,1);state.active=0;matrixChanged();mask.close();renderMatrixDimension()}};
  mask.querySelector('form').onsubmit=e=>{e.preventDefault();const name=mask.querySelector('[name="name"]').value.trim(),basis=mask.querySelector('[name="basis"]').value,error=mask.querySelector('.form-error'),changed=basis!==dimensionBasisValue(dim);if(!name||state.matrix.dimensions.some(d=>d!==dim&&d.name===name)){error.textContent='维度名称不能为空或重复';return}if(changed&&dim.rows.some(r=>Object.values(r.cells).some(Boolean))){error.textContent='本维度已有分级描述，不能直接改变口径；请新建维度并重新匹配内容';return}if(changed)dim.rows.forEach(r=>r.cells={});dim.name=name;applyDimensionBasis(dim,basis);dim.description=mask.querySelector('[name="description"]').value;dim.reviewType=mask.querySelector('[name="reviewType"]').value;matrixState.column=0;matrixChanged();mask.close();renderMatrixDimension()};
}
/* 定稿不要求所有维度写满：只要求每个维度有子维度，未填写的等级按“待补充”存档。 */
async function confirmMatrixArchive(){
  const dims=(matrixState&&matrixState.matrix.dimensions)||[];
  const empty=dims.filter(dim=>!dim.rows.length);
  if(empty.length){document.querySelector('#matrix-error').textContent=`「${empty[0].name}」还没有子维度：请先在维度下新增子维度，或移除该维度`;return false}
  const pending=dims.reduce((total,dim)=>total+dim.rows.reduce((count,row)=>count+mc.columns(dim).filter((_,index)=>!String(row.cells[String(index+1)]||'').trim()).length,0),0);
  const message=pending?`还有 ${pending} 处等级标准未编写，将以「待补充」存档并供举证引用，之后可发起迭代补齐。确定存档？`:'定稿后整套矩阵和当前子类岗位名称将只读存档，只有发起迭代才能修改。确定存档？';
  return await matrixConfirm(message)
}
async function saveMatrix(archive){
  if(matrixState?.legacySource){toast('请先确认旧版内容对应的职级并点击“填入对应等级”，再保存矩阵');document.querySelector('#matrix-legacy-source')?.scrollIntoView({behavior:'smooth'});return}
  if(matrixState.readOnly)return;
  if(archive&&!await confirmMatrixArchive())return;
  const state=matrixState,error=document.querySelector('#matrix-error');error.textContent='';
  const buttons=[...document.querySelectorAll('.matrix-page .savebar button')];buttons.forEach(b=>b.disabled=true);
  try{
    if(state.template){await api('/api/admin/qualification-template',{method:'POST',body:JSON.stringify({matrix:state.matrix,revision:state.templateRevision})});matrixDirty=false;await openDimensionTemplate();toast('模板已保存，仅用于后续新建标准');return}
    const s=state.detail.standard,payload={name:document.querySelector('#matrix-name').value,subcategoryId:document.querySelector('#matrix-subcategory').value,changeNote:document.querySelector('#matrix-note').value,matrix:state.matrix,revision:s.revision||0,status:archive?'已存档':'草稿'};
    const result=await api(s.id?`/api/admin/standards/${s.id}/save`:'/api/admin/standards',{method:'POST',body:JSON.stringify(payload)});
    matrixDirty=false;window.currentStandard=result;toast(archive?'分级标准已存档':'矩阵已保存并留痕');
    if(archive){matrixState=null;setView('standard-archive')}else await openMatrixEditor(result,{items:taxonomyNodes});
  }catch(e){error.textContent=e.message;toast(e.message)}finally{buttons.forEach(b=>b.disabled=false)}
}

function clipboardTableText(html,fallback){
  if(!html||!html.toLowerCase().includes('<table'))return fallback;
  const parsed=new DOMParser().parseFromString(html,'text/html'),tables=parsed.querySelectorAll('table');
  if(tables.length!==1)throw Error('请一次复制一张表格，不支持嵌套表格');
  const rows=[...tables[0].rows].map(row=>[...row.cells].map(cell=>{
    if(cell.rowSpan>1||cell.colSpan>1)throw Error('请复制不含合并单元格的数据区域');
    const copy=cell.cloneNode(true);copy.querySelectorAll('script,style,img,iframe').forEach(n=>n.remove());
    copy.querySelectorAll('br').forEach(n=>n.replaceWith('\n'));copy.querySelectorAll('p,div').forEach(n=>n.append('\n'));
    return '"'+copy.textContent.trim().replaceAll('"','""')+'"';
  }));
  return rows.map(row=>row.join('\t')).join('\n');
}
function openMatrixPaste(plain='',html=''){
  const state=matrixState,dim=activeMatrixDimension();let plan=null,baseline=JSON.stringify(dim);
  const origin={startRow:state.row||0,startColumn:state.column||0};
  const mask=matrixDialog('批量粘贴分级标准',`<p>当前维度：${esc(dim.name)} · ${dim.basis==='grade'?'按职级（7列）':'按层级（4列）'}</p><p class="subtle">默认起点：${esc(dim.rows[origin.startRow]?.name||'首个子维度')} / ${esc(mc.columns(dim)[origin.startColumn])}。有表头时按等级匹配，有名称列时匹配或新增子维度。</p><label>粘贴表格内容<textarea id="matrix-paste-source" placeholder="支持从 Excel、网页表格或 AI Markdown 表格复制粘贴"></textarea></label><div class="matrix-actions"><label><input type="checkbox" id="matrix-paste-header">首行为等级表头</label><label><input type="checkbox" id="matrix-paste-names">首列为子维度名称</label><button class="secondary" id="matrix-paste-preview">解析预览</button></div><p id="matrix-paste-error" class="form-error" role="alert"></p><div id="matrix-paste-result"></div><div class="actions"><span class="subtle">空白单元格跳过，不清空已有内容。</span><button class="primary" id="matrix-paste-apply" disabled>确认填入矩阵</button></div>`);
  const source=mask.querySelector('#matrix-paste-source'),header=mask.querySelector('#matrix-paste-header'),names=mask.querySelector('#matrix-paste-names'),error=mask.querySelector('#matrix-paste-error'),apply=mask.querySelector('#matrix-paste-apply');
  function invalidate(){plan=null;apply.disabled=true;mask.querySelector('#matrix-paste-result').innerHTML=''}
  function suggest(){try{const rows=mc.parseText(source.value);const offset=mc.headerIndex(rows[0][0],dim.basis)<0?1:0;if(rows[0].length>offset&&rows[0].slice(offset).every(label=>mc.headerIndex(label,dim.basis)>=0)){header.checked=true;names.checked=offset===1}}catch{}}
  function preview(){invalidate();error.textContent='';try{
    if(matrixState!==state||JSON.stringify(dim)!==baseline)throw Error('矩阵已变更，请重新打开粘贴窗口');
    plan=mc.pastePlan(dim,mc.parseText(source.value),{...origin,header:header.checked,rowNames:names.checked});
    mask.querySelector('#matrix-paste-result').innerHTML=`<p class="form-notice">将填入 ${plan.changes.length} 格 · 新增 ${plan.newRows} 个子维度 · 覆盖 ${plan.overwrites} 格已有内容</p><div class="matrix-paste-scroll"><table class="table"><thead><tr><th>子维度</th><th>等级</th><th>原内容</th><th>待填入</th></tr></thead><tbody>${plan.changes.map(c=>`<tr><td>${esc(c.row)}</td><td>${esc(c.column)}</td><td>${esc(c.previous||'空白')}</td><td>${esc(c.value)}</td></tr>`).join('')}</tbody></table></div>`;apply.disabled=false;
  }catch(e){error.textContent=e.message}}
  source.oninput=invalidate;header.onchange=invalidate;names.onchange=invalidate;
  source.onpaste=e=>{const html=e.clipboardData.getData('text/html');if(html){e.preventDefault();try{source.value=clipboardTableText(html,e.clipboardData.getData('text/plain'));invalidate();suggest();preview()}catch(err){error.textContent=err.message}}else setTimeout(()=>{suggest();preview()},0)};
  mask.querySelector('#matrix-paste-preview').onclick=preview;
  apply.onclick=()=>{if(!plan)return;if(matrixState!==state||JSON.stringify(dim)!==baseline){error.textContent='矩阵已变更，请重新预览';return}const before=mc.clone(dim),index=state.active;state.matrix.dimensions[index]=plan.dimension;matrixChanged();state.undo={index,dimension:before};document.querySelector('#matrix-undo').disabled=false;mask.close();renderMatrixDimension();toast(`已填入 ${plan.changes.length} 格，保存后才写入系统`)};
  try{source.value=clipboardTableText(html,plain);if(source.value){suggest();preview()}}catch(e){error.textContent=e.message}source.focus();
}
function undoMatrixPaste(){const state=matrixState;if(!state.undo)return;state.matrix.dimensions[state.undo.index]=state.undo.dimension;state.active=state.undo.index;matrixChanged();renderMatrixDimension();toast('已撤销本次粘贴')}

async function openPositionEditor(id){
  try{
    const data=await api(`/api/admin/job-taxonomy/${id}/positions`);
    const mask=matrixDialog('子类职级岗位名称',`<p>${esc(taxonomyName(id))} · 每个职级一个岗位名称</p><p class="subtle">修改只影响后续标准保存。已存档标准和已有申请的岗位名称保持不变。</p><form><div class="matrix-position-fields">${mc.grades.map((name,i)=>`<label>${name} · ${mc.tiers[mc.tierIndex(i+1)]}<input data-position="${i+1}" maxlength="200" value="${esc(data.positions[i+1]||'')}"></label>`).join('')}</div><details><summary>批量粘贴岗位名称</summary><textarea data-paste placeholder="粘贴7行岗位名称，或两列表格：职级、岗位名称"></textarea><button type="button" data-fill class="secondary">预填到上方，检查后保存</button></details><p class="form-error" role="alert"></p><button class="primary">保存岗位名称</button></form>`);
    mask.querySelector('[data-fill]').onclick=()=>{const error=mask.querySelector('.form-error');error.textContent='';try{let rows=mc.parseText(mask.querySelector('[data-paste]').value);if(rows[0].length===2&&['职级','等级'].includes(rows[0][0]))rows=rows.slice(1);if(!rows.length||rows.length>7||![1,2].includes(rows[0].length))throw Error('请粘贴1至7行、一列岗位名称或两列职级与岗位名称');const updates=[],seen=new Set();rows.forEach((row,i)=>{const index=row.length===2?mc.headerIndex(row[0],'grade'):i;if(index<0||seen.has(index))throw Error('职级超出范围或重复');seen.add(index);const name=row.at(-1).trim();if(name.length>200)throw Error('岗位名称不能超过200字');updates.push([index,name])});updates.forEach(([index,name])=>mask.querySelector(`[data-position="${index+1}"]`).value=name)}catch(e){error.textContent=e.message}};
    mask.querySelector('form').onsubmit=async e=>{e.preventDefault();const buttons=[...mask.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{const positions={};mask.querySelectorAll('[data-position]').forEach(input=>positions[input.dataset.position]=input.value);await api(`/api/admin/job-taxonomy/${id}/positions`,{method:'POST',body:JSON.stringify({positions,original:data.positions})});mask.close();toast('岗位名称已保存');if(matrixState&&!matrixState.template&&!matrixState.readOnly&&document.querySelector('#matrix-subcategory')?.value===id)await loadMatrixPositions()}catch(err){mask.querySelector('.form-error').textContent=err.message;buttons.forEach(b=>b.disabled=false)}};
  }catch(e){toast(e.message)}
}
function matrixSnapshotHtml(standard){
  return `<div class="matrix-history">${standard.matrix.dimensions.map(dim=>`<h3>${esc(dim.name)} · ${dimensionBasisLabel(dim)}</h3><div class="matrix-scroll"><table class="matrix-grid"><thead><tr><th>子维度</th>${matrixColumnHeaders(dim,standard.positions||{})}</tr></thead><tbody>${dim.rows.map(row=>`<tr><th>${esc(row.name)}</th>${mc.columns(dim).map((_,i)=>`<td class="matrix-snapshot-cell">${esc(row.cells[String(i+1)]||'待编写')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`).join('')}</div>`;
}
function matrixReferenceHtml(submission){
  const snapshot=applicationStandardSnapshot(submission);
  return `<section class="standard-reference"><h2 class="section-title">分级标准参考</h2><p>${esc(snapshot.name)} · V${snapshot.version_number} · ${esc(snapshot.level)}${snapshot.positionName?' · '+esc(snapshot.positionName):''}</p>${(snapshot.resolved||[]).map(dim=>`<details class="panel reference-section"><summary>${esc(dim.name)} · 已包含低等级要求</summary><div>${dim.rows.map(row=>`<h4>${esc(row.name)}</h4><p>${esc(row.text||(row.pending?'（该等级标准待补充）':'无新增要求'))}</p>`).join('')}</div></details>`).join('')}</section>`;
}
function matrixApplicationModules(detail,editable){
  const snapshot=applicationStandardSnapshot(detail.submission);
  return `<p class="form-notice">${esc(snapshot.level)}${snapshot.positionName?' · '+esc(snapshot.positionName):''} · 要求已自动包含低等级内容。</p>`+(snapshot.resolved||[]).map(dim=>`<section><h2 class="section-title">${esc(dim.name)}</h2>${detail.modules.filter(m=>m.evaluation_item===dim.name).map((m,i)=>isBasicConditionModule(m)?`<article class="panel evidence-form-card basic-condition-card"><h3>${esc(m.module_name)}</h3><div class="evidence-form-grid"><div class="readonly-standard">${esc(m.standard)}</div><div><label>初筛结果</label><p class="basic-condition-mark">${esc(m.evidence||BASIC_CONDITION_MARK)}</p>${applicationItemAttachments(m,editable)}</div></div></article>`:m.section_type==='reference'?`<article class="panel evidence-form-card"><h3>${esc(m.module_name)}</h3><div class="evidence-form-grid"><div class="readonly-standard">${esc(m.standard)}</div><div><label>举证说明</label><textarea class="application-evidence" data-module="${m.id}" ${editable?'':'disabled'}>${esc(m.evidence||'')}</textarea><label>自评说明（不计分）</label><input class="application-self-score" data-module="${m.id}" ${editable?'':'disabled'} value="${esc(m.self_score||'')}">${applicationItemAttachments(m,editable)}</div></div></article>`:applicationModuleCard(m,i,editable)).join('')}</section>`).join('');
}
async function chooseMatrixApplication(standardId){
  try{const data=await api('/api/standards'),standard=data.items.find(s=>s.id===standardId);if(!standard?.matrix)return false;
    const mask=matrixDialog('选择申报职级',`<p>${esc(standard.name)} · V${standard.version_number}</p><label>申报职级<select id="matrix-application-grade">${mc.grades.map((g,i)=>`<option value="${i+1}">${g} · ${mc.tiers[mc.tierIndex(i+1)]}${standard.positions[i+1]?' · '+esc(standard.positions[i+1]):''}</option>`).join('')}</select></label><p class="subtle">引用本存档版本对应职级及低等级的完整要求。</p><p class="form-error" role="alert"></p><button class="primary" data-create>开始填写举证</button>`);
    mask.querySelector('[data-create]').onclick=async()=>{const button=mask.querySelector('[data-create]');button.disabled=true;try{const d=await api('/api/my/applications',{method:'POST',body:JSON.stringify({standardId,grade:Number(mask.querySelector('select').value)})});mask.close();openApplication(d.submission.id)}catch(e){mask.querySelector('.form-error').textContent=e.message;button.disabled=false}};return true;
  }catch(e){toast(e.message);return true}
}

function setupMatrixReview(detail){
  const before=document.querySelector('#behavior-section');
  const scoring=detail.modules.filter(m=>m.section_type!=='bonus'),missing=scoring.some(m=>m.weight==null||m.weight<=0)||Math.abs(scoring.reduce((n,m)=>n+Number(m.weight||0),0)-1)>.001;
  if(missing)before.insertAdjacentHTML('beforebegin','<p class="form-notice">本申请尚未完整配置各维度评分权重，当前折算总分不能作为评审结果；请由管理员配置权重后再评分。</p>');
  if(currentActor?.role==='管理员'&&!window.currentReviewToken&&!publicReviewMode&&scoring.length){
    before.insertAdjacentHTML('beforebegin',`<details class="panel reference-section"><summary>分级标准申请 · 评分权重配置</summary><div><p>标准开发仅编写要求。这里由管理员统一配置本标准全部普通评分子项的权重（成果贡献加分项除外），合计100%；已有评审记录后锁定。</p><form id="matrix-weights-form">${scoring.map(m=>`<label>${esc(m.evaluation_item)} / ${esc(m.module_name)}（%）<input type="number" min="0" max="100" step="any" data-weight-id="${m.id}" value="${m.weight==null?'':m.weight*100}" ${detail.review?'disabled':''}></label>`).join('')}<p class="form-error" role="alert"></p><button class="primary" ${detail.review?'disabled':''}>保存评分权重</button></form></details>`);
    document.querySelector('#matrix-weights-form').onsubmit=async e=>{e.preventDefault();const weights={};e.target.querySelectorAll('[data-weight-id]').forEach(input=>weights[input.dataset.weightId]=Number(input.value)/100);const button=e.target.querySelector('button');button.disabled=true;try{await api(`/api/admin/submissions/${detail.submission.id}/matrix-weights`,{method:'POST',body:JSON.stringify({weights})});toast('评分权重已配置');await openSubmission(detail.submission.id)}catch(err){e.target.querySelector('.form-error').textContent=err.message;button.disabled=false}};
  }
}

/* 从举证任务配置入口直接打开，按子维度为某位举证人分配评分权重。 */
async function openMatrixWeights(submissionId,onSaved){
  try{
    const detail=await api(`/api/submissions/${submissionId}`);
    const scoring=(detail.modules||[]).filter(m=>m.section_type!=='bonus');
    if(!scoring.length)return toast('该申请没有可配置权重的普通评分维度');
    const locked=!!detail.review;
    const mask=matrixDialog('配置子维度评分权重',`<div class="matrix-weights-head"><strong>${esc(detail.submission.name)}</strong><span>${esc(detail.submission.level||'')} · ${esc(detail.submission.category||'')}</span></div><p class="subtle">按子维度分配权重，合计必须为100%；成果贡献加分项不计权重。${locked?'已有评审记录，权重已锁定。':''}</p><form id="matrix-weights-dialog-form"><div class="matrix-weights-list">${scoring.map(m=>`<label><span>${esc(m.evaluation_item)} / ${esc(m.module_name)}</span><span class="matrix-weight-field"><input type="number" min="0" max="100" step="any" data-weight-id="${m.id}" value="${m.weight==null?'':(m.weight*100).toFixed(4)}" ${locked?'disabled':''}> %</span></label>`).join('')}</div><p class="form-error" role="alert"></p><div class="actions"><button type="button" class="secondary" data-close>取消</button><button class="primary" type="submit" ${locked?'disabled':''}>保存权重</button></div></form>`);
    mask.querySelector('[data-close]').onclick=()=>mask.close();
    mask.querySelector('#matrix-weights-dialog-form').onsubmit=async e=>{e.preventDefault();const weights={};e.target.querySelectorAll('[data-weight-id]').forEach(input=>weights[input.dataset.weightId]=Number(input.value)/100);const button=e.target.querySelector('button[type="submit"]');button.disabled=true;try{await api(`/api/admin/submissions/${submissionId}/matrix-weights`,{method:'POST',body:JSON.stringify({weights})});mask.close();toast('子维度评分权重已配置');if(onSaved)await onSaved()}catch(err){e.target.querySelector('.form-error').textContent=err.message;button.disabled=false}};
  }catch(e){toast(e.message)}
}
function upgradeLegacyMatrix(){
  const original=window.currentStandard;
  const mask=matrixDialog('将旧标准升级为分级矩阵',`<p>原有内容不会自动推断适用等级。请选择归入的职级，系统将按维度口径放入对应职级或层级列；其余等级需继续编写。</p><p class="subtle">升级前请先保存旧表单修改。此操作使用最后保存的内容；保存矩阵后记录版本留痕，历史内容仍可回看。</p><label>原内容对应职级<select><option value="">请选择</option>${mc.grades.map((g,i)=>`<option value="${i+1}">${g}</option>`).join('')}</select></label><p class="form-error" role="alert"></p><button class="primary" data-upgrade>生成矩阵草稿</button>`);
  mask.querySelector('[data-upgrade]').onclick=async()=>{const grade=Number(mask.querySelector('select').value);if(!grade){mask.querySelector('.form-error').textContent='请指定原内容的职级';return}try{
    const template=await api('/api/admin/qualification-template'),s=mc.clone(original.standard);
    // Preserve all six legacy sections even if the current global template differs.
    const dimensions=qualificationSections.map((section,index)=>({id:section.key,name:section.name,basis:index===0||index>=4?'grade':'tier',columnStyle:'name',description:section.hint,reviewType:index===4?'standard':index===5?'bonus':'reference',rows:[]}));
    dimensions.forEach((dim,index)=>{const column=dim.basis==='grade'?grade:mc.tierIndex(grade)+1;if(index<4){const content=s.framework[dim.id]?.content;if(content)dim.rows.push({id:mc.uid(),name:dim.name,cells:{[column]:content}})}else original.modules.filter(m=>m.section_type===dim.id).forEach(m=>dim.rows.push({id:mc.uid(),name:m.module_name,cells:{[column]:m.standard||''}}))});
    s.matrix={schemaVersion:1,dimensions};mask.close();await openMatrixEditor({standard:s,modules:original.modules},{items:taxonomyNodes});matrixChanged();toast('已生成矩阵草稿，尚未保存')
  }catch(e){mask.querySelector('.form-error').textContent=e.message}};
}
