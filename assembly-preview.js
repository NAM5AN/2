(function(){
  'use strict';
  if(window.MorbolAssembly)return;
  const script=document.currentScript;
  const baseURL=new URL('.',script&&script.src||document.baseURI);
  const dataURL=new URL('assembly-data.js?rev=assembly51-20261022',baseURL).href;
  let dataPromise=null,dialog=null,ui=null,session=null,serial=0,restoreFocus=null;
  const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
  const ease=v=>{v=clamp(v,0,1);return v*v*(3-2*v)};
  const mix=(a,b,t)=>a+(b-a)*t;
  const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
  const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
  const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
  const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm=a=>{const d=Math.hypot(...a)||1;return mul(a,1/d)};
  function rgb(value,fallback){
    if(Array.isArray(value)&&value.length>=3){const v=value.slice(0,3).map(Number);return v.some(x=>x>1)?v.map(x=>x/255):v}
    if(typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value))return[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)/255);
    return fallback||[.28,.61,.5];
  }
  function bounds(a,stride){
    const lo=Array(stride).fill(Infinity),hi=Array(stride).fill(-Infinity);
    for(let i=0;i<a.length;i+=stride)for(let j=0;j<stride;j++){lo[j]=Math.min(lo[j],a[i+j]);hi[j]=Math.max(hi[j],a[i+j])}
    return{lo,hi,center:lo.map((v,j)=>(v+hi[j])/2),size:lo.map((v,j)=>hi[j]-v)};
  }
  function loadData(){
    if(window.MORBOL_ASSEMBLY_DATA)return Promise.resolve(window.MORBOL_ASSEMBLY_DATA);
    if(dataPromise)return dataPromise;
    dataPromise=new Promise((resolve,reject)=>{
      const tag=document.createElement('script');tag.src=dataURL;tag.async=true;
      tag.onload=()=>{tag.remove();if(window.MORBOL_ASSEMBLY_DATA)resolve(window.MORBOL_ASSEMBLY_DATA);else{dataPromise=null;reject(new Error('조립 데이터를 읽지 못했어요.'))}};
      tag.onerror=()=>{tag.remove();dataPromise=null;reject(new Error('조립 데이터를 불러오지 못했어요. 연결을 확인하고 다시 시도해 주세요.'))};
      document.head.appendChild(tag);
    });return dataPromise;
  }
  function makeUI(){
    if(dialog)return;
    dialog=document.createElement('dialog');dialog.className='ma-dialog';dialog.setAttribute('aria-labelledby','ma-title');dialog.setAttribute('aria-describedby','ma-description');
    dialog.innerHTML='<div class="ma-head"><div><h2 class="ma-title" id="ma-title">입체 조립 보기</h2><p class="ma-subtitle" id="ma-description">평면 도안이 입체가 되고, 연결 경계가 닿는 과정을 살펴보세요.</p></div><button type="button" class="ma-close" aria-label="조립 보기 닫기">×</button></div><div class="ma-stagebar" aria-label="조립 단계"><span class="ma-step" data-step="0">1 평면 도안</span><span class="ma-step" data-step="1">2 입체 형태</span><span class="ma-step" data-step="2">3 경계 연결</span></div><div class="ma-view-wrap"><canvas class="ma-view" tabindex="0" aria-label="입체 조립 장면. 방향키로 회전, 더하기와 빼기로 확대와 축소"></canvas><canvas class="ma-overlay" aria-hidden="true"></canvas><div class="ma-count"></div><div class="ma-stage" aria-hidden="true"></div><p class="ma-viewhint">드래그: 회전 · 휠/두 손가락: 확대</p><div class="ma-loading"><span class="ma-loader" aria-hidden="true"></span><p>도안의 입체 연결을 불러오는 중이에요.</p><button type="button" class="ma-retry" hidden>다시 시도</button></div></div><div class="ma-controls"><div class="ma-transport"><button type="button" class="ma-play ma-primary">일시정지</button><button type="button" class="ma-replay">처음부터</button><input class="ma-progress" type="range" min="0" max="1000" step="1" value="0" aria-label="조립 진행 위치"><output class="ma-time">0%</output></div><div class="ma-detail"><label for="ma-seams">맞닿는 경계</label><select id="ma-seams" class="ma-seams" aria-label="살펴볼 연결 경계"></select><button type="button" class="ma-reset">시점 초기화</button></div><p class="ma-seam-info"></p><div class="ma-legend"><span><i class="ma-dot ma-dot-selected"></i>선택한 도안</span><span><i class="ma-dot ma-dot-neighbor"></i>맞닿는 도안</span><span><i class="ma-dot ma-dot-edge"></i>선택한 경계 · 원과 화살표: 시작·방향</span></div><p class="ma-caveat">실제 모델의 형태·연결을 설명하는 애니메이션이에요. 평면 배치는 크기 측정용이 아니며, 원단 물성·충돌·시접을 계산하지 않아요.</p></div><p class="ma-status" role="status" aria-live="polite"></p>';
    document.body.appendChild(dialog);
    ui={};for(const key of['close','view','overlay','loading','loader','retry','title','count','stage','play','replay','progress','time','seams','reset','seam-info','status'])ui[key]=dialog.querySelector('.ma-'+key);
    ui.title=dialog.querySelector('#ma-title');ui.loadingText=ui.loading.querySelector('p');ui.steps=Array.from(dialog.querySelectorAll('.ma-step'));
    ui.close.addEventListener('click',close);
    dialog.addEventListener('cancel',e=>{e.preventDefault();close()});
    dialog.addEventListener('click',e=>{if(e.target!==dialog)return;const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close()});
    dialog.addEventListener('close',()=>{if(session||dialog.dataset.busy==='1')close()});
    dialog.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();close();return}
      if(e.key!=='Tab')return;
      const items=Array.from(dialog.querySelectorAll('button:not(:disabled):not([hidden]),input:not(:disabled),select:not(:disabled),canvas[tabindex]')).filter(x=>x.getClientRects().length);
      if(!items.length)return;const first=items[0],last=items[items.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
    });
    ui.play.addEventListener('click',()=>{if(!session)return;if(session.progress>=1)session.progress=0;session.playing=!session.playing;session.last=0;updateControls();schedule()});
    ui.replay.addEventListener('click',()=>{if(!session)return;session.progress=0;session.playing=true;session.last=0;updateControls();schedule()});
    ui.progress.addEventListener('input',()=>{if(!session)return;session.progress=Number(ui.progress.value)/1000;session.playing=false;session.last=0;updateControls();schedule()});
    ui.seams.addEventListener('change',()=>{if(!session)return;session.activeSeam=ui.seams.value;updateSeamInfo();schedule()});
    ui.reset.addEventListener('click',()=>{if(!session)return;session.yaw=0;session.pitch=0;session.zoom=1;schedule()});
    ui.steps.forEach((step,index)=>{step.setAttribute('tabindex','0');step.setAttribute('role','button');step.setAttribute('aria-label',['평면 도안 단계 보기','입체 형태 단계 보기','경계 연결 완료 보기'][index]);const jump=()=>{if(!session)return;session.progress=[0,.62,1][index];session.playing=false;session.last=0;updateControls();schedule()};step.addEventListener('click',jump);step.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();jump()}})});
    const fit=document.createElement('button');fit.type='button';fit.className='ma-fit';fit.textContent='연결 전체 보기';ui.reset.before(fit);ui.fit=fit;
    fit.addEventListener('click',()=>{if(!session)return;session.focusSelection=!session.focusSelection;session.zoom=1;fit.textContent=session.focusSelection?'연결 전체 보기':'선택 도안 보기';schedule()});
    ui.retry.addEventListener('click',()=>{const request=dialog._maRequest;if(request)open(request)});
  }
  function loading(message,error){
    ui.loading.hidden=false;ui.loadingText.textContent=message;ui.loader.hidden=!!error;ui.retry.hidden=!error;
    [ui.play,ui.replay,ui.progress,ui.seams,ui.reset,ui.fit].forEach(x=>x.disabled=true);
  }
  function locate(data,request){
    const version=String(request.version===2||request.version==='2'?2:1),variant=data.variants&&data.variants[version];
    if(!variant)throw new Error('이 버전의 조립 정보를 찾을 수 없어요.');
    let part=variant.parts&&variant.parts[request.part];
    if(!part&&variant.parts)part=Object.values(variant.parts).find(p=>p.id===request.part||p.selectionId===request.part);
    if(!part)throw new Error('선택한 파츠의 조립 정보를 찾을 수 없어요.');
    const requested=String(request.piece==null?'':request.piece),pieces=part.pieces||{};
    let piece=pieces[requested]||Object.values(pieces).find(p=>p.key===requested||p.label===requested||p.key===part.id+':'+requested);
    if(!piece&&Object.keys(pieces).length===1)piece=Object.values(pieces)[0];
    if(!piece)throw new Error('이 도안의 입체 연결 정보를 찾을 수 없어요.');
    return{version,variant,part,piece};
  }
  function sourceArray(value,stride){
    if(!Array.isArray(value)&&!ArrayBuffer.isView(value))throw new Error('도안의 좌표가 올바르지 않아요.');
    const a=Array.isArray(value[0])?value.flat():value;
    if(!a.length||a.length%stride||Array.from(a).some(x=>!Number.isFinite(x)))throw new Error('도안의 좌표가 올바르지 않아요.');
    return a;
  }
  function pieceKey(part,piece){return piece.key||part.id+':'+piece.label}
  function pieceID(piece){return piece.id||String(piece.key||piece.label).split(':').pop()}
  function chartToken(part,piece){return part.id+':'+(piece.chartKey||piece.key||piece.label)}
  function chartMembers(variant,found){
    const token=chartToken(found.part,found.piece);
    return Object.values(found.part.pieces).filter(p=>chartToken(found.part,p)===token).map(piece=>({part:found.part,piece}));
  }
  function getPiece(variant,partID,pieceID){
    const part=variant.parts[partID];if(!part)return null;
    const piece=part.pieces[pieceID]||Object.values(part.pieces).find(p=>p.label===pieceID||p.key===pieceID||p.key===partID+':'+pieceID);
    return piece?{part,piece}:null;
  }
  function buildScene(loc,request){
    const selectedKey=pieceKey(loc.part,loc.piece),seams=loc.variant.seams||{},connected=[];
    const selectedLabels=new Set(chartMembers(loc.variant,{part:loc.part,piece:loc.piece}).flatMap(e=>[pieceID(e.piece),e.piece.label,e.piece.key]));
    const explicit=Array.isArray(loc.piece.seams)?new Set(loc.piece.seams):null;
    for(const[key,seam]of Object.entries(seams)){
      const banks=(seam.banks||[]).filter(b=>b.world&&b.world.length>=2&&b.flat&&b.flat.length>=2);
      if((explicit&&explicit.has(key))||banks.some(b=>b.part===loc.part.id&&(selectedLabels.has(b.piece)||b.piece===selectedKey||b.piece===request.piece))){
        connected.push({key,...seam,banks});
      }
    }
    const pieces=new Map(),selectedChart=chartToken(loc.part,loc.piece);
    for(const found of chartMembers(loc.variant,{part:loc.part,piece:loc.piece}))pieces.set(pieceKey(found.part,found.piece),{...found,selected:true});
    for(const seam of connected)for(const bank of seam.banks){const found=getPiece(loc.variant,bank.part,bank.piece);if(found)for(const member of chartMembers(loc.variant,found)){const key=pieceKey(member.part,member.piece);if(!pieces.has(key))pieces.set(key,{...member,selected:chartToken(member.part,member.piece)===selectedChart})}}
    const groups=new Map();for(const entry of pieces.values()){const key=chartToken(entry.part,entry.piece);entry.chartKey=key;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(entry)}
    let order=0;const selectedWorld=sourceArray(loc.piece.world,3),selectedBounds=bounds(selectedWorld,3),selectedCenter=selectedBounds.center;
    const baseSize=Math.max(...selectedBounds.size,.015);
    const groupInfo=new Map();
    for(const[key,members]of groups){
      const world=members.flatMap(e=>Array.from(sourceArray(e.piece.world,3))),flat=members.flatMap(e=>Array.from(sourceArray(e.piece.flat,2))),wb=bounds(world,3),fb=bounds(flat,2),size=Math.max(...wb.size,.005),index=key===selectedChart?0:++order;
      const slot=index===0?0:index%2===1?-Math.ceil(index/2):Math.ceil(index/2),spread=[slot*baseSize*1.55,0,index%2===1?baseSize*.12:-baseSize*.12];
      const flatOrigin=add(selectedCenter,index===0?[0,0,0]:spread),flatScale=(key===selectedChart?size:Math.min(size,baseSize*1.25))/Math.max(...fb.size,.00001),explosion=key===selectedChart?[0,0,0]:mul(norm(sub(wb.center,selectedCenter)),Math.max(baseSize*.45,Math.min(size*.17,baseSize)));
      if(key!==selectedChart&&Math.hypot(...explosion)<.00001)explosion.splice(0,3,slot*baseSize*.3,-baseSize*.3,0);
      groupInfo.set(key,{wb,fb,size,flatOrigin,flatScale,explosion});
    }
    for(const[key,entry]of pieces){
      const world=sourceArray(entry.piece.world,3),flat=sourceArray(entry.piece.flat,2);
      if(world.length/3!==flat.length/2||world.length%9)throw new Error('도안의 면 연결이 올바르지 않아요.');
      const info=groupInfo.get(entry.chartKey),wb=bounds(world,3),fb=info.fb,flatScale=info.flatScale,flatOrigin=info.flatOrigin,flat3=new Float32Array(world.length);
      for(let i=0,j=0;i<world.length;i+=3,j+=2){flat3[i]=flatOrigin[0]+(flat[j]-fb.center[0])*flatScale;flat3[i+1]=flatOrigin[1];flat3[i+2]=flatOrigin[2]+(flat[j+1]-fb.center[1])*flatScale}
      const explosion=info.explosion;
      Object.assign(entry,{key,world:new Float32Array(world),flat:new Float32Array(flat),flat3,flatCenter:fb.center,flatScale,flatOrigin,flatWidth:fb.size[0]*flatScale,currentFlatOrigin:flatOrigin,worldBounds:wb,explosion,nativeColors:entry.piece.colors,baseColor:rgb(entry.piece.color),count:world.length/3});
    }
    const averageNormal=[0,0,0];let normalArea=0;
    for(const entry of pieces.values())if(entry.selected)for(let i=0;i<entry.world.length;i+=9){const a=Array.from(entry.world.subarray(i,i+3)),b=Array.from(entry.world.subarray(i+3,i+6)),c=Array.from(entry.world.subarray(i+6,i+9)),n=cross(sub(b,a),sub(c,a));normalArea+=Math.hypot(...n);for(let j=0;j<3;j++)averageNormal[j]+=n[j]}
    let autoYaw=.38,autoPitch=.28;
    if(Math.hypot(...averageNormal)/Math.max(normalArea,1e-12)>.75){let n=norm(averageNormal);if(n[1]>0)n=mul(n,-1);autoYaw=Math.atan2(n[0],-n[1]);autoPitch=clamp(Math.asin(n[2]),-1.42,1.42)}
    const areaOf=seam=>Math.max(...seam.banks.filter(b=>b.part!==loc.part.id||b.piece!==pieceID(loc.piece)).map(b=>{const found=getPiece(loc.variant,b.part,b.piece);if(!found)return Infinity;const a=bounds(sourceArray(found.piece.world,3),3);return Math.max(...a.size)}),0);
    const pairs=connected.filter(x=>x.pairable&&x.type!=='reference'),ownPairs=pairs.filter(x=>x.banks.some(b=>b.part===loc.part.id&&b.piece===pieceID(loc.piece)));
    const chosen=connected.find(s=>s.key===request.seam||s.id===request.seam)||ownPairs.sort((a,b)=>areaOf(a)-areaOf(b))[0]||pairs.sort((a,b)=>areaOf(a)-areaOf(b))[0]||connected.find(x=>x.type!=='reference')||connected[0];
    const scene={...loc,selectedKey,selectedChart,pieces,connected,activeSeam:chosen&&chosen.key||'',progress:0,playing:!window.matchMedia('(prefers-reduced-motion: reduce)').matches,yaw:0,pitch:0,autoYaw,autoPitch,zoom:1,focusSelection:true,last:0,raf:0,disposed:false,stageIndex:-1,pointerMap:new Map(),listeners:[],gl:null,resources:[],size:{width:1,height:1},camera:null};
    return scene;
  }
  function compile(gl,type,source){const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS)){const msg=gl.getShaderInfoLog(sh);gl.deleteShader(sh);throw new Error('입체 화면을 준비하지 못했어요. '+msg)}return sh}
  function createRenderer(s){
    const gl=ui.view.getContext('webgl',{antialias:true,alpha:false,preserveDrawingBuffer:false});
    if(!gl)throw new Error('이 브라우저에서는 입체 화면을 표시할 수 없어요. WebGL 사용 설정을 확인해 주세요.');
    s.gl=gl;
    const vs=compile(gl,gl.VERTEX_SHADER,'attribute vec3 aWorld;attribute vec3 aFlat;attribute vec3 aNormal;attribute vec3 aColor;uniform mat4 uVP;uniform float uMorph;uniform vec3 uOffset;uniform vec3 uFlatOffset;varying vec3 vNormal;varying vec3 vColor;void main(){vec3 p=mix(aFlat+uFlatOffset,aWorld,uMorph)+uOffset;gl_Position=uVP*vec4(p,1.0);vNormal=normalize(mix(vec3(0.0,-1.0,0.0),aNormal,uMorph)+vec3(.00001,0.0,0.0));vColor=aColor;}');
    const fs=compile(gl,gl.FRAGMENT_SHADER,'precision mediump float;varying vec3 vNormal;varying vec3 vColor;uniform float uAlpha;uniform float uSelected;void main(){float light=.70+.30*abs(dot(normalize(vNormal),normalize(vec3(-.35,-.75,.8))));vec3 col=mix(vColor,mix(vColor,vec3(.19,.39,.47),.48),1.0-uSelected);gl_FragColor=vec4(col*light,uAlpha);}');
    const program=gl.createProgram();gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);gl.deleteShader(vs);gl.deleteShader(fs);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('입체 화면을 준비하지 못했어요.');
    s.program=program;s.resources.push({kind:'program',value:program});
    s.a={};for(const name of['aWorld','aFlat','aNormal','aColor'])s.a[name]=gl.getAttribLocation(program,name);
    s.u={};for(const name of['uVP','uMorph','uOffset','uFlatOffset','uAlpha','uSelected'])s.u[name]=gl.getUniformLocation(program,name);
    const bind=a=>{const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,a,gl.STATIC_DRAW);s.resources.push({kind:'buffer',value:b});return b};
    for(const entry of s.pieces.values()){
      const normals=new Float32Array(entry.world.length),colors=new Float32Array(entry.world.length);
      for(let i=0;i<entry.world.length;i+=9){const a=Array.from(entry.world.subarray(i,i+3)),b=Array.from(entry.world.subarray(i+3,i+6)),c=Array.from(entry.world.subarray(i+6,i+9)),n=norm(cross(sub(b,a),sub(c,a)));for(let j=0;j<9;j+=3)normals.set(n,i+j)}
      if(entry.nativeColors&&entry.nativeColors.length===colors.length){for(let i=0;i<colors.length;i++)colors[i]=entry.nativeColors[i]>1?entry.nativeColors[i]/255:entry.nativeColors[i]}else for(let i=0;i<colors.length;i+=3)colors.set(entry.baseColor,i);
      entry.buffers={aWorld:bind(entry.world),aFlat:bind(entry.flat3),aNormal:bind(normals),aColor:bind(colors)};
    }
    gl.clearColor(.963,.976,.961,1);gl.enable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    const resize=()=>{if(s.disposed)return;const rect=ui.view.getBoundingClientRect(),dpr=Math.min(window.devicePixelRatio||1,2);s.size={width:Math.max(1,rect.width),height:Math.max(1,rect.height)};ui.view.width=Math.round(s.size.width*dpr);ui.view.height=Math.round(s.size.height*dpr);ui.overlay.width=ui.view.width;ui.overlay.height=ui.view.height;s.dpr=dpr;gl.viewport(0,0,ui.view.width,ui.view.height);schedule()};
    s.observer=new ResizeObserver(resize);s.observer.observe(ui.view);resize();
    const listen=(target,type,fn,opts)=>{target.addEventListener(type,fn,opts);s.listeners.push(()=>target.removeEventListener(type,fn,opts))};
    let lastPoint=null,lastPinch=0;
    listen(ui.view,'pointerdown',e=>{s.pointerMap.set(e.pointerId,[e.clientX,e.clientY]);ui.view.setPointerCapture(e.pointerId);lastPoint=[e.clientX,e.clientY];if(s.pointerMap.size===2){const p=Array.from(s.pointerMap.values());lastPinch=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1])}});
    listen(ui.view,'pointermove',e=>{if(!s.pointerMap.has(e.pointerId))return;s.pointerMap.set(e.pointerId,[e.clientX,e.clientY]);if(s.pointerMap.size===2){const p=Array.from(s.pointerMap.values()),d=Math.hypot(p[0][0]-p[1][0],p[0][1]-p[1][1]);if(lastPinch>0)s.zoom=clamp(s.zoom*lastPinch/Math.max(d,1),.3,4);lastPinch=d}else if(lastPoint){s.yaw+=(e.clientX-lastPoint[0])*.009;s.pitch=clamp(s.pitch+(e.clientY-lastPoint[1])*.009,-1.4,1.4)}lastPoint=[e.clientX,e.clientY];schedule()});
    const pointerEnd=e=>{s.pointerMap.delete(e.pointerId);lastPoint=s.pointerMap.size?Array.from(s.pointerMap.values())[0]:null;lastPinch=0};
    listen(ui.view,'pointerup',pointerEnd);listen(ui.view,'pointercancel',pointerEnd);listen(ui.view,'lostpointercapture',pointerEnd);
    listen(ui.view,'wheel',e=>{e.preventDefault();s.zoom=clamp(s.zoom*Math.exp(e.deltaY*.001),.3,4);schedule()},{passive:false});
    listen(ui.view,'keydown',e=>{let used=true;if(e.key==='ArrowLeft')s.yaw-=.15;else if(e.key==='ArrowRight')s.yaw+=.15;else if(e.key==='ArrowUp')s.pitch=clamp(s.pitch-.15,-1.4,1.4);else if(e.key==='ArrowDown')s.pitch=clamp(s.pitch+.15,-1.4,1.4);else if(e.key==='+'||e.key==='=')s.zoom=clamp(s.zoom*.85,.3,4);else if(e.key==='-'||e.key==='_')s.zoom=clamp(s.zoom/ .85,.3,4);else if(e.key===' '){if(s.progress>=1)s.progress=0;s.playing=!s.playing;s.last=0;updateControls()}else used=false;if(used){e.preventDefault();schedule()}});
    listen(ui.view,'webglcontextlost',e=>{e.preventDefault();s.playing=false;cancelAnimationFrame(s.raf);s.raf=0;loading('입체 화면이 중단됐어요. 다시 시도해 주세요.',true)});
  }
  function dispose(){
    const s=session;session=null;if(!s)return;s.disposed=true;cancelAnimationFrame(s.raf);if(s.observer)s.observer.disconnect();s.listeners.forEach(fn=>fn());
    if(s.gl){for(const r of s.resources){if(r.kind==='buffer')s.gl.deleteBuffer(r.value);else if(r.kind==='program')s.gl.deleteProgram(r.value)}s.gl.clear(s.gl.COLOR_BUFFER_BIT|s.gl.DEPTH_BUFFER_BIT)}
    s.resources=[];s.pieces.clear();
    if(ui){const ctx=ui.overlay.getContext('2d');if(ctx)ctx.clearRect(0,0,ui.overlay.width,ui.overlay.height)}
  }
  function matrixMultiply(a,b){const o=new Float32Array(16);for(let c=0;c<4;c++)for(let r=0;r<4;r++)for(let k=0;k<4;k++)o[c*4+r]+=a[k*4+r]*b[c*4+k];return o}
  function cameraMatrix(center,half,s){
    const auto=ease((s.progress-.18)/.44),yaw=s.yaw+s.autoYaw*auto,pitch=clamp(s.pitch+s.autoPitch*auto,-1.5,1.5);
    const cp=Math.cos(pitch),z=[Math.sin(yaw)*cp,-Math.cos(yaw)*cp,Math.sin(pitch)],x=norm(cross([0,0,1],z)),y=cross(z,x),aspect=s.size.width/s.size.height,tanV=Math.tan(Math.PI/8),radius=Math.max(.0001,Math.hypot(...half));
    let required=0,maxDepth=0;
    for(const sx of[-1,1])for(const sy of[-1,1])for(const sz of[-1,1]){const corner=[sx*half[0],sy*half[1],sz*half[2]],depth=dot(z,corner);maxDepth=Math.max(maxDepth,depth);required=Math.max(required,depth+Math.max(Math.abs(dot(x,corner))/(tanV*aspect),Math.abs(dot(y,corner))/tanV))}
    const distance=Math.max(required*1.15*s.zoom,maxDepth+radius*.025),eye=add(center,mul(z,distance));
    const view=new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
    const near=Math.max(.000001,Math.min(radius*.008,(distance-maxDepth)*.2)),far=Math.max(distance+radius*8,near+1),f=1/tanV;
    const projection=new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]);
    return matrixMultiply(projection,view);
  }
  function phases(s,entry){
      const t=s.progress,fold=ease((t-.13)/.49),join=ease((t-.62)/.35);
    return{fold,offset:mul(entry.explosion,(1-join)*fold),flatShift:sub(entry.currentFlatOrigin,entry.flatOrigin)};
  }
  function pointAt(s,entry,world,flat){
    const p=phases(s,entry),f=[entry.currentFlatOrigin[0]+(flat[0]-entry.flatCenter[0])*entry.flatScale,entry.currentFlatOrigin[1],entry.currentFlatOrigin[2]+(flat[1]-entry.flatCenter[1])*entry.flatScale];
    return f.map((v,i)=>mix(v,world[i],p.fold)+p.offset[i]);
  }
  function visibleEntries(s){
    if(s.activeSeam==='__all')return Array.from(s.pieces.values());
    const chartKeys=new Set([s.selectedChart]),seam=s.connected.find(x=>x.key===s.activeSeam);
    if(seam)for(const bank of seam.banks){const found=getPiece(s.variant,bank.part,bank.piece);if(found)chartKeys.add(chartToken(found.part,found.piece))}
    return Array.from(s.pieces.values()).filter(e=>chartKeys.has(e.chartKey));
  }
  function updateVisibleLayout(s){
    const entries=visibleEntries(s),groups=new Map();for(const entry of entries)if(!groups.has(entry.chartKey))groups.set(entry.chartKey,entry);
    const selected=groups.get(s.selectedChart),origin=selected.flatOrigin,margin=Math.max(selected.flatWidth*.12,.008);let left=selected.flatWidth/2,right=left,index=0;
    for(const[key,entry]of groups){let current=origin;if(key!==s.selectedChart){const width=entry.flatWidth;if(index++%2===0){current=add(origin,[-left-margin-width/2,0,0]);left+=margin+width}else{current=add(origin,[right+margin+width/2,0,0]);right+=margin+width}}
      for(const member of entries)if(member.chartKey===key)member.currentFlatOrigin=current;
    }
  }
  function sceneBounds(s){
    const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    const entries=visibleEntries(s);
    for(const entry of entries){
      const p=phases(s,entry);for(let i=0;i<entry.world.length;i+=3)for(let j=0;j<3;j++){const v=mix(entry.flat3[i+j]+p.flatShift[j],entry.world[i+j],p.fold)+p.offset[j];lo[j]=Math.min(lo[j],v);hi[j]=Math.max(hi[j],v)}
    }
    let center=lo.map((v,j)=>(v+hi[j])/2),half=lo.map((v,j)=>(hi[j]-v)/2);
    if(s.focusSelection&&s.progress>.45){
      const selectedLo=[Infinity,Infinity,Infinity],selectedHi=[-Infinity,-Infinity,-Infinity];
      for(const entry of entries.filter(e=>e.selected)){const p=phases(s,entry);for(let i=0;i<entry.world.length;i+=3)for(let j=0;j<3;j++){const v=mix(entry.flat3[i+j]+p.flatShift[j],entry.world[i+j],p.fold)+p.offset[j];selectedLo[j]=Math.min(selectedLo[j],v);selectedHi[j]=Math.max(selectedHi[j],v)}}
      const selectedCenter=selectedLo.map((v,j)=>(v+selectedHi[j])/2),selectedHalf=selectedLo.map((v,j)=>(selectedHi[j]-v)/2),t=ease((s.progress-.45)/.35);
      half=half.map((v,j)=>mix(v,Math.min(v,selectedHalf[j]*2.15),t));center=center.map((v,j)=>mix(v,selectedCenter[j],t));
    }
    return{center,half};
  }
  function project(point,vp,s){
    const x=point[0],y=point[1],z=point[2],w=vp[3]*x+vp[7]*y+vp[11]*z+vp[15];if(w<=0)return null;
    return[(vp[0]*x+vp[4]*y+vp[8]*z+vp[12])/w*s.size.width*.5+s.size.width*.5,s.size.height*.5-(vp[1]*x+vp[5]*y+vp[9]*z+vp[13])/w*s.size.height*.5,(vp[2]*x+vp[6]*y+vp[10]*z+vp[14])/w];
  }
  function drawBank(ctx,points,color,startMark){
    if(points.length<2)return;ctx.strokeStyle=color;ctx.lineWidth=3;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();let begun=false;
    for(const p of points){if(!p){begun=false;continue}if(!begun){ctx.moveTo(p[0],p[1]);begun=true}else ctx.lineTo(p[0],p[1])}ctx.stroke();
    const first=points.find(Boolean);if(!first||!startMark)return;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(first[0],first[1],4,0,Math.PI*2);ctx.fill();ctx.stroke();
    let distance=0,target=null,prior=first;for(const p of points){if(!p)continue;distance+=Math.hypot(p[0]-prior[0],p[1]-prior[1]);if(distance>16){target=p;break}prior=p}
    if(target){const v=norm([target[0]-prior[0],target[1]-prior[1],0]);ctx.beginPath();ctx.moveTo(target[0]-v[0]*7-v[1]*4,target[1]-v[1]*7+v[0]*4);ctx.lineTo(target[0],target[1]);ctx.lineTo(target[0]-v[0]*7+v[1]*4,target[1]-v[1]*7-v[0]*4);ctx.stroke()}
  }
  function sampleBank(bank,ratio){
    const world=bank.world,flat=bank.flat,lengths=[0];for(let i=1;i<world.length;i++)lengths.push(lengths[i-1]+Math.hypot(...sub(world[i],world[i-1])));
    const target=lengths[lengths.length-1]*ratio;let i=1;while(i<lengths.length-1&&lengths[i]<target)i++;
    const t=(target-lengths[i-1])/Math.max(1e-12,lengths[i]-lengths[i-1]);return{world:world[i-1].map((v,j)=>mix(v,world[i][j],t)),flat:flat[i-1].map((v,j)=>mix(v,flat[i][j],t))};
  }
  function drawOverlay(s,vp){
    const ctx=ui.overlay.getContext('2d');if(!ctx)return;ctx.setTransform(s.dpr,0,0,s.dpr,0,0);ctx.clearRect(0,0,s.size.width,s.size.height);
    const seam=s.connected.find(x=>x.key===s.activeSeam);if(!seam)return;
    const rendered=[];
    seam.banks.forEach((bank,i)=>{const found=getPiece(s.variant,bank.part,bank.piece),entry=found&&s.pieces.get(pieceKey(found.part,found.piece));if(!entry)return;const points=bank.world.map((world,j)=>project(pointAt(s,entry,world,bank.flat[j]),vp,s));const color=i%2?'#087b80':'#d87e0d';drawBank(ctx,points,color,true);rendered.push({bank,entry,points,color})});
    if(seam.pairable===true&&rendered.length===2&&s.progress<.97){
      ctx.save();ctx.strokeStyle='#577969aa';ctx.lineWidth=1.3;ctx.setLineDash([4,5]);
      for(const ratio of[0,.5,1]){const samples=rendered.map(item=>{const sample=sampleBank(item.bank,ratio);return project(pointAt(s,item.entry,sample.world,sample.flat),vp,s)}),a=samples[0],b=samples[1];if(a&&b){ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke()}}ctx.restore();
    }
    rendered.forEach(({bank,points,color},i)=>{const p=points.find(Boolean);if(!p)return;const label=bank.part+' '+bank.piece+(seam.banks.length>2?' · '+(i+1):'');ctx.font='600 11px system-ui';const width=ctx.measureText(label).width+12,x=clamp(p[0]+8,4,s.size.width-width-4),y=clamp(p[1]-20,38,s.size.height-23);ctx.fillStyle='#fffffff0';ctx.fillRect(x,y,width,19);ctx.fillStyle=color;ctx.fillText(label,x+6,y+13)});
  }
  function render(s){
    if(s.disposed||session!==s)return;const gl=s.gl;if(!gl)return;
    const b=sceneBounds(s),vp=cameraMatrix(b.center,b.half,s);s.camera={...b,vp};gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(s.program);gl.uniformMatrix4fv(s.u.uVP,false,vp);
    const active=s.connected.find(x=>x.key===s.activeSeam),activeKeys=new Set((active&&active.banks||[]).map(b=>b.part+':'+b.piece));
    const entries=visibleEntries(s).sort((a,b)=>Number(a.selected)-Number(b.selected));
    for(const entry of entries){const p=phases(s,entry);for(const[name,buffer]of Object.entries(entry.buffers)){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(s.a[name]);gl.vertexAttribPointer(s.a[name],3,gl.FLOAT,false,0,0)}
      gl.uniform1f(s.u.uMorph,p.fold);gl.uniform3fv(s.u.uOffset,p.offset);gl.uniform3fv(s.u.uFlatOffset,p.flatShift);gl.uniform1f(s.u.uSelected,entry.selected?1:0);gl.uniform1f(s.u.uAlpha,entry.selected?1:activeKeys.has(entry.key)?.68:.22);gl.depthMask(entry.selected);gl.drawArrays(gl.TRIANGLES,0,entry.count);
    }
    gl.depthMask(true);drawOverlay(s,vp);
  }
  function stageIndex(t){return t<.13?0:t<=.62?1:2}
  function updateControls(){
    const s=session;if(!s)return;ui.play.textContent=s.playing?'일시정지':s.progress>=1?'다시 재생':'재생';ui.progress.value=Math.round(s.progress*1000);ui.time.textContent=Math.round(s.progress*100)+'%';
    const stage=stageIndex(s.progress);ui.progress.setAttribute('aria-valuetext',Math.round(s.progress*100)+'%, '+['평면 도안','입체 형태','경계 연결'][stage]);ui.steps.forEach((el,i)=>{if(i===stage)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current')});
    const labels=['평면 도안을 펼친 상태','실제 입체 형태로 구부리는 중','맞닿는 경계가 조립 위치로 모이는 중'];ui.stage.textContent=s.progress>=1?'조립 위치':labels[stage];
    if(stage!==s.stageIndex){s.stageIndex=stage;ui.status.textContent=labels[stage]}
  }
  function updateSeamInfo(){
    const s=session;if(!s)return;const seam=s.connected.find(x=>x.key===s.activeSeam);
    updateVisibleLayout(s);
    const count=new Set(visibleEntries(s).map(e=>e.chartKey)).size-1;ui.count.textContent='선택 도안 1개'+(count>0?' · 연결 도안 '+count+'개':'');
    if(!seam){ui['seam-info'].textContent=s.activeSeam==='__all'?'연결되는 도안을 모두 표시해요. 경계를 고르면 해당 도안끼리 자세히 살펴볼 수 있어요.':'이 도안에는 연결 경계 정보가 없어요. 입체 형태를 살펴볼 수 있어요.';return}
    const names=Array.from(new Set(seam.banks.map(b=>b.part+' '+b.piece))),same=new Set(seam.banks.map(b=>b.part+':'+b.piece)).size===1;
    ui['seam-info'].textContent=names.join(' ↔ ')+(seam.type==='reference'?' · 한 장으로 이어진 도안 안의 기준선':same?' · 같은 도안 안의 재봉 경계':'')+(seam.banks.length>2?' · '+seam.banks.length+'개 구간을 함께 표시해요.':seam.pairable?' · 같은 시작점·방향의 경계가 맞닿아요.':' · 등록된 경계 구간을 표시해요.');
  }
  function schedule(){const s=session;if(s&&!s.disposed&&!s.raf)s.raf=requestAnimationFrame(time=>tick(s,time))}
  function tick(s,time){s.raf=0;if(session!==s||s.disposed)return;if(s.playing){if(s.last)s.progress=clamp(s.progress+(time-s.last)/10500,0,1);s.last=time;if(s.progress>=1)s.playing=false}else s.last=0;updateControls();render(s);if(s.playing)schedule()}
  async function open(request){
    request=request||{};makeUI();const token=++serial;if(!dialog.open)restoreFocus=request.sourceElement||document.activeElement;else if(request.sourceElement&&!dialog.contains(request.sourceElement))restoreFocus=request.sourceElement;dialog._maRequest={...request};dispose();dialog.dataset.busy='1';
    if(!dialog.open){dialog.showModal();ui.close.focus()}
    ui.title.textContent=(request.part||'도안')+' '+(request.piece||'')+' · 입체 조립 보기';loading('도안의 입체 연결을 불러오는 중이에요.',false);ui.count.textContent='';ui.stage.textContent='';ui['seam-info'].textContent='';ui.seams.replaceChildren();
    try{
      const data=await loadData();if(token!==serial||!dialog.open)return{status:'cancelled'};
      const loc=locate(data,request),s=buildScene(loc,request);session=s;createRenderer(s);if(token!==serial||!dialog.open){dispose();return{status:'cancelled'}}
      ui.title.textContent=(loc.part.name||loc.part.id)+' '+loc.piece.label+' · 입체 조립 보기';
      const neighborCount=s.pieces.size-1;ui.count.textContent='선택 도안 1개'+(neighborCount?' · 연결 도안 '+neighborCount+'개':'');
      for(const seam of s.connected){const option=document.createElement('option');option.value=seam.key;option.textContent=(seam.label||seam.id||seam.key)+' · '+seam.banks.length+'구간'+(seam.type==='reference'?' · 기준선':'');ui.seams.appendChild(option)}
      if(s.connected.length>1){const option=document.createElement('option');option.value='__all';option.textContent='연결 도안 전체';ui.seams.appendChild(option)}
      if(!s.connected.length){const option=document.createElement('option');option.value='';option.textContent='등록된 연결 경계 없음';ui.seams.appendChild(option)}
      ui.seams.value=s.activeSeam;ui.fit.textContent='연결 전체 보기';[ui.play,ui.replay,ui.progress,ui.reset,ui.fit].forEach(x=>x.disabled=false);ui.seams.disabled=!s.connected.length;ui.loading.hidden=true;dialog.dataset.busy='0';updateSeamInfo();updateControls();schedule();
      document.dispatchEvent(new CustomEvent('morbol-assembly-open',{detail:{part:loc.part.id,piece:pieceID(loc.piece),version:loc.version,seams:s.connected.map(x=>x.key)}}));
      return{status:'ready',part:loc.part.id,piece:pieceID(loc.piece),version:loc.version,seams:s.connected.length};
    }catch(error){if(token!==serial||!dialog.open)return{status:'cancelled'};dispose();dialog.dataset.busy='0';loading(error&&error.message||'조립 보기를 준비하지 못했어요.',true);ui.status.textContent='조립 보기를 불러오지 못했어요.';return{status:'error',message:error&&error.message}}
  }
  function close(options){++serial;dispose();if(!dialog)return;dialog.dataset.busy='0';if(dialog.open)dialog.close();const previous=restoreFocus;restoreFocus=null;if((!options||options.restoreFocus!==false)&&previous&&previous.isConnected&&typeof previous.focus==='function')previous.focus({preventScroll:true});document.dispatchEvent(new CustomEvent('morbol-assembly-close'))}
  window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===parent&&e.data&&e.data.type==='morbol-assembly-suspend')close({restoreFocus:false})});
  window.addEventListener('pagehide',()=>close({restoreFocus:false}));
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&session){session.playing=false;session.last=0;cancelAnimationFrame(session.raf);session.raf=0;updateControls()}});
  window.MorbolAssembly={open,close,getState(){return session?{part:session.part.id,piece:pieceID(session.piece),version:session.version,progress:session.progress,playing:session.playing,seam:session.activeSeam,pieces:session.pieces.size,visiblePieces:visibleEntries(session).map(e=>e.key),selectedChart:session.selectedChart}:null}};
})();
