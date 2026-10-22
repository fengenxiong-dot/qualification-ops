let personnelState={data:null,query:'',level:''};
let currentPersonnel=null;
const personnelScore=value=>value==null?'—':Number(value).toFixed(2);
function personnelForm(mask,save){
  let busy=false;mask.querySelector('form').onsubmit=async e=>{
    e.preventDefault();if(busy)return;busy=true;e.submitter.disabled=true;
    try{await save(Object.fromEntries(new FormData(e.target)),e.target);mask.close()}
    catch(error){mask.querySelector('.form-error').textContent=error.message}
    finally{busy=false;e.submitter.disabled=false}
  };
}
async function renderPersonnel(){
  document.body.classList.remove('review-mode','assigned-review-mode');title.textContent='人员职级';
  app.innerHTML='<div class="content loading"><div class="spinner"></div>加载人员职级档案…</div>';
  try{
    const data=await api('/api/admin/personnel');personnelState.data=data;
    const levels=[...new Set(data.items.map(p=>p.currentLevel).filter(Boolean))].sort();
    app.innerHTML=`<div class="content personnel-page"><section class="standard-hero"><div><h2>人员职级档案</h2><p>查看初始职级、历次认证与晋级记录，按生效日期汇总当前职级。</p></div><div class="matrix-actions"><button class="secondary" onclick="downloadPersonnel(false)">导出全部 Excel</button><button class="primary" onclick="setView('evidence-tasks')">配置举证人并建档</button></div></section><section class="stats"><div class="stat"><span class="stat-label">已建档人员</span><strong>${data.items.length}</strong></div><div class="stat"><span class="stat-label">认证记录</span><strong>${data.items.reduce((n,p)=>n+p.certificationCount,0)}</strong></div><div class="stat"><span class="stat-label">已生效晋级</span><strong>${data.items.reduce((n,p)=>n+p.promotionCount,0)}</strong></div><div class="stat"><span class="stat-label">待关联材料</span><strong>${data.unlinked.length}</strong></div></section><section class="result-filters panel"><input id="personnel-search" placeholder="搜索姓名、工号或部门" value="${esc(personnelState.query)}"><select id="personnel-level"><option value="">全部当前职级</option>${levels.map(level=>`<option ${level===personnelState.level?'selected':''}>${esc(level)}</option>`).join('')}</select><button class="secondary" onclick="downloadPersonnel(true)">导出筛选结果</button><span class="subtle">统计日期 ${esc(data.asOf)}</span></section><section><div class="toolbar"><h2 class="section-title">人员职级清单</h2><span id="personnel-count" class="subtle"></span></div><div id="personnel-list"></div></section><section class="personnel-unlinked"><h2 class="section-title">历史待关联认证材料</h2><p class="section-help">新配置的举证人已自动建档并关联。以下为历史遗留材料，请补充工号后核对关联，同名材料不会自动合并。</p><div id="personnel-unlinked"></div></section></div>`;
    const refresh=()=>{personnelState.query=document.querySelector('#personnel-search').value;personnelState.level=document.querySelector('#personnel-level').value;renderPersonnelRows()};
    document.querySelector('#personnel-search').oninput=refresh;document.querySelector('#personnel-level').onchange=refresh;refresh();
  }catch(e){app.innerHTML=`<div class="content panel empty"><p>${esc(e.message)}</p><button class="secondary" onclick="renderPersonnel()">重试</button></div>`}
}
function renderPersonnelRows(){
  const {data,query,level}=personnelState,q=query.trim().toLowerCase();
  const items=data.items.filter(p=>(!q||[p.name,p.employee_no,p.department].join(' ').toLowerCase().includes(q))&&(!level||p.currentLevel===level));
  document.querySelector('#personnel-count').textContent=`${items.length} / ${data.items.length} 人`;
  document.querySelector('#personnel-list').innerHTML=`<div class="panel personnel-table-wrap"><table class="table"><thead><tr><th>人员 / 工号</th><th>部门</th><th>初始职级</th><th>当前职级</th><th>认证次数</th><th>通过 / 未通过 / 待确认</th><th>已生效晋级</th><th>操作</th></tr></thead><tbody>${items.map(p=>`<tr class="personnel-row" tabindex="0" role="button" aria-label="查看${esc(p.name)}职级变迁" data-person-id="${p.id}"><td><strong>${esc(p.name)}</strong><div class="subtle">${esc(p.employee_no||'未录入工号')}</div></td><td>${esc(p.department||'—')}</td><td>${esc(p.initial_level||'待录入')}<div class="subtle">${esc(p.initial_date)}</div></td><td><span class="tag green">${esc(p.currentLevel||'待录入')}</span></td><td>${p.certificationCount}</td><td>${p.passedCount} / ${p.failedCount} / ${p.pendingCount}</td><td>${p.promotionCount} 次</td><td><button class="secondary compact">查看职级变迁</button></td></tr>`).join('')||'<tr><td colspan="8" class="subtle">暂无符合条件的人员，可新建档案或从下方材料建立档案。</td></tr>'}</tbody></table></div>`;
  document.querySelectorAll('[data-person-id]').forEach(row=>{row.onclick=()=>openPersonnel(row.dataset.personId);row.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openPersonnel(row.dataset.personId)}}});
  const unlinked=data.unlinked.filter(s=>(!q||[s.name,s.category].join(' ').toLowerCase().includes(q))&&!level);
  document.querySelector('#personnel-unlinked').innerHTML=`<div class="panel personnel-table-wrap"><table class="table"><thead><tr><th>姓名</th><th>申报职级</th><th>职类</th><th>申请日期</th><th>材料状态</th><th>操作</th></tr></thead><tbody>${unlinked.map(s=>`<tr><td>${esc(s.name)}</td><td>${esc(s.level||'—')}</td><td>${esc(s.category||'—')}</td><td>${esc(s.applied_at||'—')}</td><td>${esc(s.status)}</td><td><button class="primary compact" onclick="linkPersonnel('${s.id}')">建档 / 关联人员</button></td></tr>`).join('')||'<tr><td colspan="6" class="subtle">没有符合条件的待关联材料。</td></tr>'}</tbody></table></div>`;
}
function downloadPersonnel(filtered=false,personId=''){
  const query=new URLSearchParams();if(filtered){query.set('q',personnelState.query.trim());query.set('level',personnelState.level)}
  window.location.href=personId?`/api/admin/personnel/${personId}/export`:'/api/admin/personnel/export?'+query.toString();
}
async function editPersonnel(personId='',sourceId=''){
  try{
    const person=personId?(await api(`/api/admin/personnel/${personId}`)).person:{};
    const source=personnelState.data?.unlinked.find(s=>s.id===sourceId),locked=person.records?.some(r=>r.outcome!=='待确认');
    const mask=matrixDialog(personId?'维护人员档案':'新建人员档案',`<form id="personnel-form"><label>姓名<input name="name" required maxlength="200" value="${esc(person.name||source?.name||'')}"></label><label>工号（建议填写，用于区分同名人员）<input name="employeeNo" maxlength="80" value="${esc(person.employee_no||'')}"></label><label>部门<input name="department" maxlength="200" value="${esc(person.department||'')}"></label><div class="personnel-form-columns"><label>初始职级<input name="initialLevel" maxlength="80" placeholder="例如：二级、T3；未知可留空" value="${esc(person.initial_level||'')}" ${locked?'disabled':''}></label><label>初始职级日期<input name="initialDate" type="date" value="${esc(person.initial_date||'')}" ${locked?'disabled':''}></label></div>${locked?'<p class="subtle">已有确认记录，初始职级和日期已锁定。</p>':''}<label>备注<textarea name="note" maxlength="3000">${esc(person.note||'')}</textarea></label><p class="form-error" role="alert"></p><button class="primary">${sourceId?'保存并关联该认证材料':'保存档案'}</button></form>`);
    let createdId='';
    personnelForm(mask,async values=>{
      if(locked){values.initialLevel=person.initial_level;values.initialDate=person.initial_date}values.revision=person.revision;
      const result=createdId?{id:createdId}:await api(personId?`/api/admin/personnel/${personId}/save`:'/api/admin/personnel',{method:'POST',body:JSON.stringify(values)});
      if(!personId)createdId=result.id;
      if(sourceId)await api(`/api/admin/personnel/${result.id}/link`,{method:'POST',body:JSON.stringify({submissionId:sourceId})});
      toast('人员档案已保存');await openPersonnel(result.id);
    });
  }catch(e){toast(e.message)}
}
async function linkPersonnel(submissionId){
  try{
    const data=await api('/api/admin/personnel');personnelState.data=data;
    if(!data.items.length)return editPersonnel('',submissionId);
    const source=data.unlinked.find(s=>s.id===submissionId);if(!source)return toast('该材料已关联，请刷新清单');
    const mask=matrixDialog('关联认证材料',`<p>${esc(source.name)} · ${esc(source.level||'')} · ${esc(source.category||'')}</p><p class="subtle">请根据工号及实际身份核对人员，姓名相同不会自动认定为同一人。</p><form id="personnel-link-form"><label>选择人员<select required><option value="">请选择核对后的人员</option>${data.items.map(p=>`<option value="${p.id}">${esc(p.name)} · ${esc(p.employee_no||'未录入工号')} · ${esc(p.department||'未录入部门')}</option>`).join('')}</select></label><p class="form-error" role="alert"></p><div class="matrix-actions"><button class="secondary" type="button" data-new>新建人员并关联</button><button class="primary">确认关联</button></div></form>`);
    mask.querySelector('[data-new]').onclick=()=>{mask.close();editPersonnel('',submissionId)};
    personnelForm(mask,async(_,form)=>{const id=form.querySelector('select').value;await api(`/api/admin/personnel/${id}/link`,{method:'POST',body:JSON.stringify({submissionId})});toast('已关联到人员档案');await openPersonnel(id)});
  }catch(e){toast(e.message)}
}
async function openPersonnel(personId){
  document.body.classList.remove('review-mode','assigned-review-mode');title.textContent='人员职级变迁';
  app.innerHTML='<div class="content loading"><div class="spinner"></div>加载职级变迁…</div>';
  try{
    const data=await api(`/api/admin/personnel/${personId}`),p=data.person;currentPersonnel=p;
    app.innerHTML=`<div class="content personnel-page"><button class="ghost back-button" onclick="currentPersonnel=null;renderPersonnel()">← 返回人员职级清单</button><section class="overview-card personnel-overview"><div><div class="eyebrow">人员职级档案</div><h2>${esc(p.name)}</h2><p>${esc(p.employee_no||'未录入工号')} · ${esc(p.department||'未录入部门')}</p><p>${esc(p.note)}</p></div><div class="matrix-actions"><button class="secondary" onclick="editPersonnel('${p.id}')">维护档案</button><button class="secondary" onclick="downloadPersonnel(false,'${p.id}')">导出个人档案</button><button class="primary" onclick="editPersonnelRecord('${p.id}')">＋ 补录历史认证</button></div></section><section class="stats"><div class="stat"><span class="stat-label">初始职级</span><strong>${esc(p.initial_level||'待录入')}</strong><small>${esc(p.initial_date)}</small></div><div class="stat"><span class="stat-label">当前职级</span><strong>${esc(p.currentLevel||'待录入')}</strong></div><div class="stat"><span class="stat-label">认证次数</span><strong>${p.certificationCount}</strong><small>通过 ${p.passedCount} · 未通过 ${p.failedCount} · 待确认 ${p.pendingCount}</small></div><div class="stat"><span class="stat-label">已生效晋级</span><strong>${p.promotionCount} 次</strong></div></section><section class="personnel-timeline"><h2 class="section-title">职级变迁与认证记录</h2><article class="panel personnel-timeline-item"><span class="tag">初始职级</span><h3>${esc(p.initial_level||'待录入')}</h3><p class="subtle">${esc(p.initial_date||'日期未录入')}</p></article>${p.records.map(r=>personnelRecordHtml(p,r)).join('')||'<div class="panel empty">暂无认证记录，请从清单关联材料或补录历史认证。</div>'}</section><details class="panel personnel-audit"><summary>档案维护与修订留痕 · ${data.history.length} 条</summary>${data.history.map(h=>`<div><strong>${esc(h.action)}</strong><span class="subtle"> ${esc(h.created_at)} · ${esc(h.actor_name)}</span><p>${esc(h.note)}</p></div>`).join('')}</details></div>`;
  }catch(e){app.innerHTML=`<div class="content panel empty"><p>${esc(e.message)}</p><button class="secondary" onclick="renderPersonnel()">返回清单</button></div>`}
}
function personnelRecordHtml(person,r){
  const s=r.source,d=r.scoreData;
  return `<article class="panel personnel-timeline-item"><div class="personnel-record-head"><div><span class="status-pill ${r.outcome==='通过'?'done':r.outcome==='未通过'?'failed':'pending'}">${esc(r.outcome)}</span><span class="tag">${esc(s.origin)}</span><h3>${esc(s.category||'认证记录')} · 申报 ${esc(s.level||'未录入')}</h3></div><button class="secondary compact" onclick="editPersonnelRecord('${person.id}','${r.id}')">${r.outcome==='待确认'?'确认认证结论':'修订记录'}</button></div><div class="personnel-record-grid"><div><label>认证结论日期</label><strong>${esc(r.decided_on||'待确认')}</strong></div><div><label>职级变化</label><strong>${esc(r.beforeLevel||'未知')} → ${esc(r.outcome==='通过'?r.result_level:r.beforeLevel||'保持原职级')}</strong></div><div><label>晋级及生效</label><strong>${r.promoted?'晋级':'未晋级'} · ${esc(r.effectStatus)}</strong><small>${esc(r.effective_on)}</small></div><div><label>认证分数</label><strong>${personnelScore(d.weightedTotal)}</strong><small>${r.outcome==='待确认'?'当前评审数据':'确认时评分快照'}</small></div></div>${r.outcome==='待确认'&&r.submission_id?`<p class="form-notice">评审进度：${esc(d.status||'未开始')} · ${d.completedCount||0}/${d.assignmentCount||0} 位评委完成 · 权重合计 ${Math.round((d.weightTotal||0)*100)}%。${r.reviewReady?'可确认正式结论。':'全部评审完成且权重合计100%后，方可确认结论。'}</p>`:''}${d.reviewers?.length?`<details><summary>评委评分明细 · ${d.reviewers.length} 人</summary><div class="personnel-table-wrap"><table class="table"><thead><tr><th>评委</th><th>状态</th><th>权重</th><th>得分</th><th>加权贡献</th></tr></thead><tbody>${d.reviewers.map(v=>`<tr><td>${esc(v.reviewerName)}</td><td>${esc(v.status)}</td><td>${Math.round((v.weight||0)*100)}%</td><td>${personnelScore(v.score)}</td><td>${personnelScore(v.weightedContribution)}</td></tr>`).join('')}</tbody></table></div></details>`:''}${s.standardName?`<p class="subtle">认证标准：${esc(s.standardName)}${s.standardVersion?' · V'+esc(s.standardVersion):''}</p>`:''}<p class="evidence-text">${esc(r.note)}</p></article>`;
}
async function editPersonnelRecord(personId,recordId=''){
  try{
    const p=(await api(`/api/admin/personnel/${personId}`)).person,r=p.records.find(x=>x.id===recordId)||{},historical=!recordId;
    if(recordId&&r.outcome==='待确认'&&!r.reviewReady)return toast('请先完成全部评委评审，并确认评委汇总权重合计100%');
    const today=personnelState.data?.asOf||new Date().toLocaleDateString('sv-SE');
    const mask=matrixDialog(historical?'补录历史认证':r.outcome==='待确认'?'确认认证结论':'修订认证记录',`<p><strong>${esc(p.name)}</strong> · 当前职级 ${esc(p.currentLevel||'待录入')}</p><p class="subtle">认证分数不自动代表晋级。请依据正式结论填写，确认后按生效日期更新职级。</p><form id="personnel-record-form">${historical?'<label>申报职级<input name="appliedLevel" maxlength="80"></label><label>认证职类<input name="category" maxlength="200"></label><label>历史认证分数（可选）<input name="manualScore" type="number" min="0" max="1000" step="any"></label>':''}<label>认证结论<select name="outcome"><option ${r.outcome==='通过'?'selected':''}>通过</option><option ${r.outcome==='未通过'?'selected':''}>未通过</option></select></label><div class="personnel-form-columns"><label>结论日期<input name="decidedOn" type="date" required value="${esc(r.decided_on||today)}"></label><label data-passed>职级生效日期<input name="effectiveOn" type="date" value="${esc(r.effective_on||r.decided_on||today)}"></label></div><label data-passed>通过后的职级<input name="resultLevel" maxlength="80" value="${esc(r.result_level||p.currentLevel||'')}" placeholder="不晋级请填写保持的职级"></label><label class="personnel-checkbox" data-passed><input name="promoted" type="checkbox" ${r.promoted?'checked':''}> 本次认证产生晋级</label><label>说明${historical?'（必填：历史来源）':r.outcome&&r.outcome!=='待确认'?'（必填：修订原因）':''}<textarea name="note" maxlength="3000" ${historical||(r.outcome&&r.outcome!=='待确认')?'required':''}>${esc(r.note||'')}</textarea></label><p class="form-error" role="alert"></p><button class="primary">保存并确认</button></form>`);
    const outcome=mask.querySelector('[name="outcome"]'),toggle=()=>mask.querySelectorAll('[data-passed]').forEach(el=>{el.hidden=outcome.value!=='通过'});outcome.onchange=toggle;toggle();
    personnelForm(mask,async(values,form)=>{values.promoted=outcome.value==='通过'&&form.querySelector('[name="promoted"]').checked;values.revision=r.revision;await api(`/api/admin/personnel/${personId}/records${recordId?'/'+recordId:''}`,{method:'POST',body:JSON.stringify(values)});toast('认证结论已记录');await openPersonnel(personId)});
  }catch(e){toast(e.message)}
}
