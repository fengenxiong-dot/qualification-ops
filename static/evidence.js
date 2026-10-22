const evidencePortalMode=/^\/evidence\/?$/.test(location.pathname);
let evidenceSession=sessionStorage.getItem('evidence-session')||'';
let evidenceDirty=false;
window.addEventListener('beforeunload',e=>{if(evidenceDirty){e.preventDefault();e.returnValue=''}});
function evidenceHeaders(extra={}){return evidencePortalMode&&evidenceSession?{...extra,'X-Evidence-Session':evidenceSession}:extra}
function evidenceFeedback(task){if(!task)return '';const feedback=task.events.filter(e=>['退回修改','管理员反馈'].includes(e.action)&&e.note);return `<section class="panel evidence-feedback"><h2 class="section-title">填写指引与处理记录</h2>${feedback.length?`<div class="evidence-feedback-alert" role="note"><h3>请重点查看并按以下意见修改</h3><p>${esc(feedback[0].action)} · ${esc(feedback[0].created_at)}</p><p class="evidence-text"><strong>${esc(feedback[0].note)}</strong></p></div>`:''}<p class="evidence-text">${esc(task.instructions||'请结合项目背景、本人行动、结果与数据逐项举证，并关联证明附件。')}</p>${task.events.filter(e=>e.note||['提交举证','材料定稿','退回修改'].includes(e.action)).map(e=>`<details class="${['退回修改','管理员反馈'].includes(e.action)?'evidence-feedback-important':''}" ${e.action==='退回修改'?'open':''}><summary>${esc(e.action)} · ${esc(e.created_at)} · ${esc(e.actor_name)}</summary><p class="evidence-text">${esc(e.note||'已完成本次提交')}</p></details>`).join('')}</section>`}
async function renderEvidenceTasks(){
  title.textContent='举证配置';document.body.classList.remove('review-mode','assigned-review-mode');
  app.innerHTML=`<div class="content"><section class="standard-hero"><div><h2>配置举证任务</h2><p>配置举证人、已存档的子类标准和认证等级，生成专属举证码。</p></div><button class="primary" onclick="newEvidenceTask()">＋ 配置举证人</button></section><section class="panel evidence-feedback"><h2 class="section-title">查看与跟进举证</h2><p>已配置举证人的状态、材料处理、子维度权重和举证码管理，请前往“举证进度”。</p><div class="matrix-actions"><button class="secondary" onclick="setView('dashboard')">查看举证进度</button><a class="secondary" href="/evidence" target="_blank" rel="noopener">举证人登录入口</a></div></section></div>`;
}
function setupEvidenceProgress(tasks){
  const host=document.querySelector('#evidence-progress');
  host.innerHTML=`<div class="toolbar"><h2 class="section-title">在线举证进度</h2><label>筛选状态 <select id="evidence-status"><option value="">全部</option>${['填报中','待管理员确认','退回修改','已定稿'].map(s=>`<option>${s}</option>`).join('')}</select></label><span id="evidence-task-count" class="subtle"></span></div><div id="evidence-task-list"></div>`;
  const render=()=>{
    const status=document.querySelector('#evidence-status').value,q=(document.querySelector('#search')?.value||'').trim().toLowerCase();
    const items=tasks.filter(x=>(!status||x.status===status)&&[x.name,x.employee_no,x.level,x.category].join(' ').toLowerCase().includes(q));
    document.querySelector('#evidence-task-count').textContent=`${items.length} / ${tasks.length} 项任务`;
    document.querySelector('#evidence-task-list').innerHTML=items.length?`<div class="standard-admin-grid">${items.map(x=>`<article class="panel"><span class="status-pill">${esc(x.status)}</span><h3>${esc(x.name)} · ${esc(x.level)}</h3><p>${esc(x.category)}</p>${x.employee_no?`<p class="subtle">工号 ${esc(x.employee_no)} · 配置时职级 ${esc(x.current_level||'—')}</p>`:''}<p class="subtle">${x.submitted_at?'提交：'+esc(x.submitted_at):'尚未提交'}</p><div class="matrix-actions"><button class="primary" onclick="openEvidenceAdmin('${x.id}')">查看与处理</button><button class="secondary" onclick="openMatrixWeights('${x.id}')">配置子维度权重</button><button class="secondary" onclick="resetEvidenceCode('${x.id}')">重置举证码</button></div></article>`).join('')}</div>`:tasks.length?'<div class="panel empty">没有符合筛选条件的举证人，请调整状态或搜索条件。</div>':'<div class="panel empty"><p>暂无举证任务。</p><button class="primary" onclick="setView(\'evidence-tasks\')">前往举证配置</button></div>';
  };
  document.querySelector('#evidence-status').onchange=render;render();
  return render;
}
async function newEvidenceTask(){
  const [data,personnel]=await Promise.all([api('/api/admin/standards'),api('/api/admin/personnel')]),items=latestArchivedStandards(data.items).filter(s=>s.matrix);
  const mask=matrixDialog('配置举证人',`<form id="evidence-task-form"><label for="evidence-employee-no">工号（唯一身份）</label><input id="evidence-employee-no" maxlength="80" required autocomplete="off" placeholder="填写工号；已有工号会自动匹配档案"><p class="subtle" id="evidence-identity-hint">首次配置会同步建立人员职级档案；同一工号的后续认证自动归入原档案。</p><label for="evidence-person">举证人姓名</label><input id="evidence-person" maxlength="100" required><label for="evidence-current-level">当前职级</label><input id="evidence-current-level" maxlength="80" required list="evidence-current-levels" placeholder="例如：二级、T3，尚无职级可填未定级"><datalist id="evidence-current-levels">${MatrixCore.grades.map(g=>`<option value="${esc(g)}">`).join('')}<option value="未定级"></datalist><label for="evidence-standard">子类标准（最新存档）</label><select id="evidence-standard" required><option value="">请选择</option>${items.map(s=>`<option value="${s.id}">${esc(standardPath(s))} · ${esc(s.name)} V${s.version_number}</option>`).join('')}</select><label for="evidence-grade">认证等级</label><select id="evidence-grade" required><option value="">请选择</option>${MatrixCore.grades.map((g,i)=>`<option value="${i+1}">${g} · ${MatrixCore.tiers[MatrixCore.tierIndex(i+1)]}</option>`).join('')}</select><label for="evidence-instructions">填写指引（可选）</label><textarea id="evidence-instructions" maxlength="10000" placeholder="说明举证范围、材料要求等"></textarea><p class="subtle">首次填写的当前职级作为人员档案的初始职级；认证等级仅表示本次申报目标。已有工号沿用当前档案，不覆盖初始职级。</p>${items.length?'':'<p class="form-error">请先存档分级矩阵标准；旧版标准需先迭代升级。</p>'}<p class="form-error" role="alert" id="evidence-create-error"></p><button class="primary" ${items.length?'':'disabled'}>生成举证码</button></form>`);
  let matchedNo='';
  mask.querySelector('#evidence-employee-no').onchange=()=>{
    const input=mask.querySelector('#evidence-employee-no'),number=input.value.trim().toUpperCase();input.value=number;
    const matches=personnel.items.filter(p=>(p.employee_no||'').toUpperCase()===number),person=matches.length===1?matches[0]:null;
    const name=mask.querySelector('#evidence-person'),level=mask.querySelector('#evidence-current-level'),hint=mask.querySelector('#evidence-identity-hint');
    if(person){name.value=person.name;level.value=person.currentLevel||'';name.readOnly=true;level.readOnly=!!person.currentLevel;hint.textContent='已匹配人员档案：后续认证自动关联，沿用档案中的当前职级。';matchedNo=number}
    else{name.readOnly=false;level.readOnly=false;if(matchedNo){name.value='';level.value=''}matchedNo='';hint.textContent=matches.length>1?'该工号存在多份历史档案，请先核对。':'新工号：填写姓名和当前职级后，将同步建档并关联本次认证。'}
  };
  let pending=false;mask.querySelector('form').onsubmit=async e=>{e.preventDefault();if(pending)return;pending=true;const button=e.submitter;button.disabled=true;try{const result=await api('/api/admin/evidence-tasks',{method:'POST',body:JSON.stringify({name:mask.querySelector('#evidence-person').value,employeeNo:mask.querySelector('#evidence-employee-no').value,currentLevel:mask.querySelector('#evidence-current-level').value,standardId:mask.querySelector('#evidence-standard').value,grade:Number(mask.querySelector('#evidence-grade').value),instructions:mask.querySelector('#evidence-instructions').value})});mask.close();await renderEvidenceTasks();showEvidenceCode(result)}catch(error){mask.querySelector('#evidence-create-error').textContent=error.message}finally{pending=false;button.disabled=false}};
}
function showEvidenceCode(result){const mask=matrixDialog('举证码已生成',`<p>请单独发给对应举证人；完整码仅在本次显示，忘记后可重置。</p><label>登录地址<input readonly value="${esc(location.origin+'/evidence')}"></label><label>举证码<input readonly value="${esc(result.code)}"></label><p class="subtle">凭码可访问对应材料，请勿公开分享。当前会话有效期为8小时。</p><div class="actions"><button class="secondary" data-copy>复制地址与举证码</button>${result.submission?`<button class="primary" data-weights>下一步：配置子维度权重</button>`:''}</div>`);mask.querySelector('[data-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(`在线举证：${location.origin}/evidence\n举证码：${result.code}`);toast('已复制')}catch{toast('请选中文本手动复制')}};if(result.submission)mask.querySelector('[data-weights]').onclick=async()=>{mask.close();await openMatrixWeights(result.submission.id)}}
async function resetEvidenceCode(id){if(!await matrixConfirm('重置后原举证码和已登录会话将失效，确定继续？'))return;try{showEvidenceCode(await api(`/api/admin/evidence-tasks/${id}/reset-code`,{method:'POST',body:'{}'}))}catch(e){toast(e.message)}}
async function openEvidenceAdmin(id){await openSubmission(id)}
function setupEvidenceAdmin(d){
  const task=d.evidenceTask;if(!task)return;
  // The review entry stays a reviewer view even when an administrator opens its link.
  if(currentActor?.role!=='管理员'||window.currentReviewToken||publicReviewMode)return;
  const block=document.createElement('section');block.className='panel evidence-admin';
  const admin=currentActor?.role==='管理员'&&!window.currentReviewToken;
  block.innerHTML=evidenceFeedback(task)+(admin?`<h2 class="section-title">材料确认 · ${esc(d.submission.status)}</h2><label for="evidence-feedback-note">反馈意见</label><textarea id="evidence-feedback-note" maxlength="10000" placeholder="填写修改建议，退回时必填"></textarea><p class="form-error" id="evidence-decision-error" role="alert"></p><div class="matrix-actions"><button class="secondary" data-decision="feedback">发送反馈</button>${d.submission.status==='待管理员确认'?'<button class="secondary" data-decision="return">退回修改</button><button class="primary" data-decision="finalize">确认定稿</button>':''}${task.finalizedAt?'<button class="primary" data-assign>分配评委</button>':''}</div>`:'');
  document.querySelector('.reviewer-bar').before(block);
  if(admin){block.insertAdjacentHTML('afterbegin',evidenceChangesHtml(task.changes));highlightEvidenceChanges(task.changes,block)}
  if(admin){
    block.querySelectorAll('[data-decision]').forEach(button=>button.onclick=async()=>{const action=button.dataset.decision,note=block.querySelector('textarea').value;if(action==='finalize'&&!await matrixConfirm('定稿后举证材料锁定，可分配评委，不能再退回修改。确定定稿？'))return;block.querySelectorAll('button').forEach(b=>b.disabled=true);try{await api(`/api/admin/evidence-tasks/${d.submission.id}/decision`,{method:'POST',body:JSON.stringify({action,note,revision:task.revision})});toast('已处理');await openEvidenceAdmin(d.submission.id)}catch(e){block.querySelector('#evidence-decision-error').textContent=e.message;block.querySelectorAll('button').forEach(b=>b.disabled=false)}});
    block.querySelector('[data-assign]')?.addEventListener('click',()=>openAssignmentConfiguration(d.submission.id));
    // Administrators confirm submitted evidence here; they do not edit it on behalf of candidates.
    document.querySelector('.manual-attachment-bar')?.remove();
  }
  if(!task.finalizedAt){document.querySelectorAll('.reviewer-bar,.live-score,.score-breakdown,#qualitative,.score-panel').forEach(el=>el.style.display='none');document.querySelectorAll('.module-score,.module-comment').forEach(el=>el.disabled=true);const bar=document.querySelector('.review-content .savebar');if(bar)bar.innerHTML='<span>管理员定稿后方可分配评委、评审打分。</span>'}
}
async function renderEvidencePortal(){
  document.querySelector('.sidebar').hidden=true;document.querySelector('.topbar-actions').hidden=true;document.body.classList.add('evidence-portal');title.textContent='在线举证';
  if(evidenceSession){try{const me=await api('/api/evidence/me');currentActor=me.user;await openApplication(me.user.evidenceId);return}catch(error){if(error.status!==401){app.innerHTML=`<div class="content panel empty"><h2>加载未完成</h2><p>${esc(error.message)}</p><button class="secondary" onclick="renderEvidencePortal()">重试</button></div>`;return}evidenceSession='';sessionStorage.removeItem('evidence-session')}}
  currentActor=null;app.innerHTML=`<div class="content"><section class="panel evidence-login"><h2>凭举证码登录</h2><p>请输入管理员发给你的举证码，进入指定子类和认证等级的材料填报页面。</p><form id="evidence-login-form"><label for="evidence-login-code">举证码</label><input id="evidence-login-code" type="password" autocomplete="off" required maxlength="100"><button type="button" class="secondary" id="evidence-code-visibility">显示举证码</button><p role="alert" class="form-error"></p><button class="primary">登录并填写举证</button></form></section></div>`;
  document.querySelector('#evidence-code-visibility').onclick=()=>{const input=document.querySelector('#evidence-login-code');input.type=input.type==='password'?'text':'password';document.querySelector('#evidence-code-visibility').textContent=input.type==='password'?'显示举证码':'隐藏举证码'};
  let pending=false;document.querySelector('#evidence-login-form').onsubmit=async e=>{e.preventDefault();if(pending)return;pending=true;const button=e.submitter;button.disabled=true;try{const login=await api('/api/evidence/login',{method:'POST',body:JSON.stringify({code:document.querySelector('#evidence-login-code').value})});evidenceSession=login.sessionToken;sessionStorage.setItem('evidence-session',evidenceSession);await renderEvidencePortal()}catch(error){document.querySelector('#evidence-login-form .form-error').textContent=error.message}finally{pending=false;button.disabled=false}};
}
function setupEvidenceApplication(d,editable){
  const updateProgress=()=>updateEvidenceProgress(d);
  document.querySelectorAll('.application-evidence').forEach(el=>el.addEventListener('input',updateProgress));
  updateProgress();
  if(!d.evidenceTask)return;
  document.querySelector('.application-basic').before(document.createRange().createContextualFragment(evidenceFeedback(d.evidenceTask)));
  document.querySelector('#application-name').readOnly=true;
  document.querySelector('.application-editor .back-button').onclick=()=>logoutEvidence();
  document.querySelector('.application-editor .back-button').textContent='退出举证登录';
  const refresh=document.createElement('button');refresh.className='secondary';refresh.textContent='刷新反馈与状态';refresh.onclick=async()=>{if(evidenceDirty&&!await matrixConfirm('刷新会放弃尚未保存的文字，确定继续？'))return;evidenceDirty=false;renderEvidencePortal()};document.querySelector('.application-editor .back-button').after(refresh);
  document.querySelectorAll('.application-editor textarea,.application-editor input').forEach(el=>el.addEventListener('input',()=>{evidenceDirty=true}));
  document.querySelectorAll('.candidate-attachment-list a[href^="/media/"]').forEach((a,i)=>{const path=a.getAttribute('href'),attachment=d.attachments.find(x=>x.uploaded_file_path&&path.includes(encodeURI(x.uploaded_file_path.replaceAll('\\','/'))));if(attachment&&evidencePortalMode){a.removeAttribute('href');a.setAttribute('role','button');a.tabIndex=0;a.onclick=()=>downloadEvidenceAttachment(attachment);a.onkeydown=e=>{if(e.key==='Enter')a.click()}}});
  if(d.evidenceTask.identity){const info=d.evidenceTask.identity;document.querySelector('.application-basic').insertAdjacentHTML('beforebegin',`<p class="form-notice">工号 ${esc(info.employeeNo)} · 当前职级 ${esc(info.currentLevel||'—')} · 本次认证等级 ${esc(d.submission.level)}</p>`)}
  const notice=document.querySelector('.application-editor .form-notice');notice.textContent=editable?'按指引填写文字举证，可保存草稿并上传附件；提交后等待管理员确认，退回后可继续修改。':'材料已提交，当前只读。管理员退回时可继续修改，刷新页面查看最新反馈。';
}
async function logoutEvidence(){if(evidenceDirty&&!await matrixConfirm('尚有未保存的举证文字，确定退出？'))return;await api('/api/evidence/logout',{method:'POST',body:'{}'});evidenceSession='';evidenceDirty=false;sessionStorage.removeItem('evidence-session');renderEvidencePortal()}
async function downloadEvidenceAttachment(a){try{const response=await fetch(`/api/evidence/attachments/${a.id}`,{headers:evidenceHeaders()});if(!response.ok)throw Error((await response.json()).error);const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=a.storage_path||a.material_name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}catch(e){toast(e.message)}}
function secureEvidenceMedia(){if(!window.currentDetail?.evidenceTask||!window.currentReviewToken)return;document.querySelectorAll('a[href^="/media/"],img[src^="/media/"],iframe[src^="/media/"]').forEach(el=>{const attr=el.tagName==='A'?'href':'src',url=new URL(el.getAttribute(attr),location.origin);url.searchParams.set('review',window.currentReviewToken);el.setAttribute(attr,url.pathname+url.search)})}

function updateEvidenceProgress(d){
  const required=evidenceRequiredModules(d.modules);
  const values=new Map([...document.querySelectorAll('.application-evidence')].map(el=>[el.dataset.module,el.value]));
  const filled=required.filter(m=>String(values.get(m.id)??m.evidence??'').trim()).length;
  const counter=document.querySelector('.application-progress strong');
  if(counter){counter.setAttribute('aria-live','polite');counter.textContent=`${filled}/${required.length}`}
}

function evidenceChangesHtml(changes){
  if(!changes)return '';
  const count=changes.modules.length,files=changes.attachments.length;
  return `<section class="evidence-change-summary"><h2 class="section-title">本轮修改：${count} 项文字 · ${files} 项附件变更${changes.pendingResubmission?'（尚未再次提交）':''}</h2><p>与 ${esc(changes.baselineAt)} 退回时的材料比较。</p>${!count&&!files?'<p>尚未发现内容变化。</p>':''}${changes.modules.map(m=>`<article><h3>${esc(m.dimension)} / ${esc(m.name)} <button class="secondary compact" data-change-jump="${esc(m.id)}">定位举证项</button></h3>${m.fields.map(f=>`<p><strong>${esc(f.label)} · 修改后</strong></p><div class="evidence-revised-text">${esc(f.after||'（已清空）')}</div><details><summary>查看修改前</summary><p class="evidence-text">${esc(f.before||'（原为空）')}</p></details>`).join('')}</article>`).join('')}${changes.attachments.map(a=>`<p class="evidence-revised-text">${esc(a.action)}：${esc(a.name)}</p>`).join('')}</section>`;
}
function highlightEvidenceChanges(changes,block){
  if(!changes)return;
  changes.modules.forEach(m=>{
    const card=document.getElementById('m-'+m.id)||document.querySelector(`[data-reference-module="${m.id}"]`);if(!card)return;
    card.classList.add('evidence-revised');if(card.tagName==='DETAILS')card.open=true;
    const badge=document.createElement('strong');badge.className='evidence-revised-badge';badge.textContent='本轮已修改';(card.querySelector('summary,h3')||card).append(badge);
  });
  block.querySelectorAll('[data-change-jump]').forEach(button=>button.onclick=()=>{const id=button.dataset.changeJump,card=document.getElementById('m-'+id)||document.querySelector(`[data-reference-module="${id}"]`);card?.scrollIntoView({behavior:'smooth',block:'center'})});
}

let evidenceUploading=false;
function applicationAttachmentList(items,editable){
  const d=window.currentApplication;
  return `<div class="candidate-attachment-list">${items.map(a=>{
    const owners=d.modules.filter(m=>(m.attachment_ids||[]).includes(a.id));
    return `<div><span><strong>${esc(a.material_name)}</strong><small>${esc(owners.map(m=>(m.evaluation_item||'')+' / '+m.module_name).join('、')||'尚未指定举证项')}</small></span><div class="candidate-file-actions">${a.uploaded_file_path?`<button type="button" class="secondary compact" onclick="downloadApplicationAttachment('${a.id}')">下载文件</button>`:a.link_url?`<a class="secondary compact" href="${esc(a.link_url)}" rel="noopener noreferrer" target="_blank">打开链接</a>`:''}${editable?`<details><summary>调整归属</summary><label>仅对应一个举证项<select aria-label="${esc(a.material_name)}对应的举证项" onchange="reassignApplicationAttachment('${a.id}',this.value)"><option value="">请选择</option>${d.modules.map(m=>`<option value="${m.id}" ${owners.length===1&&owners[0].id===m.id?'selected':''}>${esc(m.evaluation_item)} / ${esc(m.module_name)}</option>`).join('')}</select></label></details><button type="button" class="danger compact" onclick="removeApplicationAttachment('${a.id}')">删除</button>`:''}</div></div>`;
  }).join('')}</div>`;
}
function applicationItemAttachments(module,editable){
  const d=window.currentApplication,items=d.attachments.filter(a=>(module.attachment_ids||[]).includes(a.id));
  return `<section class="application-item-attachments" data-attachment-module="${module.id}"><h4>本项举证附件 · ${items.length} 份</h4><p class="subtle">可添加多份材料，每份材料仅对应本举证项。</p>${applicationAttachmentList(items,editable)}${editable?`<details class="item-upload"><summary>＋ 为本项添加附件或链接</summary><div class="candidate-item-upload"><label>材料名称（文件可不填）<input class="item-material-name" placeholder="例如：项目成果报告"></label><label>选择文件（可多选）<input class="item-files" type="file" multiple accept=".png,.jpg,.jpeg,.gif,.webp,.bmp,.tif,.tiff,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf,.odt,.ods,.odp,.zip,.7z"></label><label>或填写文档链接<input class="item-link" type="url" placeholder="https://"></label><button type="button" class="secondary" onclick="uploadEvidenceFiles('${module.id}')">上传并关联本项</button></div></details>`:items.length?'':'<p class="subtle">未提供附件</p>'}</section>`;
}
function applicationUnassignedAttachments(d,editable){
  const items=d.attachments.filter(a=>d.modules.filter(m=>(m.attachment_ids||[]).includes(a.id)).length!==1);
  if(!items.length)return '';
  return `<section class="panel application-attachments"><h2>待调整归属的历史附件</h2><p class="form-notice">以下附件尚未关联或关联了多个举证项。请为每份材料指定唯一归属后再提交。</p>${applicationAttachmentList(items,editable)}</section>`;
}
async function downloadApplicationAttachment(id){
  const a=window.currentApplication.attachments.find(x=>x.id===id);
  if(evidencePortalMode)return downloadEvidenceAttachment(a);
  const link=document.createElement('a');link.href='/media/'+a.uploaded_file_path.replaceAll('\\','/').split('/').map(encodeURIComponent).join('/')+'?download=1';link.download=a.storage_path||a.material_name;link.click();
}
async function reassignApplicationAttachment(attachmentId,moduleId){
  if(!moduleId)return;
  if(evidenceUploading)return;
  evidenceUploading=true;
  try{
    if(!await saveApplication(false,true))return;
    const id=window.currentApplication.submission.id;
    await api(`/api/my/applications/${id}/attachments/${attachmentId}/assign`,{method:'POST',body:JSON.stringify({moduleId})});
    await openApplication(id);toast('附件归属已更新，仅关联所选举证项');
  }catch(e){toast(e.message)}finally{evidenceUploading=false}
}
async function refreshApplicationAttachments(){
  const current=window.currentApplication;
  const latest=await api(`/api/my/applications/${current.submission.id}`);
  // Update attachments only: keep the text fields, focus and current reading position.
  const {scrollX,scrollY}=window;
  current.attachments=latest.attachments;
  current.evidenceTask=latest.evidenceTask;
  current.modules.forEach(module=>{
    module.attachment_ids=latest.modules.find(m=>m.id===module.id)?.attachment_ids||[];
    const box=document.querySelector(`[data-attachment-module="${module.id}"]`);
    if(!box)return;
    const items=current.attachments.filter(a=>module.attachment_ids.includes(a.id));
    box.querySelector('h4').textContent=`本项举证附件 · ${items.length} 份`;
    box.querySelector('.candidate-attachment-list').outerHTML=applicationAttachmentList(items,true);
  });
  window.scrollTo({left:scrollX,top:scrollY,behavior:'instant'});
}
async function uploadEvidenceFiles(itemModuleId){
  if(evidenceUploading)return;
  const moduleId=itemModuleId;
  if(!moduleId)return toast('请在对应举证项下添加附件');
  const box=document.querySelector(`[data-attachment-module="${moduleId}"]`);
  const files=[...box.querySelector('.item-files').files],link=box.querySelector('.item-link').value.trim(),materialName=box.querySelector('.item-material-name').value.trim();
  if(!files.length&&!link)return toast('请选择附件或填写文档地址');
  if(files.length&&link)return toast('文件与链接请分开添加');
  if(!files.length&&!materialName)return toast('请填写链接材料名称');
  evidenceUploading=true;const buttons=[...document.querySelectorAll('.application-editor button')];buttons.forEach(b=>b.disabled=true);
  try{
    if(!await saveApplication(false,true))return;
    const id=window.currentApplication.submission.id;
    if(files.length){for(let i=0;i<files.length;i++){const file=files[i];toast(`上传 ${i+1}/${files.length}：${file.name}`);const response=await fetch(`/api/my/applications/${id}/attachments/upload`,{method:'POST',headers:evidenceHeaders({'X-Filename':encodeURIComponent(file.name),'X-Module-Id':moduleId,'X-Material-Name':encodeURIComponent(materialName||file.name),'Content-Type':'application/octet-stream'}),body:file});if(!response.ok)throw Error((await response.json()).error)}}
    else await api(`/api/my/applications/${id}/attachments/link`,{method:'POST',body:JSON.stringify({moduleId,materialName,linkUrl:link,storagePath:link})});
    await refreshApplicationAttachments();
    box.querySelector('.item-files').value='';
    box.querySelector('.item-link').value='';
    box.querySelector('.item-material-name').value='';
    toast('附件已添加并关联');
  }catch(e){toast(e.message);try{await refreshApplicationAttachments()}catch{toast('附件列表暂未更新，请稍后刷新反馈与状态')}}finally{evidenceUploading=false;buttons.forEach(b=>b.disabled=false)}
}
