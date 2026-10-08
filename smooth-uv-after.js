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
  for(const [id,p] of repl)if(allLong.has(id))allLong.set(id,p);
  const host=document.createElement('section');host.className='smooth-base-section';
  host.innerHTML='<div class="repair-heading"><h3>수정된 외피 UV</h3><button type="button" class="smooth-reference-toggle">이전 참고 이미지 보기</button></div><p class="smooth-base-note">현재 모델과 같은 UV입니다. 뿌리 두 장의 치수·시접 도안은 재단 도안 화면에서 확인하세요.</p><div class="smooth-base-pieces"></div>';
  const heading=panel.querySelector('.selection-heading');if(heading)heading.after(host);else panel.append(host);
  let reference=false,signature='',oldPart='';
  const pressed=e=>e?.getAttribute('aria-pressed')==='true';
  function state(){return{group:panel.querySelector('.uv-groups [data-group].active')?.dataset.group,
    part:panel.querySelector('.tent-parts [data-id].active')?.dataset.id,
    detail:panel.querySelector('[data-detail].active')?.dataset.detail,
    palette:panel.querySelector('[data-uv-palette].active')?.dataset.uvPalette||'uv',
    labels:pressed(panel.querySelector('.uv-labels-toggle')),wire:pressed(panel.querySelector('.uv-wire-toggle'))};}
  function download(svg,name){
    const copy=svg.cloneNode(true);copy.setAttribute('xmlns','http://www.w3.org/2000/svg');
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=name+'.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function bodyDownload(){
    const original=panel.querySelector('.uv-map svg');if(!original)return;
    const svg=original.cloneNode(true),s=state();
    for(const e of svg.querySelectorAll('.uv-face')){e.setAttribute('stroke',s.wire?'#6b7775':'none');e.style.opacity='1';}
    for(const e of svg.querySelectorAll('.uv-merged-face'))e.style.opacity='1';
    if(!s.labels)for(const e of svg.querySelectorAll('.uv-annotation'))e.remove();
    for(const e of svg.querySelectorAll('.connector,.jaw-map-start,.jaw-map-end,.jaw-body-map,.jaw-counterpart'))e.remove();
    for(const e of svg.querySelectorAll('pattern image'))if(window.MORBOL_TEXTURES?.body)e.setAttribute('href',window.MORBOL_TEXTURES.body);
    download(svg,'몸통-현재-UV-v31');
  }
  function render(force=false){
    const s=state();if(oldPart!==s.part){reference=false;oldPart=s.part;}
    const current=repl.get(s.part),groupView=s.group==='long'&&s.detail==='atlas'&&allLong.has(s.part),visible=!!current||groupView;
    const key=JSON.stringify([s,reference]);if(!force&&key===signature)return;signature=key;
    host.hidden=!visible;panel.classList.toggle('smooth-base-replace',visible&&!reference);
    if(hasBodyReplacement&&s.group==='body'&&s.part==='BODY_UV'){
      const links=[...panel.querySelectorAll('.body-content .downloads a')];
      if(links[0]){links[0].textContent='현재 몸통 UV 저장';links[0].onclick=e=>{e.preventDefault();bodyDownload();};}
      if(links[1]){links[1].textContent='현재 몸통 SVG 저장';links[1].onclick=e=>{e.preventDefault();bodyDownload();};}
      if(links[2])links[2].textContent='기존 색상 이미지 참고';
    }
    if(!visible)return;
    host.querySelector('.smooth-reference-toggle').textContent=reference?'현재 UV로 돌아가기':'이전 참고 이미지 보기';
    host.querySelector('.smooth-base-note').textContent=reference?'수정 전 모습입니다. 현재 제작 대조에는 수정된 외피 UV를 사용하세요.':'현재 모델과 같은 UV입니다. 뿌리 두 장의 치수·시접 도안은 재단 도안 화면에서 확인하세요.';
    for(const a of panel.querySelectorAll('.tent-download-png,.tent-download-svg,.tent-download-fill,.tent-download-card'))a.textContent='이전 참고 · '+(a.classList.contains('tent-download-svg')?'SVG':a.classList.contains('tent-download-card')?'대조 이미지':'UV 이미지');
    const container=host.querySelector('.smooth-base-pieces');container.replaceChildren();
    if(reference)return;
    const parts=groupView?[...allLong.values()]:[current];
    for(const part of parts)for(const piece of part.pieces){
      const card=document.createElement('div');card.className='repair-piece-card';
      const top=document.createElement('div');top.className='repair-piece-heading';
      const title=document.createElement('h4');title.textContent=part.id+' · '+piece.id+' '+piece.name;top.append(title);
      const svg=window.morbolRepairUV.drawPiece(piece,s,'smooth-base-'+part.id+'-'+piece.id);
      const save=document.createElement('button');save.type='button';save.textContent='현재 조각 SVG 저장';save.onclick=()=>download(svg,part.id+'-'+piece.id+'-UV-v31');top.append(save);card.append(top,svg);container.append(card);
    }
  }
  host.querySelector('.smooth-reference-toggle').onclick=()=>{reference=!reference;render(true);};
  host.addEventListener('click',e=>{if(e.target.closest('svg'))queueMicrotask(()=>render(true));});
  let queued=false;
  new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;render();});}).observe(panel,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-pressed','class']});
  window.morbolSmoothUV={render:()=>render(true),getState:()=>({...state(),reference})};render();
})();
