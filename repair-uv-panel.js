(function () {
  'use strict';
  const DATA=window.MORBOL_REPAIR_UV,panel=document.querySelector('#comparison .uv-card');
  if(!DATA||!panel)return;
  const NS='http://www.w3.org/2000/svg';
  const host=document.createElement('section');host.className='repair-uv-section';host.setAttribute('aria-label','추가 외피 연결 조각 UV');
  host.innerHTML='<div class="repair-heading"><h3>연결 외피와 뿌리 패널</h3><span>현재 선택 파츠에 포함</span></div><p class="repair-description">겉면 사이의 빈틈을 이어 주는 외피입니다. 기존 외피와 함께 대조하세요.</p><div class="repair-uv-pieces"></div><p class="repair-uv-footnote">메시의 삼각형 선은 재단선이 아닙니다. ROOT 두 장은 재단 도안 화면에서 치수와 시접을 설정하세요.</p>';
  panel.append(host);
  let signature='',last=null,activeSeam=null;
  const $=s=>panel.querySelector(s);
  const pressed=e=>e?.getAttribute('aria-pressed')==='true'||e?.classList.contains('active');
  function currentState(){
    if(window.morbolShellUV){const s=window.morbolShellUV.getState();return{version:2,group:s.group,part:s.part,headAtlas:s.headAtlas,detail:s.detail,palette:s.palette,labels:s.labels,wire:s.wire};}
    return{version:1,group:$('.uv-groups [data-group].active')?.dataset.group||'body',part:$('.tent-parts [data-id].active')?.dataset.id||'BODY_UV',headAtlas:$('.atlas-page-buttons [data-atlas].active')?.dataset.atlas,detail:$('[data-detail].active')?.dataset.detail||'part',palette:$('.uv-appearance [data-uv-palette].active')?.dataset.uvPalette||'uv',labels:pressed($('.uv-labels-toggle')),wire:pressed($('.uv-wire-toggle'))};
  }
  function relevant(s){return DATA.pieces.filter(p=>{
    if(p.versions&&!p.versions.includes(s.version))return false;
    if(p.group!==s.group)return false;
    if(s.detail==='atlas')return s.group!=='head'||!s.headAtlas||p.atlas===s.headAtlas;
    if(s.part==='BODY_UV')return ['BODY','JAW'].includes(p.selection_id);
    return p.selection_id===s.part;
  });}
  function svgNode(name,attrs={}){const n=document.createElementNS(NS,name);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;}
  function label(svg,text,pos,font,color){
    const group=svgNode('g',{'class':'repair-svg-label','pointer-events':'none'}),w=Math.max(2.5,text.length*.63)*font+font*.6;
    group.append(svgNode('rect',{x:pos[0]-w/2,y:pos[1]-font*.72,width:w,height:font*1.44,rx:font*.2,fill:'white',stroke:color,'stroke-width':font*.07}));
    const t=svgNode('text',{x:pos[0],y:pos[1],fill:'#263b30','font-family':'Malgun Gothic,Arial,sans-serif','font-size':font,'font-weight':700,'text-anchor':'middle','dominant-baseline':'central'});t.textContent=text;group.append(t);svg.append(group);
  }
  function mid(points){if(!points.length)return[0,0];let total=0;const lens=points.slice(1).map((p,i)=>{const n=Math.hypot(p[0]-points[i][0],p[1]-points[i][1]);total+=n;return n;});let remain=total/2;for(let i=0;i<lens.length;i++){if(remain<=lens[i]){const t=lens[i]?remain/lens[i]:0;return points[i].map((v,j)=>v*(1-t)+points[i+1][j]*t);}remain-=lens[i];}return points[0];}
  function svgFor(piece,s,index){
    const b=piece.bounds,span=Math.max(b[2]-b[0],b[3]-b[1],1),pad=span*.075,x=b[0]-pad,y=b[1]-pad,w=b[2]-b[0]+pad*2,h=b[3]-b[1]+pad*2;
    const svg=svgNode('svg',{xmlns:NS,viewBox:`${x} ${y} ${w} ${h}`,role:'img','aria-label':piece.id+' '+piece.name+' UV','data-part':piece.selection_id,'data-piece':piece.id,'data-face-count':piece.face_count,'data-triangle-count':piece.triangle_count,'data-source':piece.mesh_id});
    svg.append(svgNode('rect',{x,y,width:w,height:h,fill:'#fff'}));
    const texture=window.MORBOL_TEXTURES?.[piece.atlas]||DATA.textures?.[piece.atlas],atlasSize=piece.atlas_size||DATA.atlas_size;
    if(s.palette==='actual'&&texture){
      const defs=svgNode('defs'),pat=svgNode('pattern',{id:'repair-actual-'+index,patternUnits:'userSpaceOnUse',patternContentUnits:'userSpaceOnUse',width:atlasSize,height:atlasSize});pat.append(svgNode('image',{href:texture,width:atlasSize,height:atlasSize,preserveAspectRatio:'none'}));defs.append(pat);svg.append(defs);
      svg.append(svgNode('path',{d:piece.path,fill:`url(#repair-actual-${index})`,'class':'repair-svg-surface'}));
    }else if(s.palette==='actual'&&piece.actual_paths?.length){
      for(const a of piece.actual_paths)svg.append(svgNode('path',{d:a.path,fill:a.color,'class':'repair-svg-surface'}));
    }else svg.append(svgNode('path',{d:piece.path,fill:s.palette==='actual'?(piece.actual_color||piece.color):piece.color,'class':'repair-svg-surface'}));
    if(s.wire)svg.append(svgNode('path',{d:piece.wire,fill:'none',stroke:'#2e473b','stroke-opacity':.48,'stroke-width':span*.001,'class':'repair-svg-wire'}));
    svg.append(svgNode('path',{d:piece.outline,fill:'none',stroke:'#365440','stroke-width':span*.0019,'stroke-linejoin':'round'}));
    const seamLabels=new Set();
    for(const seam of piece.seams||[]){
      const active=activeSeam===seam.id,points=seam.points;if(points.length<2)continue;
      const line=svgNode('polyline',{points:points.map(p=>p.join(',')).join(' '),fill:'none',stroke:active?'#173d48':seam.color||'#52747b','stroke-width':span*(active?.006:.0025),'stroke-dasharray':active?'none':`${span*.01} ${span*.006}`,'stroke-linejoin':'round','class':'repair-svg-seam'});
      line.addEventListener('click',()=>{activeSeam=active?null:seam.id;render(true);});svg.append(line);
      if(s.labels&&!seamLabels.has(seam.id)){seamLabels.add(seam.id);const pos=mid(points);label(svg,seam.id,[pos[0],pos[1]-span*.025],span*.022,seam.color||'#52747b');}
    }
    if(s.labels)label(svg,piece.id,piece.label_point,span*.027,piece.color);
    return svg;
  }
  function download(svg,piece,s){const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=piece.id+'-외피연결-UV-'+s.palette+'-v31.svg';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function render(force=false){
    const s=currentState(),pieces=relevant(s),key=JSON.stringify(s);last={...s,pieces:pieces.map(p=>p.id),activeSeam};
    if(!force&&key===signature)return;signature=key;host.hidden=!pieces.length;
    const container=host.querySelector('.repair-uv-pieces');container.replaceChildren();
    let microContainer=null;
    if(pieces.some(p=>p.uv_correction_only)){
      const details=document.createElement('details');details.className='repair-micro-details';
      const summary=document.createElement('summary');summary.textContent='극소 UV 보정면 보기 · 별도 재단 조각 아님';details.append(summary);
      microContainer=document.createElement('div');microContainer.className='repair-uv-pieces';details.append(microContainer);container.append(details);
    }
    pieces.forEach((piece,i)=>{
      const card=document.createElement('div');card.className='repair-piece-card';card.dataset.parent=piece.selection_id;card.dataset.repairId=piece.id;
      const top=document.createElement('div');top.className='repair-piece-heading';const title=document.createElement('h4');title.textContent=piece.id+' · '+piece.name;top.append(title);
      const svg=svgFor(piece,s,i),save=document.createElement('button');save.type='button';save.textContent='이 조각 SVG 저장';save.onclick=()=>download(svg,piece,s);top.append(save);card.append(top);
      if(piece.seams?.length){const seams=document.createElement('div');seams.className='repair-seam-buttons';seams.setAttribute('role','group');seams.setAttribute('aria-label',piece.id+' 연결 경계');
        for(const seam of new Map(piece.seams.map(s=>[s.id,s])).values()){const b=document.createElement('button');b.type='button';b.textContent=seam.id+(seam.target_label?' · '+seam.target_label:'');b.dataset.repairSeam=seam.id;b.setAttribute('aria-pressed',String(activeSeam===seam.id));b.onclick=()=>{activeSeam=activeSeam===seam.id?null:seam.id;render(true);};seams.append(b);}card.append(seams);
      }
      card.append(svg);if(piece.note){const note=document.createElement('p');note.className='repair-piece-note';note.textContent=piece.note;card.append(note);}
      if(piece.uv_correction_only)microContainer.append(card);else container.insertBefore(card,container.querySelector('.repair-micro-details'));
    });
  }
  // Existing controllers retain ownership of all controls. Observe their state,
  // rather than replacing handlers or changing the model's display selection.
  let queued=false;
  new MutationObserver(()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;render();});}).observe(panel,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-pressed','class']});
  panel.addEventListener('click',()=>queueMicrotask(()=>render()));
  window.morbolRepairUV={getState:()=>({...last}),render:()=>render(true),drawPiece:(piece,state,index)=>svgFor(piece,state,index)};
  render();
})();
