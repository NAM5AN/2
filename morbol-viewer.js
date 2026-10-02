(function () {
  'use strict';
  const GROUPS = ['lips', 'body', 'long', 'medium', 'small', 'head', 'bottom'];
  const VIEWS = {front:[2.3,-6,2],rear:[-1.8,6,1.8],bottom:[1.2,-2,-4],left:[-6,0,.3],right:[6,0,.3],top:[0,-.001,6]};
  const add=(a,b)=>a.map((x,i)=>x+b[i]), sub=(a,b)=>a.map((x,i)=>x-b[i]);
  const mul=(a,s)=>a.map(x=>x*s), dot=(a,b)=>a.reduce((s,x,i)=>s+x*b[i],0);
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm=a=>mul(a,1/(Math.hypot(...a)||1));
  const box=p=>{const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];for(let j=0;j<p.length;j+=3)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],p[j+k]);hi[k]=Math.max(hi[k],p[j+k]);}return{lo,hi};};
  const corners=b=>Array.from({length:8},(_,i)=>b.lo.map((x,k)=>(i&(1<<k))?b.hi[k]:x));
  function bvh(p,ids) {
    const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    for(const t of ids)for(let v=0;v<3;v++)for(let k=0;k<3;k++){const n=p[t*9+v*3+k];lo[k]=Math.min(lo[k],n);hi[k]=Math.max(hi[k],n);}
    if(ids.length<=12)return{lo,hi,ids};
    const axis=hi.map((x,k)=>x-lo[k]).reduce((best,x,k,ar)=>x>ar[best]?k:best,0);
    ids.sort((a,b)=>(p[a*9+axis]+p[a*9+3+axis]+p[a*9+6+axis])-(p[b*9+axis]+p[b*9+3+axis]+p[b*9+6+axis]));
    const mid=ids.length>>1;return{lo,hi,left:bvh(p,ids.slice(0,mid)),right:bvh(p,ids.slice(mid))};
  }
  function boxHit(b,o,d,limit){let near=0,far=limit;for(let k=0;k<3;k++){if(Math.abs(d[k])<1e-12){if(o[k]<b.lo[k]-1e-7||o[k]>b.hi[k]+1e-7)return false;continue;}let a=(b.lo[k]-o[k])/d[k],c=(b.hi[k]-o[k])/d[k];if(a>c)[a,c]=[c,a];near=Math.max(near,a);far=Math.min(far,c);if(near>far)return false;}return true;}
  function triHit(p,t,o,d,limit){
    const i=t*9,ax=p[i],ay=p[i+1],az=p[i+2],e1x=p[i+3]-ax,e1y=p[i+4]-ay,e1z=p[i+5]-az,e2x=p[i+6]-ax,e2y=p[i+7]-ay,e2z=p[i+8]-az;
    const hx=d[1]*e2z-d[2]*e2y,hy=d[2]*e2x-d[0]*e2z,hz=d[0]*e2y-d[1]*e2x,det=e1x*hx+e1y*hy+e1z*hz;if(Math.abs(det)<1e-12)return false;
    const inv=1/det,sx=o[0]-ax,sy=o[1]-ay,sz=o[2]-az,u=inv*(sx*hx+sy*hy+sz*hz);if(u<-.00001||u>1.00001)return false;
    const qx=sy*e1z-sz*e1y,qy=sz*e1x-sx*e1z,qz=sx*e1y-sy*e1x,v=inv*(d[0]*qx+d[1]*qy+d[2]*qz);if(v<-.00001||u+v>1.00001)return false;
    const hit=inv*(e2x*qx+e2y*qy+e2z*qz);return hit>0&&hit<limit;
  }
  function blocked(node,p,o,d,limit){if(!boxHit(node,o,d,limit))return false;if(node.ids)return node.ids.some(t=>triHit(p,t,o,d,limit));return blocked(node.left,p,o,d,limit)||blocked(node.right,p,o,d,limit);}
  function shader(gl,type,source){const sh=gl.createShader(type);gl.shaderSource(sh,source);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh;}
  function program(gl,vs,fs){const p=gl.createProgram();gl.attachShader(p,shader(gl,gl.VERTEX_SHADER,vs));gl.attachShader(p,shader(gl,gl.FRAGMENT_SHADER,fs));gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
  const VS=`attribute vec3 aPosition;attribute vec3 aNormal;attribute vec2 aUV;attribute vec3 aColor;uniform mat4 uMatrix;varying vec3 vNormal;varying vec2 vUV;varying vec3 vColor;void main(){gl_Position=uMatrix*vec4(aPosition,1.0);vNormal=aNormal;vUV=aUV;vColor=aColor;}`;
  const FS=`precision mediump float;varying vec3 vNormal;varying vec2 vUV;varying vec3 vColor;uniform sampler2D uTexture;uniform bool uActual;uniform bool uLine;uniform bool uPerson;uniform float uAlpha;void main(){if(uLine){gl_FragColor=vec4(.12,.20,.23,.46);return;}vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;vec3 base=uActual?(vUV.x>1.0?vec3(.32,.38,.18):texture2D(uTexture,vUV).rgb):vColor;vec3 linear=pow(max(base,vec3(.001)),vec3(2.2));float light=.51+.37*max(dot(n,normalize(vec3(-.6,-.9,1.5))),0.)+.16*max(dot(n,normalize(vec3(1.,.4,.6))),0.);if(uPerson)light=.95;vec3 lit=linear*light;if(uActual)lit=lit*1.3+vec3(.017);gl_FragColor=vec4(pow(lit,vec3(1./2.2)),uAlpha);}`;

  class MorbolViewer {
    constructor(host,data,textures,options={}) {
      this.host=host;this.data=data;this.options=options;this.visible=Object.fromEntries(GROUPS.map(g=>[g,true]));this.partVisible=Object.fromEntries(data.objects.map(o=>[o.id,true]));
      this.palette='uv';this.labels=true;this.wire=false;this.person=false;this.view='front';this.direction=norm(VIEWS.front);this.target=[0,0,1];this.halfHeight=1.3;this.disposed=false;this.moving=false;this._ready=false;
      host.style.position='relative';host.style.overflow='hidden';host.style.background='#fff';host.dataset.ready='loading';
      this.canvas=document.createElement('canvas');this.canvas.className='morbol-webgl';this.canvas.setAttribute('aria-label','몰볼 3D 모델. 왼쪽 드래그로 회전, 휠로 확대, 오른쪽 드래그로 이동합니다.');this.canvas.tabIndex=0;this.canvas.setAttribute('role','img');
      this.overlay=document.createElement('canvas');this.overlay.className='morbol-labels';this.overlay.setAttribute('aria-hidden','true');
      for(const c of [this.canvas,this.overlay])Object.assign(c.style,{position:'absolute',inset:'0',width:'100%',height:'100%',display:'block'});
      this.canvas.style.touchAction='none';this.overlay.style.pointerEvents='none';
      this.status=document.createElement('div');this.status.className='morbol-render-status';this.status.setAttribute('role','status');Object.assign(this.status.style,{position:'absolute',left:'18px',right:'18px',top:'45%',textAlign:'center',color:'#60716b',fontSize:'14px',lineHeight:'1.7',pointerEvents:'none'});this.status.textContent='모델을 준비하고 있습니다…';host.append(this.canvas,this.overlay,this.status);
      this.ready=this.init(textures).catch(e=>{host.dataset.ready='error';this.status.hidden=false;this.status.textContent='3D 화면을 열지 못했습니다. 브라우저의 하드웨어 가속을 확인한 뒤 새로고침해 주세요.';this.error=String(e);console.error('Morbol viewer:',e);throw e;});
    }
    async init(textures) {
      const gl=this.gl=this.canvas.getContext('webgl',{alpha:false,antialias:true,preserveDrawingBuffer:true})||this.canvas.getContext('experimental-webgl');if(!gl)throw Error('WebGL unavailable');
      this.prog=program(gl,VS,FS);gl.useProgram(this.prog);this.attrib={};for(const name of ['Position','Normal','UV','Color'])this.attrib[name]=gl.getAttribLocation(this.prog,'a'+name);
      this.uniform={};for(const name of ['Matrix','Texture','Actual','Line','Person','Alpha'])this.uniform[name]=gl.getUniformLocation(this.prog,'u'+name);
      this.objects=this.data.objects.map(o=>this.upload(o));this.people=(this.data.person||[]).map(o=>this.upload(o));this.textures={};
      for(const [atlas,url] of Object.entries(textures)){
        const im=new Image();im.src=url;await im.decode();const tex=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tex);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
        const limit=Math.min(2048,gl.getParameter(gl.MAX_TEXTURE_SIZE));let source=im;
        if(im.width>limit||im.height>limit){const small=document.createElement('canvas');const ratio=limit/Math.max(im.width,im.height);small.width=Math.round(im.width*ratio);small.height=Math.round(im.height*ratio);small.getContext('2d').drawImage(im,0,0,small.width,small.height);source=small;}
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);this.textures[atlas]=tex;
      }
      this.fallback=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.fallback);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([255,255,255,255]));gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);
      this.bindInteraction();this._ready=true;this.host.dataset.ready='true';this.resize();this.fit();this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(this.host);this.emit();return this;
    }
    upload(o){const gl=this.gl,res={...o,buffers:{},box:box(o.positions),count:o.positions.length/3,edgeCount:(o.edges||[]).length/3};
      for(const [key,values] of Object.entries({Position:o.positions,Normal:o.normals,UV:o.uv,Color:o.colors,Edge:o.edges||[]})){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);res.buffers[key]=b;}
      if(o.group!=='person')res.tree=bvh(o.positions,Array.from({length:o.positions.length/9},(_,i)=>i));return res;
    }
    current(){return this.objects.filter(o=>this.visible[o.group]&&this.partVisible[o.id]);}
    getState(){return{ready:this._ready,visible:{...this.visible},partVisible:{...this.partVisible},palette:this.palette,labels:this.labels,wire:this.wire,person:this.person,view:this.view,visibleObjects:this._ready?this.current().map(o=>o.id):[],empty:this._ready&&!this.current().length&&!this.person};}
    emit(){if(this.options.onStateChange)this.options.onStateChange(this.getState());}
    change(){if(this._ready)this.render();this.emit();}
    setVisible(g,on){if(!GROUPS.includes(g))throw Error('Unknown group '+g);this.visible[g]=!!on;this.change();}
    setAllVisible(on){for(const g of GROUPS)this.visible[g]=!!on;if(on)for(const id of Object.keys(this.partVisible))this.partVisible[id]=true;this.change();}
    showOnly(g){if(!GROUPS.includes(g))throw Error('Unknown group '+g);for(const k of GROUPS)this.visible[k]=k===g;this.fit();this.emit();}
    setPartVisible(id,on){if(!Object.prototype.hasOwnProperty.call(this.partVisible,id))throw Error('Unknown part '+id);this.partVisible[id]=!!on;this.change();}
    setGroupParts(g,on){if(!GROUPS.includes(g))throw Error('Unknown group '+g);for(const o of this.data.objects)if(o.group===g)this.partVisible[o.id]=!!on;this.change();}
    setPalette(p){if(!['uv','actual'].includes(p))throw Error('Unknown palette');this.palette=p;this.change();}
    setLabels(on){this.labels=!!on;this.change();}
    setWire(on){this.wire=!!on;this.change();}
    setPerson(on){this.person=!!on;this.change();}
    setView(v){if(!VIEWS[v])return;this.view=v;this.direction=norm(VIEWS[v]);this.fit();this.emit();}
    basis(){const f=mul(this.direction,-1),right=norm(cross(f,[0,0,1]));return{right,up:norm(cross(right,f))};}
    fit(){if(!this._ready)return;const obs=[...this.current(),...(this.person?this.people:[])];if(!obs.length){this.render();return;}const pts=obs.flatMap(o=>corners(o.box)),bounds=box(pts.flat());this.target=mul(add(bounds.lo,bounds.hi),.5);const{right,up}=this.basis(),xs=pts.map(p=>dot(sub(p,this.target),right)),ys=pts.map(p=>dot(sub(p,this.target),up));const xmid=(Math.max(...xs)+Math.min(...xs))/2,ymid=(Math.max(...ys)+Math.min(...ys))/2;this.target=add(this.target,add(mul(right,xmid),mul(up,ymid)));this.fitExtent={h:(Math.max(...ys)-Math.min(...ys))/2,w:(Math.max(...xs)-Math.min(...xs))/2};this.fitBase=Math.max(this.fitExtent.h,this.fitExtent.w/(this.width/this.height),.06)*1.20;this.halfHeight=this.fitBase;this.render();}
    resize(){if(!this._ready)return;const r=this.host.getBoundingClientRect();const zoom=this.fitBase?this.halfHeight/this.fitBase:1;this.width=Math.max(r.width,1);this.height=Math.max(r.height,1);if(this.fitExtent){this.fitBase=Math.max(this.fitExtent.h,this.fitExtent.w/(this.width/this.height),.06)*1.20;this.halfHeight=this.fitBase*zoom;}const ratio=Math.min(devicePixelRatio||1,2);this.canvas.width=this.overlay.width=Math.round(this.width*ratio);this.canvas.height=this.overlay.height=Math.round(this.height*ratio);this.ratio=ratio;this.render();}
    matrix(){const{right,up}=this.basis(),hw=this.halfHeight*this.width/this.height,h=this.halfHeight,z=mul(this.direction,-1/12);return new Float32Array([right[0]/hw,up[0]/h,z[0],0,right[1]/hw,up[1]/h,z[1],0,right[2]/hw,up[2]/h,z[2],0,-dot(this.target,right)/hw,-dot(this.target,up)/h,-dot(this.target,z),1]);}
    project(p){const{right,up}=this.basis(),d=sub(p,this.target);return[(.5+dot(d,right)/(2*this.halfHeight*this.width/this.height))*this.width,(.5-dot(d,up)/(2*this.halfHeight))*this.height];}
    draw(o,person=false,edge=false){const gl=this.gl;for(const key of ['Position','Normal','UV','Color']){const loc=this.attrib[key];if(edge&&key!=='Position'){gl.disableVertexAttribArray(loc);if(key==='UV')gl.vertexAttrib2f(loc,0,0);else gl.vertexAttrib3f(loc,0,0,1);continue;}gl.bindBuffer(gl.ARRAY_BUFFER,o.buffers[edge?'Edge':key]);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,key==='UV'?2:3,gl.FLOAT,false,0,0);}
      gl.uniform1i(this.uniform.Actual,!person&&this.palette==='actual');gl.uniform1i(this.uniform.Line,edge);gl.uniform1i(this.uniform.Person,person);gl.uniform1f(this.uniform.Alpha,person?.55:1);gl.bindTexture(gl.TEXTURE_2D,this.textures[o.atlas]||this.fallback);gl.drawArrays(edge?gl.LINES:gl.TRIANGLES,0,edge?o.edgeCount:o.count);
    }
    render(){if(!this._ready||this.disposed)return;const gl=this.gl,obs=this.current();gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(1,1,1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.prog);gl.uniformMatrix4fv(this.uniform.Matrix,false,this.matrix());gl.activeTexture(gl.TEXTURE0);gl.uniform1i(this.uniform.Texture,0);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);if(this.wire){gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(1,1);}else gl.disable(gl.POLYGON_OFFSET_FILL);for(const o of obs)this.draw(o);gl.disable(gl.POLYGON_OFFSET_FILL);
      if(this.wire){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);for(const o of obs)this.draw(o,false,true);gl.depthMask(true);}
      if(this.person){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);gl.depthMask(false);for(const o of this.people)this.draw(o,true);gl.depthMask(true);}
      gl.disable(gl.BLEND);this.drawLabels(obs);this.status.hidden=!!(obs.length||this.person);this.status.textContent='표시할 파츠가 없습니다. 위에서 파츠를 켜 주세요.';this.host.dataset.visibleObjects=obs.map(o=>o.id).join(',');this.host.dataset.personState=this.person?'on':'off';this.host.dataset.palette=this.palette;this.host.dataset.wire=String(this.wire);
    }
    visiblePoint(p,obs){const o=add(p,mul(this.direction,10)),d=mul(this.direction,-1);return!obs.some(ob=>blocked(ob.tree,ob.positions,o,d,9.997));}
    drawLabels(obs){const ctx=this.overlay.getContext('2d');ctx.setTransform(this.ratio,0,0,this.ratio,0,0);ctx.clearRect(0,0,this.width,this.height);this.host.dataset.labelCount='0';if(!this.labels||this.moving)return;ctx.font='600 12px "Malgun Gothic",sans-serif';ctx.textBaseline='middle';const boxes=[];let candidates=obs.flatMap(o=>o.labels||[]);
      if(obs.some(o=>o.id==='BODY')&&this.direction[1]>.45&&this.data.seams){candidates=obs.flatMap(o=>(o.labels||[]).filter(x=>o.id!=='BODY'||!/^U/.test(x.id))).concat(this.data.seams.map(s=>({id:s.id,color:s.color,points:s.candidates||s.points})));}
      for(const label of candidates){let placed=false;for(const p of label.points||[]){if(!this.visiblePoint(p,obs))continue;const a=this.project(p);if(a[0]<8||a[1]<8||a[0]>this.width-8||a[1]>this.height-8)continue;const tw=ctx.measureText(label.id).width,w=tw+14,h=21;
          for(const[dx,dy]of[[0,0],[20,-18],[-20,-18],[22,18],[-22,18],[0,-35],[0,35]]){const x=Math.max(4,Math.min(this.width-w-4,a[0]-w/2+dx)),y=Math.max(4,Math.min(this.height-h-4,a[1]-h/2+dy));if(boxes.some(b=>x<b[0]+b[2]+3&&x+w+3>b[0]&&y<b[1]+b[3]+3&&y+h+3>b[1]))continue;ctx.strokeStyle=label.color||'#60796b';ctx.lineWidth=1.1;if(dx||dy){ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(x+w/2,y+h/2);ctx.stroke();}ctx.fillStyle='#fffffff0';ctx.fillRect(x,y,w,h);ctx.strokeRect(x,y,w,h);ctx.fillStyle='#243a35';ctx.fillText(label.id,x+7,y+h/2);boxes.push([x,y,w,h]);placed=true;break;}if(placed)break;}
      }this.host.dataset.labelCount=String(boxes.length);
    }
    bindInteraction(){let drag=null,timer;
      const stop=()=>{drag=null;this.moving=false;this.canvas.style.cursor='grab';this.host.dataset.navigation='idle';this.render();};
      this.canvas.addEventListener('contextmenu',e=>e.preventDefault());
      this.canvas.addEventListener('pointerdown',e=>{
        if(drag||![0,2].includes(e.button))return;
        e.preventDefault();clearTimeout(timer);
        drag={x:e.clientX,y:e.clientY,id:e.pointerId,mode:e.button===2?'pan':'orbit'};
        this.canvas.setPointerCapture(e.pointerId);this.canvas.style.cursor=drag.mode==='pan'?'move':'grabbing';this.host.dataset.navigation=drag.mode;
      });
      this.canvas.addEventListener('pointermove',e=>{
        if(!drag||e.pointerId!==drag.id)return;
        if(!(e.buttons&(drag.mode==='pan'?2:1))){stop();return;}
        const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;
        if(!dx&&!dy)return;
        if(drag.mode==='pan'){
          const{right,up}=this.basis(),units=2*this.halfHeight/this.height;
          this.target=add(this.target,add(mul(right,-dx*units),mul(up,dy*units)));
        }else{
          const yaw=Math.atan2(this.direction[1],this.direction[0])-dx*.009;
          const pitch=Math.max(-1.54,Math.min(1.54,Math.asin(this.direction[2])+dy*.009));
          this.direction=[Math.cos(pitch)*Math.cos(yaw),Math.cos(pitch)*Math.sin(yaw),Math.sin(pitch)];this.view='custom';
        }
        this.moving=true;this.render();this.emit();
      });
      this.canvas.addEventListener('pointerup',e=>{if(drag&&e.pointerId===drag.id)stop();});
      this.canvas.addEventListener('pointercancel',stop);this.canvas.addEventListener('lostpointercapture',stop);this.canvas.style.cursor='grab';
      this.canvas.addEventListener('wheel',e=>{e.preventDefault();this.halfHeight=Math.max(.035,Math.min(8,this.halfHeight*Math.exp(e.deltaY*.001)));this.moving=true;this.render();clearTimeout(timer);timer=setTimeout(()=>{this.moving=false;this.render();},120);},{passive:false});
      this.canvas.addEventListener('keydown',e=>{if(['+','=','-','0'].includes(e.key)){e.preventDefault();if(e.key==='0')this.fit();else{this.halfHeight*=e.key==='-'?1.15:1/1.15;this.render();}}});
      this.canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();this.host.dataset.ready='error';this.status.hidden=false;this.status.textContent='3D 표시가 중단되었습니다. 화면을 새로고침해 주세요.';});
    }
    exportPNG(){if(!this._ready)return null;this.moving=false;this.render();const c=document.createElement('canvas');c.width=this.canvas.width;c.height=this.canvas.height;const x=c.getContext('2d');x.drawImage(this.canvas,0,0);x.drawImage(this.overlay,0,0);return c.toDataURL('image/png');}
    destroy(){this.disposed=true;if(this.observer)this.observer.disconnect();this.host.replaceChildren();}
  }
  window.MorbolViewer=MorbolViewer;
})();
