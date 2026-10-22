(function(){
  'use strict';
  const data=window.MORBOL_SMOOTH_BASE_UV,panel=document.querySelector('#comparison .uv-card');
  if(!data||!panel||!window.MORBOL_SMOOTH_UV_APPLIED)return;
  const shell=!!window.morbolShellUV,removed=window.MORBOL_SMOOTH_REMOVED_BODY_SEAMS||[];
  if(!shell)for(const id of removed)for(const b of panel.querySelectorAll('.body-seam'))if(b.dataset.seam===id)b.remove();
  if(shell)return;
  const hasBodyReplacement=data.parts.some(p=>p.id==='BODY'&&p.versions.includes(1));
  const repl=new Map(data.parts.filter(p=>p.versions.includes(1)&&p.id!=='BODY').map(p=>[p.id,p]));
  const allLong=new Map((window.MORBOL_LONG_ORIGINAL_UV?.parts||[]).map(p=>[p.id,p]));
  for(const [id,p] of repl)if(p.group==='long')allLong.set(id,p);
  const allCurrent=new Map(allLong);for(const [id,p] of repl)allCurrent.set(id,p);
  const seamParts=new Map(allCurrent);for(const p of data.parts)if(p.versions.includes(1))seamParts.set(p.id,p);
  const seamIndex=new Map();
  for(const part of seamParts.values())for(const piece of part.pieces)for(const seam of piece.seams||[]){
    if(!seamIndex.has(seam.id))seamIndex.set(seam.id,[]);seamIndex.get(seam.id).push({part,piece,seam});
  }
  const host=document.createElement('section');host.className='smooth-base-section';
  host.innerHTML='<div class="repair-heading"><h3>현재 파츠 UV</h3><button type="button" class="smooth-reference-toggle">이전 참고 이미지 보기</button></div><p class="smooth-base-note">현재 모델과 같은 파츠를 펼친 UV입니다. 같은 연결 번호를 맞춰 확인하세요. 시접·원단 두께·늘어남은 반영 전입니다.</p><div class="uv-emphasis-controls"><div class="uv-emphasis-row"><span>조각 강조</span><div class="uv-piece-buttons" role="group" aria-label="도안 조각 강조"></div></div><div class="uv-emphasis-row"><span>연결선</span><div class="uv-seam-buttons" role="group" aria-label="도안 연결선 강조"></div></div><p class="uv-emphasis-status" role="status" aria-live="polite"></p></div><div class="smooth-base-pieces"></div>';
  const heading=panel.querySelector('.selection-heading');if(heading)heading.after(host);else panel.append(host);
  let reference=false,signature='',oldPart='',context='',activePiece=null,activeSeam=null;
  const NS='http://www.w3.org/2000/svg';
  function node(name,attrs={}){const el=document.createElementNS(NS,name);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,String(v));return el;}
  const pieceKey=(part,piece)=>[part.id,piece.mesh_id||'',piece.id].join('/');
  function control(text,action,active=false){const b=document.createElement('button');b.type='button';b.textContent=text;b.setAttribute('aria-pressed',String(active));b.classList.toggle('active',active);b.onclick=action;return b;}
  function selectPiece(key){activePiece=activePiece===key?null:key;activeSeam=null;render(true);}
  function selectSeam(id){activeSeam=activeSeam===id?null:id;activePiece=null;render(true);}
  function reset(){activePiece=null;activeSeam=null;render(true);}
  function midpoint(points){let total=0;const lengths=points.slice(1).map((p,i)=>{const l=Math.hypot(p[0]-points[i][0],p[1]-points[i][1]);total+=l;return l;});let remain=total/2;for(let i=0;i<lengths.length;i++){if(remain<=lengths[i]){const t=lengths[i]?remain/lengths[i]:0;return points[i].map((v,k)=>v*(1-t)+points[i+1][k]*t);}remain-=lengths[i];}return points[0];}
  function comparison(entries,s){
    const cols=Math.min(2,entries.length),cellW=500,cellH=690,svg=node('svg',{xmlns:NS,viewBox:`0 0 ${cols*cellW} ${Math.ceil(entries.length/cols)*cellH}`,role:'group','aria-label':'현재 도안 조각과 연결선 대조',class:'uv-comparison-canvas'});
    svg.append(node('rect',{width:cols*cellW,height:Math.ceil(entries.length/cols)*cellH,fill:'white'}));
    const banks=[];
    entries.forEach(({part,piece},i)=>{
      const key=pieceKey(part,piece),related=activeSeam?(piece.seams||[]).some(e=>e.id===activeSeam):activePiece?key===activePiece:true;
      const x=i%cols*cellW+25,y=Math.floor(i/cols)*cellH+48,w=450,h=610;
      const title=node('text',{x:x+w/2,y:y-19,'text-anchor':'middle','font-family':'Malgun Gothic,Arial,sans-serif','font-size':17,'font-weight':700,fill:'#243d32',opacity:related?1:.35});title.textContent=part.id+' · '+piece.id+' '+(piece.name||'');svg.append(title);
      const child=window.morbolRepairUV.drawPiece(piece,s,'compare-'+i,{seam:activeSeam,selected:activePiece===key,onPiece:()=>selectPiece(key),onSeam:selectSeam});
      child.setAttribute('x',x);child.setAttribute('y',y);child.setAttribute('width',w);child.setAttribute('height',h);child.setAttribute('opacity',related?1:.18);child.setAttribute('data-comparison-piece',key);child.setAttribute('data-emphasized',String(related));
      svg.append(child);
      if(activeSeam){
        const [vx,vy,vw,vh]=child.getAttribute('viewBox').split(/\s+/).map(Number),scale=Math.min(w/vw,h/vh),ox=x+(w-vw*scale)/2,oy=y+(h-vh*scale)/2;
        for(const seam of piece.seams||[])if(seam.id===activeSeam&&seam.points.length>1){const p=midpoint(seam.points);banks.push({key,points:seam.points,point:[ox+(p[0]-vx)*scale,oy+(p[1]-vy)*scale]});}
      }
    });
    // Only an unambiguous two-bank seam gets a visual bridge. Segmented seams
    // keep every source bank highlighted without inventing a pairing.
    if(banks.length===2){const[a,b]=banks.map(b=>b.point),bend=Math.min(100,Math.max(35,Math.abs(a[1]-b[1])*.2));svg.append(node('path',{d:`M ${a} C ${a[0]+bend} ${a[1]}, ${b[0]+bend} ${b[1]}, ${b}`,fill:'none',stroke:'#173d48','stroke-width':2.3,'stroke-dasharray':'7 6','pointer-events':'none',class:'uv-paired-connector','data-seam':activeSeam}));}
    return {svg,banks:banks.length};
  }
  function renderEmphasis(parts,baseParts,s){
    const entries=parts.flatMap(part=>part.pieces.map(piece=>({part,piece}))),ph=host.querySelector('.uv-piece-buttons'),sh=host.querySelector('.uv-seam-buttons');ph.replaceChildren();sh.replaceChildren();
    ph.append(control('강조 해제',reset,!activePiece&&!activeSeam));
    for(const {part,piece}of entries){const key=pieceKey(part,piece),b=control(part.id+'-'+piece.id,()=>selectPiece(key),activePiece===key);b.style.setProperty('--piece-color',piece.color);b.dataset.piece=key;ph.append(b);}
    const ids=[...new Set(baseParts.flatMap(p=>p.pieces.flatMap(piece=>(piece.seams||[]).map(e=>e.id))))];
    for(const id of ids){const b=control(id,()=>selectSeam(id),activeSeam===id);b.dataset.seam=id;sh.append(b);}
    sh.parentElement.hidden=!ids.length;
    const container=host.querySelector('.smooth-base-pieces');container.replaceChildren();
    const {svg,banks}=comparison(entries,s);container.append(svg);
    const status=host.querySelector('.uv-emphasis-status');
    if(activeSeam){const names=[...new Set(entries.filter(e=>(e.piece.seams||[]).some(seam=>seam.id===activeSeam)).map(e=>e.part.id+'-'+e.piece.id))];status.textContent=activeSeam+' · '+names.join(' ↔ ')+' 경계를 함께 강조했습니다. ○는 시작점, 화살표는 진행 방향입니다.'+(banks>2?' 나뉜 경계 구간을 모두 표시합니다.':banks===1?' 상대 경계는 현재 버전에 표시되지 않습니다.':'');}
    else status.textContent=activePiece?'선택한 조각을 강조했습니다. 강조 해제를 누르면 전체를 볼 수 있습니다.':'조각이나 연결 번호를 누르세요. 같은 번호의 경계와 해당 조각을 함께 강조합니다.';
    const saves=document.createElement('div');saves.className='uv-piece-downloads';
    const compareSave=control('현재 강조 도안 SVG 저장',()=>download(svg,'도안-강조-'+(activeSeam||s.part)+'-v50'));compareSave.removeAttribute('aria-pressed');saves.append(compareSave);
    for(const {part,piece}of entries){const b=control(part.id+'-'+piece.id+' SVG 저장',()=>download(window.morbolRepairUV.drawPiece(piece,s,'export-'+part.id+'-'+piece.id,{seam:null}),part.id+'-'+piece.id+'-UV-v50'));b.removeAttribute('aria-pressed');saves.append(b);}container.append(saves);
  }
  const pressed=e=>e?.getAttribute('aria-pressed')==='true';
  function state(){return{group:panel.querySelector('.uv-groups [data-group].active')?.dataset.group,
    part:panel.querySelector('.tent-parts [data-id].active')?.dataset.id,
    detail:panel.querySelector('[data-detail].active')?.dataset.detail,
    headAtlas:panel.querySelector('.atlas-page-buttons [data-atlas].active')?.dataset.atlas,
    palette:panel.querySelector('[data-uv-palette].active')?.dataset.uvPalette||'uv',
    labels:pressed(panel.querySelector('.uv-labels-toggle')),wire:pressed(panel.querySelector('.uv-wire-toggle'))};}
  function download(svg,name){
    const copy=svg.cloneNode(true);copy.setAttribute('xmlns','http://www.w3.org/2000/svg');
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=name+'.svg';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function bodyDownload(){
    const original=panel.querySelector('.uv-map svg');if(!original)return;
    const svg=original.cloneNode(true),s=state();
    for(const e of svg.querySelectorAll('.uv-face')){e.setAttribute('stroke',s.wire?'#6b7775':'none');e.style.opacity='1';}
    for(const e of svg.querySelectorAll('.uv-merged-face'))e.style.opacity='1';
    if(!s.labels)for(const e of svg.querySelectorAll('.uv-annotation'))e.remove();
    for(const e of svg.querySelectorAll('.connector,.jaw-map-start,.jaw-map-end,.jaw-body-map,.jaw-counterpart'))e.remove();
    for(const e of svg.querySelectorAll('pattern image'))if(window.MORBOL_TEXTURES?.body)e.setAttribute('href',window.MORBOL_TEXTURES.body);
    download(svg,'몸통-현재-UV-v50');
  }
  function render(force=false){
    const s=state();if(oldPart!==s.part){reference=false;oldPart=s.part;}
    const nextContext=JSON.stringify([s.group,s.part,s.headAtlas,s.detail]);if(context!==nextContext){context=nextContext;activePiece=null;activeSeam=null;}
    const current=repl.get(s.part),groupView=s.detail==='atlas'&&allCurrent.has(s.part),visible=!!current||groupView;
    if(current&&!reference){
      const note=panel.querySelector('.tent-note'),title=panel.querySelector('.part-name');
      if(current.note&&note&&note.textContent!==current.note)note.textContent=current.note;
      const name=current.id+' · '+current.name;
      if(current.name&&s.detail==='part'&&title&&title.textContent!==name)title.textContent=name;
    }
    const key=JSON.stringify([s,reference,activePiece,activeSeam]);if(!force&&key===signature)return;signature=key;
    host.hidden=!visible;panel.classList.toggle('smooth-base-replace',visible&&!reference);
    if(hasBodyReplacement&&s.group==='body'&&s.part==='BODY_UV'){
      const links=[...panel.querySelectorAll('.body-content .downloads a')];
      if(links[0]){links[0].textContent='현재 몸통 UV 저장';links[0].onclick=e=>{e.preventDefault();bodyDownload();};}
      if(links[1]){links[1].textContent='현재 몸통 SVG 저장';links[1].onclick=e=>{e.preventDefault();bodyDownload();};}
      if(links[2])links[2].textContent='기존 색상 이미지 참고';
    }
    if(!visible)return;

    host.querySelector('.smooth-reference-toggle').textContent=reference?'현재 UV로 돌아가기':'이전 참고 이미지 보기';
    host.querySelector('.smooth-base-note').textContent=reference?'수정 전 모습입니다. 현재 제작 대조에는 현재 파츠 UV를 사용하세요.':'현재 모델과 같은 파츠를 펼친 UV입니다. 같은 연결 번호를 맞춰 확인하세요. 시접·원단 두께·늘어남은 반영 전입니다.';
    for(const a of panel.querySelectorAll('.tent-download-png,.tent-download-svg,.tent-download-fill,.tent-download-card'))a.textContent='이전 참고 · '+(a.classList.contains('tent-download-svg')?'SVG':a.classList.contains('tent-download-card')?'대조 이미지':'UV 이미지');
    const container=host.querySelector('.smooth-base-pieces');container.replaceChildren();
    host.querySelector('.uv-emphasis-controls').hidden=reference;
    if(reference)return;
    const selectedReference=window.MORBOL_UV_REFERENCES?.[s.part];
    const baseParts=groupView?[...allCurrent.values()].filter(p=>p.group===s.group&&(s.group!=='head'||window.MORBOL_UV_REFERENCES?.[p.id]?.atlas===(s.headAtlas||selectedReference?.atlas))):[current];
    const parts=[...baseParts];
    if(activeSeam)for(const {part}of seamIndex.get(activeSeam)||[])if(!parts.some(p=>p.id===part.id))parts.push(part);
    if(activePiece){const part=[...seamParts.values()].find(p=>p.pieces.some(piece=>pieceKey(p,piece)===activePiece));if(part&&!parts.some(p=>p.id===part.id))parts.push(part);}
    renderEmphasis(parts,baseParts,s);
  }
  host.querySelector('.smooth-reference-toggle').onclick=()=>{reference=!reference;render(true);};
  let queued=false;
  new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;render();});}).observe(panel,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-pressed','class']});
  window.morbolSmoothUV={render:()=>render(true),getState:()=>({...state(),reference,activePiece,activeSeam})};render();
})();
/* MORBOL_V45_ABSORPTION_RUNTIME_SUPPORT */
/* MORBOL_V46_CURRENT_UV_RUNTIME_SUPPORT */
/* MORBOL_V47_JUNCTION_RUNTIME_SUPPORT */
/* MORBOL_V48_JUNCTION_RUNTIME_SUPPORT */
/* MORBOL_V50_FINISH_RUNTIME_SUPPORT */
