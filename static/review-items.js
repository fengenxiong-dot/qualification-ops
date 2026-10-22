/* Shared reviewer presentation: every evidenced subdimension is evaluated in place. */
function reviewDimensionGroups(detail) {
  const groups=[];
  for(const module of detail.modules) {
    const bonus=module.section_type==='bonus';
    const name=module.evaluation_item||(bonus?'专业成果&团队成长贡献':'行为标准');
    let group=groups.find(g=>g.name===name&&g.bonus===bonus);
    if(!group){group={name,bonus,id:'review-dimension-'+groups.length,items:[]};groups.push(group)}
    group.items.push(module);
  }
  return groups;
}
function unlinkedReviewAttachments(detail) {
  const linked=new Set(detail.modules.flatMap(m=>m.attachment_ids||[]));
  return detail.attachments.filter(a=>!linked.has(a.id));
}
function reviewWeightsReady(detail) {
  if(!applicationStandardSnapshot(detail.submission).matrix)return true;
  const items=detail.modules.filter(m=>m.section_type!=='bonus');
  return !items.length||(items.every(m=>m.weight!=null&&m.weight>0)&&Math.abs(items.reduce((n,m)=>n+Number(m.weight||0),0)-1)<=.001);
}
function reviewDimensionNavigation(detail) {
  return reviewDimensionGroups(detail).map(g=>`<button class="nav-section nav-primary" onclick="scrollToSection('${g.id}')">${esc(g.name)}</button>${g.items.map(m=>`<button class="nav-child" onclick="scrollToSection('m-${m.id}')">${esc(m.module_name||g.name)}</button>`).join('')}`).join('');
}
function reviewDimensionsHtml(detail) {
  const groups=reviewDimensionGroups(detail);
  const render=g=>`<section id="${g.id}" class="review-dimension-section"><h2 class="section-title">${esc(g.name)}</h2><p class="section-help">${g.bonus?'每项最多加 2 分；有举证的子项请逐项给分，不加分请填写 0。':'对照标准要求、工作成果与行为举证及关联附件，逐项评分；每项满分 5 分。'}</p>${g.items.map(moduleCard).join('')}</section>`;
  return `<section id="behavior-section">${groups.filter(g=>!g.bonus).map(render).join('')}</section>${groups.some(g=>g.bonus)?`<section id="bonus-section">${groups.filter(g=>g.bonus).map(render).join('')}</section>`:''}`;
}
function reviewImagePath(attachment) {
  if(attachment.image_path)return attachment.image_path;
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(attachment.uploaded_file_path||'')?attachment.uploaded_file_path:'';
}
function reviewMediaPath(path,mode='') {
  const token=window.currentDetail?.evidenceTask&&window.currentReviewToken;
  const query=[...(token?['review='+encodeURIComponent(token)]:[]),...(mode?[mode+'=1']:[])];
  return '/media/'+path.replaceAll('\\','/').split('/').map(encodeURIComponent).join('/')+(query.length?'?'+query.join('&'):'');
}
function reviewAttachmentPreviewHtml(a){
  const image=reviewImagePath(a);
  if(image)return `<img class="attachment-image" src="${esc(reviewMediaPath(image))}" alt="${esc(a.material_name||'举证附件')}">`;
  if(/\.pdf$/i.test(a.uploaded_file_path||''))return `<iframe class="attachment-pdf-preview" title="${esc(a.material_name||'PDF附件')}预览" src="${esc(reviewMediaPath(a.uploaded_file_path,'preview'))}" referrerpolicy="no-referrer"></iframe><a class="text-button" href="${esc(reviewMediaPath(a.uploaded_file_path,'preview'))}" target="_blank" rel="noopener noreferrer">在新窗口预览 PDF</a>`;
  return `<p class="subtle">${a.link_url?'点击打开链接查阅材料。':a.uploaded_file_path?'此格式请下载后查看。':'此材料未上传文件，请查看材料存放说明。'}</p>`;
}
function reviewAttachmentsHtml(items,label='关联举证附件') {
  if(!items.length)return '';
  return `<div class="review-linked-attachments"><div class="field-label">${esc(label)} · ${items.length} 份</div><div class="review-file-grid">${items.map(a=>{
    const preview=reviewImagePath(a),name=a.material_name||a.storage_path||'举证附件';
    const suffix=(a.uploaded_file_path||name).split('.').pop().toUpperCase();
    return `<article class="review-file"><button type="button" class="review-file-preview" onclick="showAttachment('${a.id}')" aria-label="查看附件 ${esc(name)}">${preview?`<img src="${esc(reviewMediaPath(preview))}" alt="${esc(name)}" loading="lazy" referrerpolicy="no-referrer">`:`<span class="review-file-type">${esc(a.link_url?'链接':suffix.length<=6?suffix:'文件')}</span>`}</button><div class="review-file-info"><strong>${esc(name)}</strong><div class="review-file-actions"><button type="button" class="text-button" onclick="showAttachment('${a.id}')">${preview||/\.pdf$/i.test(a.uploaded_file_path||'')?'预览材料':'查看附件'}</button>${a.uploaded_file_path?`<a class="text-button" href="${esc(reviewMediaPath(a.uploaded_file_path,'download'))}" download>下载文件</a>`:''}${a.link_url?`<a class="text-button" href="${esc(a.link_url)}" target="_blank" rel="noopener noreferrer">打开链接</a>`:''}</div></div></article>`;
  }).join('')}</div></div>`;
}
function reviewUnlinkedAttachmentsHtml(detail) {
  const items=unlinkedReviewAttachments(detail);
  return `<section id="attachments"${items.length?'':' hidden'}>${items.length?`<h2 class="section-title">未关联子项的补充附件</h2><p class="section-help">以下附件尚未关联到具体子项，供综合查阅。已关联的附件已展示在各子项的举证内容下。</p>${reviewAttachmentsHtml(items,'补充附件')}`:''}</section>`;
}
