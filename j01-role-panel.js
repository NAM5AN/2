(function(){
  'use strict';
  const data=window.MORBOL_J01_ROLE_UV,panel=document.querySelector('#comparison .uv-card');
  if(!data||!panel||!window.morbolRepairUV)return;
  const shell=!!window.morbolShellUV;
  const host=document.createElement('section');host.className='j01-role-section';
  host.innerHTML='<h3>J01 외피와 조립 참고면</h3><p>F·B는 앞뒤 외피입니다. D는 마감·접촉 위치를 대조하는 참고면으로, 그대로 잘라 쓸 재단 조각이 아닙니다. 외피 경계를 잇는 면은 모델에 유지되어 있습니다.</p>'+(shell?'':
    '<div class="j01-role-tabs" role="group" aria-label="J01 UV 구역 보기"><button type="button" data-role="all">전체</button><button type="button" data-role="skin">F·B 외피</button><details class="j01-contact-reference"><summary>D 조립·접촉 참고</summary><button type="button" data-role="contact">D 참고면 보기</button><p>모델의 접촉 위치를 확인하는 자료입니다. 재단 부품 수로 세지 마세요.</p></details><button type="button" data-role="reference">기존 대조 이미지</button></div><div class="j01-role-pieces"></div><p class="j01-scale-note">구역마다 보기 편하게 확대했습니다. 원래 UV 좌표는 유지됩니다. 실제 치수와 시접은 반영 전입니다.</p>');
  const heading=panel.querySelector('.selection-heading');
  if(heading)heading.after(host);else panel.append(host);
  let choice='skin',signature='';
  function state(){
    if(shell){const s=window.morbolShellUV.getState();return {...s,part:s.part,detail:s.detail||s.mode};}
    return{part:panel.querySelector('.tent-parts [data-id].active')?.dataset.id,
      group:panel.querySelector('.uv-groups [data-group].active')?.dataset.group,
      detail:panel.querySelector('[data-detail].active')?.dataset.detail,
      palette:panel.querySelector('[data-uv-palette].active')?.dataset.uvPalette||'uv',
      labels:panel.querySelector('.uv-labels-toggle')?.getAttribute('aria-pressed')==='true',
      wire:panel.querySelector('.uv-wire-toggle')?.getAttribute('aria-pressed')==='true'};
  }
  function save(svg,piece){
    const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='J01-'+piece.id+'-UV-v31.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function render(force=false){
    const s=state(),visible=s.part==='J01'&&s.group==='long'&&s.detail==='part',key=JSON.stringify([s,choice]);
    if(!force&&key===signature)return;signature=key;host.hidden=!visible;
    panel.classList.toggle('j01-role-replace',visible&&!shell&&choice!=='reference');
    if(!visible||shell)return;
    const container=host.querySelector('.j01-role-pieces');container.replaceChildren();
    host.querySelector('.j01-scale-note').hidden=choice==='reference';
    host.querySelectorAll('[data-role]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.role===choice)));
    if(choice==='reference')return;
    const pieces=data.pieces.filter(p=>choice==='all'||(choice==='skin'?p.id!=='D':p.id==='D'));
    for(const piece of pieces){
      const card=document.createElement('div');card.className='repair-piece-card';
      const title=document.createElement('div');title.className='repair-piece-heading';
      const h=document.createElement('h4');h.textContent=piece.id+' · '+piece.name;title.append(h);
      const svg=window.morbolRepairUV.drawPiece({...piece,atlas_size:data.atlas_size},s,'j01-role-'+piece.id),download=document.createElement('button');
      download.type='button';download.textContent='이 구역 SVG 저장';download.onclick=()=>save(svg,piece);title.append(download);
      card.append(title,svg);container.append(card);
    }
  }
  host.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>{choice=b.dataset.role;render(true);});
  host.addEventListener('click',e=>{if(e.target.closest('svg'))queueMicrotask(()=>render(true));});
  let queued=false;
  new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;render();});}).observe(panel,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-pressed','class']});
  window.morbolJ01RoleUV={getState:()=>({choice,...state()}),render:()=>render(true)};
  render();
})();
