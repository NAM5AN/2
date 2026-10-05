(function () {
  'use strict';
  const base=window.MORBOL_MODEL, repair=window.MORBOL_EXTERIOR_REPAIR;
  window.MORBOL_MODEL=null;window.MORBOL_REPAIR_READY=false;
  if(!base||!repair)throw Error('외피 연결부 자료를 불러오지 못했습니다.');
  const variant=base.variant==='exterior-shell'?'shell':'complete';
  const spec=repair.variants[variant];
  if(!spec||spec.base_sha256!==base.source_sha256)throw Error('외피 연결부와 기준 모델이 일치하지 않습니다.');
  const parents=new Map(base.objects.filter(o=>!o.helper).map(o=>[o.id,o]));
  const seen=new Set(base.objects.map(o=>o.id));
  const additions=(spec.objects||repair.objects).map(o=>{
    const parent=parents.get(o.selection_id);
    if(!parent||seen.has(o.id))throw Error('외피 연결부 파츠가 일치하지 않습니다: '+o.id);
    seen.add(o.id);
    const n=o.positions.length;
    if(!n||n%9||o.normals.length!==n||o.colors.length!==n||o.uv.length!==n*2/3||o.edges.length%6||
      ['positions','normals','colors','uv','edges'].some(k=>o[k].some(x=>!Number.isFinite(x))))
      throw Error('외피 연결부 면 정보가 올바르지 않습니다: '+o.id);
    return {...o,group:parent.group,helper:true,labels:o.labels||[]};
  });
  window.MORBOL_MODEL={...base,version:28,variant:variant==='shell'?'exterior-shell':'complete',
    base_source_sha256:base.source_sha256,source_sha256:spec.native_sha256,
    objects:[...base.objects,...additions],exterior_repair:true,
    limitations:[...(base.limitations||[]).filter(s=>s!=='외피 버전은 내부 마감면을 제외한 열린 표면입니다.'),'외피 연결부 수리 적용. 내부 마감판 포함 여부는 버전에 따라 다릅니다.']};
  if(repair.textures)Object.assign(window.MORBOL_TEXTURES,repair.textures);
  if(spec.textures)Object.assign(window.MORBOL_TEXTURES,spec.textures);
  window.MORBOL_REPAIR_READY=true;
})();
