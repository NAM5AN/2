(function () {
  'use strict';
  const DATA = window.MORBOL_SHELL_UV;
  const comparison = document.getElementById('comparison');
  if (!DATA || !comparison) return;
  const NS = 'http://www.w3.org/2000/svg';
  const GROUPS = {body:'몸통',lips:'입술·잇몸',long:'큰 촉수',medium:'중간 턱 촉수',small:'짧은 턱 촉수',head:'머리 위 가시'};
  const ATLAS_NAMES = {'body':'몸통·아래턱','lips':'입술·잇몸','long':'큰 촉수','long-joined':'공통 하부·다리 촉수','lower-connection':'촉수로 이어지는 상단 외피'};
  const parts = new Map(DATA.parts.map(p => [p.id,p]));
  const bundles = new Map(DATA.bundles.map(b => [b.id,b]));
  const headAtlases = [...new Set(DATA.parts.filter(p => p.group === 'head').map(p => p.atlas))];
  const state = {group:'body',part:'BODY',headAtlas:headAtlases[0],mode:'part',palette:'uv',labels:true,wire:true,piece:null,seam:null};
  const panel = document.createElement('section');
  panel.className = 'card uv-card shell-uv-card';
  panel.innerHTML = `
    <div class="uv-heading"><h2>외피 UV와 연결 위치</h2>
      <div class="uv-appearance">
        <div class="uv-palette-tabs" role="group" aria-label="오른쪽 UV 색상">
          <button type="button" data-palette="uv">UV 구분색</button><button type="button" data-palette="actual">실제 모델 색상</button>
        </div>
        <button type="button" class="uv-labels-toggle" aria-label="오른쪽 UV 번호표 표시"></button>
        <button type="button" class="uv-wire-toggle" aria-label="오른쪽 UV 메시 선 표시"></button>
        <span class="uv-appearance-note">오른쪽만 변경</span>
      </div>
      <p class="helper">남겨 둔 외피 면만 표시합니다. UV 선택은 왼쪽 모델의 표시와 시점을 바꾸지 않습니다.</p>
      <div class="uv-groups" role="group" aria-label="UV 파츠 분류"></div>
    </div>
    <div class="head-atlas-pages" hidden><span>머리 위 가시 UV 5그룹</span><div class="atlas-page-buttons" role="group" aria-label="머리 위 가시 UV 그룹"></div></div>
    <div class="tent-parts" role="group" aria-label="외피 파츠 선택"></div>
    <div class="selection-heading"><h3 class="part-name"></h3><div class="detail-toggle" role="group" aria-label="UV 표시 방식">
      <button type="button" data-mode="part">선택 파츠 UV</button><button type="button" data-mode="atlas">그룹 UV 전체</button>
    </div></div>
    <div class="shell-detail-controls">
      <div class="shell-control-row"><span>세부 구역</span><div class="shell-piece-buttons" role="group" aria-label="UV 세부 구역 강조"></div></div>
      <div class="shell-control-row shell-seam-row"><span>연결선</span><div class="shell-seam-buttons" role="group" aria-label="외피 연결선 강조"></div></div>
    </div>
    <p class="shell-uv-status" role="status" aria-live="polite"></p>
    <div class="shell-uv-sheets"></div>
    <p class="shell-uv-note">메시 선은 재봉선이 아닙니다. 같은 연결 번호끼리 맞춥니다. 외피 모양 대조용 UV이며 실제 치수, 시접과 원단 늘어남은 반영 전입니다.</p>`;
  comparison.append(panel);
  const $ = s => panel.querySelector(s);
  const $$ = s => [...panel.querySelectorAll(s)];
  const esc = s => String(s).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function button(label, fn, active=false, title='') {
    const b=document.createElement('button');b.type='button';b.textContent=label;b.title=title;b.onclick=fn;pressed(b,active);return b;
  }
  function pressed(el,value) {el.classList.toggle('active',value);el.setAttribute('aria-pressed',String(value));}
  function svgNode(name, attrs={}) {const n=document.createElementNS(NS,name);for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));return n;}
  function groupParts() {return DATA.parts.filter(p => p.group===state.group && (state.group!=='head'||p.atlas===state.headAtlas));}
  function visibleBundles() {
    const selected=state.mode==='part'?[parts.get(state.part)]:groupParts();
    return selected.flatMap(p => p.bundles.map(id=>bundles.get(id)));
  }
  function pieceKey(bundle,piece) {return bundle.id+'/'+piece.id;}
  function resetEmphasis() {state.piece=null;state.seam=null;}
  function chooseGroup(group) {
    state.group=group;state.part=groupParts()[0].id;resetEmphasis();render();
  }
  for(const [id,name] of Object.entries(GROUPS)) {
    if(DATA.parts.some(p=>p.group===id)) {const b=button(name,()=>chooseGroup(id));b.dataset.group=id;$('.uv-groups').append(b);}
  }
  for(const [i,atlas] of headAtlases.entries()) {
    const ids=DATA.parts.filter(p=>p.atlas===atlas).map(p=>p.id);
    const b=button(`${i+1}그룹 · ${ids[0]}–${ids.at(-1)}`,()=>{state.headAtlas=atlas;state.part=groupParts()[0].id;resetEmphasis();render();});
    b.dataset.atlas=atlas;$('.atlas-page-buttons').append(b);
  }
  $$('[data-palette]').forEach(b=>b.onclick=()=>{state.palette=b.dataset.palette;renderSheets();renderAppearance();});
  $('.uv-labels-toggle').onclick=()=>{state.labels=!state.labels;renderSheets();renderAppearance();};
  $('.uv-wire-toggle').onclick=()=>{state.wire=!state.wire;renderSheets();renderAppearance();};
  $$('[data-mode]').forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;resetEmphasis();render();});
  function renderAppearance() {
    $$('[data-palette]').forEach(b=>pressed(b,b.dataset.palette===state.palette));
    const a=$('.uv-labels-toggle'),w=$('.uv-wire-toggle');
    a.textContent=(state.labels?'✓ 번호표 켜짐':'번호표 꺼짐');pressed(a,state.labels);
    w.textContent=(state.wire?'✓ 메시 선 켜짐':'메시 선 꺼짐');pressed(w,state.wire);
  }
  function selectPiece(id) {state.piece=state.piece===id?null:id;state.seam=null;renderControls();renderSheets();}
  function selectSeam(id) {state.seam=state.seam===id?null:id;state.piece=null;renderControls();renderSheets();}
  function renderControls() {
    const vb=visibleBundles(),ph=$('.shell-piece-buttons'),sh=$('.shell-seam-buttons');ph.replaceChildren();sh.replaceChildren();
    ph.append(button('전체',()=>{resetEmphasis();renderControls();renderSheets();},!state.piece&&!state.seam));
    for(const b of vb)for(const p of b.pieces) {
      const key=pieceKey(b,p),el=button(p.label,()=>selectPiece(key),state.piece===key,p.name);
      el.style.setProperty('--piece-color',p.color);el.dataset.piece=key;ph.append(el);
    }
    const seams=[...new Set(vb.flatMap(b=>b.seams.map(s=>s.id)))];
    $('.shell-seam-row').hidden=!seams.length;
    for(const id of seams)sh.append(button(id,()=>selectSeam(id),state.seam===id));
    const patch=vb.some(b=>b.patch);
    $('.shell-uv-status').textContent=state.seam?`${state.seam} · 같은 번호의 경계를 강조했습니다. 두 경계의 시작점 ○와 진행 화살표를 확인하세요.`:state.piece?`${vb.flatMap(b=>b.pieces.map(p=>({b,p}))).find(({b,p})=>pieceKey(b,p)===state.piece)?.p.label||''} 구역을 강조했습니다. 전체를 누르면 강조를 해제합니다.`:patch?'같은 파츠의 상단 외피 조각도 함께 표시합니다. P 번호는 기존 외피 중 해당 촉수로 이어지는 조각입니다.':'구역이나 연결 번호를 누르면 위치를 강조합니다. 삭제된 내부 마감면과 그 면에 연결되던 번호는 표시하지 않습니다.';
  }
  function render() {
    $$('[data-group]').forEach(b=>pressed(b,b.dataset.group===state.group));
    $$('[data-atlas]').forEach(b=>pressed(b,b.dataset.atlas===state.headAtlas));
    $('.head-atlas-pages').hidden=state.group!=='head';
    const nav=$('.tent-parts');nav.replaceChildren();
    for(const p of groupParts()) {
      const label=p.id==='BODY'?'몸통 · U01–U09':p.id==='JAW'?'아래턱 · U10–U11':p.id;
      const b=button(label,()=>{state.part=p.id;state.mode='part';resetEmphasis();render();},p.id===state.part,p.name);
      b.dataset.part=p.id;b.dataset.id=p.id;b.style.setProperty('--part-color',p.color);nav.append(b);
    }
    $('.part-name').textContent=state.mode==='part'?`${state.part} · ${parts.get(state.part).name}`:`${GROUPS[state.group]} · 외피 UV 전체`;
    $$('[data-mode]').forEach(b=>pressed(b,b.dataset.mode===state.mode));
    renderAppearance();renderControls();renderSheets();
  }
  function midPoint(points) {
    let total=0;const lens=points.slice(1).map((p,i)=>{const d=Math.hypot(p[0]-points[i][0],p[1]-points[i][1]);total+=d;return d;});
    let remain=total/2;
    for(let i=0;i<lens.length;i++){if(remain<=lens[i]){const t=lens[i]?remain/lens[i]:0;return [points[i][0]*(1-t)+points[i+1][0]*t,points[i][1]*(1-t)+points[i+1][1]*t];}remain-=lens[i];}
    return points[0];
  }
  function addLabel(svg, text, pos, font, color, extra='') {
    const g=svgNode('g',{'class':'shell-svg-label '+extra,'pointer-events':'none'}),width=Math.max(font*2.1,text.length*font*.59)+font*.6;
    g.append(svgNode('rect',{x:pos[0]-width/2,y:pos[1]-font*.69,width,height:font*1.38,rx:font*.18,fill:'white',stroke:color,'stroke-width':font*.07}));
    const t=svgNode('text',{x:pos[0],y:pos[1],fill:'#24333e','font-family':'Malgun Gothic,Arial,sans-serif','font-size':font,'font-weight':700,'text-anchor':'middle','dominant-baseline':'central'});t.textContent=text;g.append(t);svg.append(g);
  }
  function createSVG(atlas, sheetBundles, ordinal) {
    const bounds=sheetBundles.map(b=>b.bounds),minX=Math.min(...bounds.map(b=>b[0])),minY=Math.min(...bounds.map(b=>b[1])),maxX=Math.max(...bounds.map(b=>b[2])),maxY=Math.max(...bounds.map(b=>b[3]));
    const span=Math.max(maxX-minX,maxY-minY,1),margin=span*.065,x=minX-margin,y=minY-margin,width=maxX-minX+margin*2,height=maxY-minY+margin*2;
    const svg=svgNode('svg',{xmlns:NS,viewBox:`${x} ${y} ${width} ${height}`,role:'img','aria-label':`${ATLAS_NAMES[atlas]||GROUPS[state.group]} 외피 UV`,'data-atlas':atlas,'data-part':[...new Set(sheetBundles.map(b=>b.selection_id))].join(' '),'data-source':[...new Set(sheetBundles.map(b=>b.source_id))].join(' '),'data-face-count':sheetBundles.reduce((n,b)=>n+b.face_count,0)});
    svg.append(svgNode('rect',{x,y,width,height,fill:'#ffffff'}));
    const defs=svgNode('defs'),patternId='shell-actual-'+ordinal;
    if(state.palette==='actual') {
      const pattern=svgNode('pattern',{id:patternId,patternUnits:'userSpaceOnUse',patternContentUnits:'userSpaceOnUse',width:DATA.atlas_size,height:DATA.atlas_size});
      const href=window.MORBOL_TEXTURES?.[atlas]||`UV-${atlas}-actual-fill-4096.png`;
      pattern.append(svgNode('image',{href,width:DATA.atlas_size,height:DATA.atlas_size,preserveAspectRatio:'none'}));defs.append(pattern);
    }
    svg.append(defs);
    const labels=[],smallPreview=sheetBundles.every(b=>b.patch);
    for(const b of sheetBundles)for(const p of b.pieces) {
      const k=pieceKey(b,p),dimmed=state.piece&&state.piece!==k;
      const group=svgNode('g',{'data-piece':k,'data-source':b.source_id,'data-part':b.selection_id,'data-face-count':p.faces,opacity:dimmed?.20:1});
      const fill=svgNode('path',{d:p.path,fill:state.palette==='actual'?`url(#${patternId})`:p.color,'class':'shell-svg-face'});fill.addEventListener('click',()=>selectPiece(k));
      const title=svgNode('title');title.textContent=`${p.label} · ${p.name}`;fill.append(title);group.append(fill);
      if(state.wire)group.append(svgNode('path',{d:p.wire,fill:'none',stroke:'#334b43','stroke-opacity':.44,'stroke-width':span*.00075,'pointer-events':'none','class':'shell-svg-wire'}));
      group.append(svgNode('path',{d:p.outline,fill:'none',stroke:state.piece===k?'#20392a':'#425d50','stroke-width':span*(state.piece===k?.0035:.0014),'stroke-linejoin':'round','pointer-events':'none'}));
      svg.append(group);if(state.labels&&!dimmed)labels.push([p.label,p.label_point,p.color]);
    }
    const seamLabels=[];
    for(const b of sheetBundles)for(const seam of b.seams) {
      const active=seam.id===state.seam,pts=seam.points;if(pts.length<2)continue;
      const poly=svgNode('polyline',{points:pts.map(p=>p.join(',')).join(' '),fill:'none',stroke:active?'#ffffff':seam.color,'stroke-width':span*(active?.009:.0023),'stroke-dasharray':active?'none':`${span*.007} ${span*.005}`,'stroke-linecap':'round','stroke-linejoin':'round',opacity:state.seam&&!active?.18:.8,'class':'shell-svg-seam'});poly.addEventListener('click',()=>selectSeam(seam.id));svg.append(poly);
      if(active) {
        const line=poly.cloneNode();line.setAttribute('stroke',seam.color);line.setAttribute('stroke-width',span*.0045);line.setAttribute('pointer-events','none');svg.append(line);
        const start=pts[0],end=pts.at(-1),prev=pts.at(-2),len=Math.hypot(end[0]-prev[0],end[1]-prev[1])||1,ux=(end[0]-prev[0])/len,uy=(end[1]-prev[1])/len,r=span*.012;
        svg.append(svgNode('circle',{cx:start[0],cy:start[1],r:r*.46,fill:'white',stroke:'#263d32','stroke-width':r*.18}));
        svg.append(svgNode('polygon',{points:`${end} ${end[0]-ux*r-uy*r*.46},${end[1]-uy*r+ux*r*.46} ${end[0]-ux*r+uy*r*.46},${end[1]-uy*r-ux*r*.46}`,fill:'#263d32'}));
        if(state.labels)seamLabels.push([seam.id,midPoint(pts),seam.color]);
      }
    }
    for(const [label,pos,color] of labels)addLabel(svg,label,pos,span*(smallPreview?.050:.025),color);
    for(const [label,pos,color] of seamLabels)addLabel(svg,label,[pos[0],pos[1]-span*(smallPreview?.070:.025)],span*(smallPreview?.042:.022),color,'shell-seam-label');
    return svg;
  }
  function downloadSVG(svg, atlas) {
    const text=new XMLSerializer().serializeToString(svg),url=URL.createObjectURL(new Blob([text],{type:'image/svg+xml;charset=utf-8'})),a=document.createElement('a');
    a.href=url;a.download=`외피UV-${state.mode==='part'?state.part+'-':''}${atlas}-${state.palette}.svg`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function renderSheets() {
    const host=$('.shell-uv-sheets');host.replaceChildren();const byAtlas=new Map();
    for(const b of visibleBundles()){if(!byAtlas.has(b.atlas))byAtlas.set(b.atlas,[]);byAtlas.get(b.atlas).push(b);}
    let ordinal=0;
    for(const [atlas,bs] of byAtlas) {
      const sheet=document.createElement('div');sheet.className='shell-uv-sheet';sheet.dataset.atlas=atlas;
      const heading=document.createElement('div');heading.className='shell-sheet-heading';
      const h=document.createElement('h4');h.textContent=ATLAS_NAMES[atlas]||(atlas.startsWith('head-')?`머리 위 가시 · ${Number(atlas.slice(-2))}그룹`:GROUPS[state.group]);heading.append(h);
      if(bs.every(b=>b.patch)) {
        sheet.classList.add('shell-patch-sheet');sheet.append(heading);
        const grid=document.createElement('div');grid.className='shell-patch-grid';
        for(const b of bs)for(const p of b.pieces) {
          const cell=document.createElement('div');cell.className='shell-patch-cell';
          const cropped={...b,pieces:[p],bounds:p.bounds,face_count:p.faces,seams:b.seams.filter(s=>s.piece===p.id)};
          const svg=createSVG(atlas,[cropped],ordinal++),title=document.createElement('div');title.className='shell-patch-title';
          const label=document.createElement('span');label.textContent=p.label;title.append(label);
          const save=button('SVG 저장',()=>downloadSVG(svg,p.label));save.className='shell-save';title.append(save);cell.append(title,svg);grid.append(cell);
        }
        const note=document.createElement('p');note.className='shell-patch-note';note.textContent='각 P 조각을 따로 확대했습니다. 미리보기 배율은 서로 다르며 원래 UV 좌표는 그대로입니다. 같은 연결 번호로 본체 외피와 맞춥니다.';
        sheet.append(grid,note);host.append(sheet);continue;
      }
      const svg=createSVG(atlas,bs,ordinal++),save=button('현재 UV 저장 ↗',()=>downloadSVG(svg,atlas));save.className='shell-save';heading.append(save);sheet.append(heading,svg);
      if(bs.some(b=>b.patch)){const note=document.createElement('p');note.className='shell-patch-note';note.textContent='P 조각은 해당 촉수의 상단 외피입니다. 원래 위치·모양·UV를 유지했습니다.';sheet.append(note);}
      host.append(sheet);
    }
  }
  window.MORBOL_SHELL_UV_UI={state,render,visibleBundles:()=>visibleBundles().map(b=>b.id)};
  window.morbolShellUV={getState:()=>({...state,detail:state.mode,visibleBundles:visibleBundles().map(b=>b.id)})};
  render();
})();
