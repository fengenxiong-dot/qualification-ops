/* Pure matrix and clipboard helpers, shared by UI and Node regression tests. */
const MatrixCore = (() => {
  const NO_ADD='〔无新增要求〕';
  const grades=['一级','二级','三级','四级','五级','六级','七级'];
  const gradeNumbers=['1级','2级','3级','4级','5级','6级','7级'];
  const tiers=['初做者','专业级','骨干级','专家级','教授级'];
  const ranges=['1—2级','3—4级','5—6级','7—9级','10—12级'];
  const clone=x=>JSON.parse(JSON.stringify(x));
  const uid=()=>globalThis.crypto?.randomUUID?.() || 'm'+Date.now().toString(36)+Math.random().toString(36).slice(2);
  const columnStyle=dim=>dim.basis==='grade'&&dim.columnStyle==='number'?'number':'name';
  const columns=dim=>dim.basis==='grade'?(columnStyle(dim)==='number'?gradeNumbers:grades):tiers.slice(0,4);
  const tierIndex=g=>g<=2?0:g<=4?1:g<=6?2:3;
  function inherited(row, column){return Array.from({length:column+1},(_,i)=>row.cells[String(i+1)]||'').filter(s=>s&&s!==NO_ADD).join('\n')}
  function parseText(text){
    if(typeof text!=='string'||text.length>500000)throw Error('单次粘贴请控制在 50 万字符以内');
    text=text.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').replace(/\n+$/,'');
    if(!text.trim())throw Error('请先粘贴表格内容');
    text=text.replace(/^```[^\n]*\n/,'').replace(/\n```\s*$/,'');
    let rows;
    if(text.trimStart().startsWith('|')){
      rows=text.trim().split('\n').map(line=>{
        line=line.trim().replace(/^\|/,'').replace(/(?<!\\)\|$/,'');
        return line.split(/(?<!\\)\|/).map(cell=>cell.trim().replace(/\\\|/g,'|').replace(/<br\s*\/?\s*>/gi,'\n'));
      }).filter(row=>!row.every(cell=>/^:?-{3,}:?$/.test(cell)));
    }else{
      rows=[];let row=[],cell='',quoted=false;
      for(let i=0;i<text.length;i++){
        const c=text[i];
        if(c==='"'&&(quoted||cell==='')){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted;}
        else if(!quoted&&(c==='\t'||c==='\n')){row.push(cell);cell='';if(c==='\n'){rows.push(row);row=[]}}
        else cell+=c;
      }
      if(quoted)throw Error('表格引号未闭合，请重新复制完整区域');
      row.push(cell);rows.push(row);
    }
    // Keep trailing tab cells: an empty column must never shift its neighbours.
    if(rows.some(row=>row.some(cell=>cell.length>30000)))throw Error('单元格内容不能超过 3 万字');
    if(rows.length>102||rows.some(row=>row.length>14))throw Error('粘贴区域过大，请按维度分批粘贴');
    if(rows.some(row=>row.length!==rows[0].length))throw Error('各行列数不一致，请检查表格或单元格内换行');
    return rows;
  }
  function headerIndex(label,basis){
    label=String(label).trim().replace(/\*\*/g,'');
    if(basis==='tier')return tiers.slice(0,4).findIndex(x=>label===x||label.startsWith(x+'（')||label.startsWith(x+' '));
    let index=grades.indexOf(label);if(index>=0)return index;
    const match=label.match(/^(?:T|P|职级)?([1-7])(?:级)?$/i);return match?Number(match[1])-1:-1;
  }
  function pastePlan(dim,rows,{header=false,rowNames=false,startRow=0,startColumn=0}={}){
    rows=clone(rows);const width=columns(dim).length,offset=rowNames?1:0;
    const mapping=header?rows.shift().slice(offset).map(label=>headerIndex(label,dim.basis)):rows[0].slice(offset).map((_,i)=>startColumn+i);
    if(!mapping.length||mapping.some(i=>i<0||i>=width)||new Set(mapping).size!==mapping.length)throw Error('等级表头不匹配、重复或超出开发范围，请检查编写口径');
    if(!rows.length)throw Error('表格中没有标准描述行');
    const result=clone(dim),changes=[],seen=new Set();
    for(let r=0;r<rows.length;r++){
      let index;
      if(rowNames){
        const name=rows[r][0].trim();if(!name||name.length>200||seen.has(name))throw Error('子维度名称不能为空、重复或超过 200 字');seen.add(name);
        index=result.rows.findIndex(row=>row.name===name);
        if(index<0){index=result.rows.length;result.rows.push({id:uid(),name,cells:{}})}
      }else{
        index=startRow+r;if(index>=result.rows.length)throw Error('行数超出已有子维度；请勾选“首列为子维度名称”以批量新增');
      }
      for(let c=0;c<mapping.length;c++){
        const value=rows[r][c+offset].trim();if(!value)continue;
        const key=String(mapping[c]+1),previous=result.rows[index].cells[key]||'';
        changes.push({row:result.rows[index].name,column:columns(dim)[mapping[c]],previous,value});
        result.rows[index].cells[key]=value;
      }
    }
    if(result.rows.length>100)throw Error('每个维度最多支持 100 个子维度');
    if(!changes.length)throw Error('没有可填入的非空内容');
    return {dimension:result,changes,newRows:result.rows.length-dim.rows.length,overwrites:changes.filter(c=>c.previous&&c.previous!==c.value).length};
  }
  return {NO_ADD,grades,gradeNumbers,tiers,ranges,clone,uid,columnStyle,columns,tierIndex,inherited,parseText,headerIndex,pastePlan};
})();
if(typeof module!=='undefined')module.exports=MatrixCore;
