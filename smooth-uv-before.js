/* Apply native-matching UV data before either existing controller initializes. */
(function(){
 'use strict';
 const data=window.MORBOL_SMOOTH_BASE_UV;if(!data)return;
 const NS='http://www.w3.org/2000/svg';
 const node=(name,attrs={})=>{const n=document.createElementNS(NS,name);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;};
 const linesFor=p=>p.pieces.flatMap(piece=>piece.seams.map(s=>({...s,piece:piece.id})));
 if(window.MORBOL_SHELL_UV){
  for(const replacement of data.parts.filter(p=>p.versions.includes(2))){
   const b=window.MORBOL_SHELL_UV.bundles.find(b=>b.id===replacement.id);if(!b)continue;
   const oldPieces=new Map(b.pieces.map(p=>[p.id,p]));
   b.pieces=replacement.pieces.map(p=>{const old=oldPieces.get(p.id)||{};return {...old,id:p.id,label:old.label||p.id,name:old.name||p.name,color:p.color,path:p.path,wire:p.wire,outline:p.outline,bounds:p.bounds,label_point:p.label_point,faces:p.face_count};});
   b.bounds=[Math.min(...b.pieces.map(p=>p.bounds[0])),Math.min(...b.pieces.map(p=>p.bounds[1])),Math.max(...b.pieces.map(p=>p.bounds[2])),Math.max(...b.pieces.map(p=>p.bounds[3]))];
   b.face_count=replacement.face_count;b.seams=linesFor(replacement);b.smooth_revision='v31';
  }
 }
 const template=document.getElementById('body-svg-template'),body=data.parts.find(p=>p.id==='BODY'&&p.versions.includes(1));
 if(template&&body){
  const svg=template.content.querySelector('svg'),jaw=[...svg.querySelectorAll('.uv-face')].filter(p=>['U10','U11'].includes(p.dataset.part)).map(p=>p.cloneNode(true));
  svg.replaceChildren(node('rect',{width:4096,height:4096,fill:'white'}));
  for(const piece of body.pieces){
   for(const pts of piece.polygons){const p=node('polygon',{class:'uv-face',points:pts.map(p=>p.join(',')).join(' '),fill:piece.color,stroke:'#6b7775','stroke-width':2});p.dataset.part=piece.id;svg.append(p);}
   svg.append(node('path',{d:piece.outline,fill:'none',stroke:'#24333e','stroke-width':7,'stroke-linejoin':'round'}));
  }
  svg.append(...jaw);
  function label(text,xy,color,size=48){const t=node('text',{x:xy[0],y:xy[1],'dominant-baseline':'central','text-anchor':'middle','font-family':'Malgun Gothic,Arial,sans-serif','font-size':size,'font-weight':700,fill:color,stroke:'white','stroke-width':10,'paint-order':'stroke'});t.textContent=text;return t;}
  for(const piece of body.pieces)svg.append(label(piece.id,piece.label_point,'#24333e'));
  for(const id of ['U10','U11']){const ps=jaw.filter(p=>p.dataset.part===id).flatMap(p=>p.getAttribute('points').trim().split(/\s+/).map(x=>x.split(',').map(Number)));svg.append(label(id,[ps.reduce((n,p)=>n+p[0],0)/ps.length,ps.reduce((n,p)=>n+p[1],0)/ps.length],'#24333e'));}
  const grouped=new Map();for(const line of linesFor(body)){if(!grouped.has(line.id))grouped.set(line.id,[]);grouped.get(line.id).push(line);}
  const labels=[],seams=[];
  for(const [id,lines]of grouped){
   const labelled=new Set();
   for(const line of lines){
    const pts=line.points;if(pts.length<2)continue;
    const g=node('g',{class:'seam','data-seam':id,tabindex:0,role:'button','aria-label':id+' '+line.piece}),str=pts.map(p=>p.join(',')).join(' ');
    g.append(node('polyline',{points:str,fill:'none',stroke:'#24333e','stroke-width':18,'stroke-linejoin':'round'}));
    g.append(node('polyline',{class:'seam-line',points:str,fill:'none',stroke:line.color,'stroke-width':11,'stroke-linejoin':'round'}));
    if(!labelled.has(line.piece)){labelled.add(line.piece);const anchor=pts[Math.floor(pts.length/2)];g.append(node('circle',{cx:pts[0][0],cy:pts[0][1],r:10,fill:'white',stroke:line.color,'stroke-width':4}));g.append(label(id,[anchor[0],anchor[1]-38],line.color,42));labels.push({id,part:line.piece,anchor});}
    svg.append(g);
   }
   seams.push({id,parts:[...new Set(lines.map(s=>s.piece))],kind:id.startsWith('D')?'root-attachment':'body',target:id.startsWith('D')?'ROOT 탈부착 위치':undefined});
  }
  window.MORBOL_SEWING_BODY_METADATA={seams,labels};
  template.dataset.smoothRevision='v31';
 }
 window.MORBOL_SMOOTH_UV_APPLIED=true;
})();