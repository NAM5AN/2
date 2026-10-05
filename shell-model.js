(function(){
 'use strict';
 const base=window.MORBOL_BASE_MODEL, mask=window.MORBOL_SHELL_MASK;
 window.MORBOL_SHELL_READY=false;
 window.MORBOL_MODEL=null;
 if(!base||!mask||mask.source_sha256!==base.source_sha256)throw Error('외피 모델의 기준 파일이 일치하지 않습니다.');
 const sources=new Map(base.objects.map(p=>[p.id,p]));
 const pointKey=p=>p.map(n=>Math.round(n*1e7)).join(',');
 const edgeKey=(a,b)=>{const x=pointKey(a),y=pointKey(b);return x<y?x+'|'+y:y+'|'+x;};
 function exterior(spec){
  const original=sources.get(spec.source_id),parent=sources.get(spec.selection_id||spec.id);
  if(!original||!parent)throw Error('외피 파츠의 원본이 없습니다: '+spec.id);
  const total=original.positions.length/9,indices=spec.kept_source_triangles;
  if(!Array.isArray(indices)||!indices.length||new Set(indices).size!==indices.length||indices.some(t=>!Number.isInteger(t)||t<0||t>=total))throw Error('외피 면 선택이 잘못되었습니다: '+spec.id);
  const result={...original,id:spec.id,name:parent.name,selection_id:spec.selection_id||spec.id,
   helper:spec.id!==(spec.selection_id||spec.id),group:parent.group,atlas:spec.atlas||original.atlas,object:spec.target_object||original.object,
   positions:[],normals:[],colors:[],uv:[],edges:[]};
  for(const t of indices){for(const key of ['positions','normals','colors'])result[key].push(...original[key].slice(t*9,t*9+9));result.uv.push(...original.uv.slice(t*6,t*6+6));}
  const edges=new Set();
  for(let i=0;i<result.positions.length;i+=9){const p=[0,3,6].map(k=>result.positions.slice(i+k,i+k+3));for(let k=0;k<3;k++)edges.add(edgeKey(p[k],p[(k+1)%3]));}
  for(let i=0;i<original.edges.length;i+=6){const pair=original.edges.slice(i,i+6);if(edges.has(edgeKey(pair.slice(0,3),pair.slice(3))))result.edges.push(...pair);}
  if(result.helper)result.labels=[];
  else if(indices.length!==total){
   const points=[],stride=Math.max(1,Math.floor(indices.length/40));
   for(let i=0;i<indices.length;i+=stride){const t=i*9;points.push([0,1,2].map(k=>(result.positions[t+k]+result.positions[t+3+k]+result.positions[t+6+k])/3));}
   result.labels=[{id:result.selection_id,color:original.labels?.[0]?.color||'#527766',points}];
  }
  return result;
 }
 const objects=mask.objects.map(exterior);
 const ids=new Set(objects.filter(o=>!o.helper).map(o=>o.id));
 if(ids.has('B01')||ids.has('L01')||objects.some(o=>!ids.has(o.selection_id)))throw Error('외피 파츠 묶음이 일치하지 않습니다.');
 window.MORBOL_MODEL={...base,variant:'exterior-shell',source_sha256:mask.native_sha256||mask.candidate_sha256,
  base_source_sha256:base.source_sha256,objects,limitations:[...(base.limitations||[]),'외피 버전은 내부 마감면을 제외한 열린 표면입니다.']};
 window.MORBOL_SHELL_READY=true;
})();
