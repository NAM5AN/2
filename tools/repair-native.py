"""Native v24 export. Original .blend and unrelated meshes are never overwritten."""
import bpy,bmesh,json,pathlib,hashlib,math,numpy as np
from mathutils import Vector
from collections import defaultdict
R=pathlib.Path(__file__).resolve().parents[1];F=R/'repair-output/final';data=json.loads((F/'contact-repair-data.json').read_text());source=R/'morbol-v23-softened-lips-uv.blend'
assert hashlib.sha256(source.read_bytes()).hexdigest()==data['source_sha256']
bpy.ops.wm.open_mainfile(filepath=str(source));bpy.context.scene.frame_set(40)
layouts={p['id']:p for p in json.loads((R/'tentacle-uv-layout.json').read_text())['parts']+json.loads((R/'supplemental-layout.json').read_text())['parts']}
model=json.loads((R/'morbol-model.js').read_text().split('=',1)[1].rstrip(';\n '));models={o['id']:o for o in model['objects']};targets={p['object'] for p in data['parts'].values()}
def fingerprint(o):
 m=o.data;return hashlib.sha256(repr(([(tuple(v.co)) for v in m.vertices],[tuple(p.vertices) for p in m.polygons])).encode()).hexdigest()
unchanged={o.name:fingerprint(o) for o in bpy.data.objects if o.type=='MESH' and o.name not in targets};report={'source_sha256':data['source_sha256'],'parts':{},'new_uv_status':'Inspection-only separate UV layer; no seam allowance or production pattern approval.'};sidecar={}
for id,patch in data['parts'].items():
 o=bpy.data.objects[patch['object']];m=o.data;p=layouts[id];nv=patch['original_vertices'];assert len(m.vertices)==nv and len(m.polygons)==patch['original_faces']
 oldcoords=[v.co.copy() for v in m.vertices];oldworld=[tuple(o.matrix_world@v.co) for v in m.vertices]
 assert np.max(np.abs(np.array(oldworld)-np.array(p['vertices_world'])))<2e-6,(id,'source mismatch')
 original_uv={}
 for layer in m.uv_layers:
  original_uv[layer.name]=[{m.loops[li].vertex_index:tuple(layer.data[li].uv) for li in poly.loop_indices} for poly in m.polygons]
 m.calc_loop_triangles();triangles=defaultdict(list)
 for t in m.loop_triangles:triangles[t.polygon_index].append(tuple(t.vertices))
 bm=bmesh.new();bm.from_mesh(m);bm.verts.ensure_lookup_table();bm.faces.ensure_lookup_table();base=list(bm.verts);nativefaces=list(bm.faces)
 oldlayer=bm.faces.layers.int.get('RepairOriginalFace') or bm.faces.layers.int.new('RepairOriginalFace');added=bm.faces.layers.int.get('RepairAdded') or bm.faces.layers.int.new('RepairAdded');ridx=bm.faces.layers.int.get('RepairIndex') or bm.faces.layers.int.new('RepairIndex');pairlayer=bm.faces.layers.int.get('RepairPair') or bm.faces.layers.int.new('RepairPair')
 for i,f in enumerate(nativefaces):f[oldlayer]=i;f[added]=0;f[ridx]=-1
 # Freeze the original native triangulation before adding collinear edge points.
 # This keeps every original exterior triangle plane, even on non-planar ngons.
 for i,f in enumerate(nativefaces):
  if len(f.verts)<=3:continue
  loops={l.vert:l for l in f.loops}
  for tri in triangles[i]:
   nf=bm.faces.new([base[j] for j in tri]);nf.copy_from(f);nf[oldlayer]=i;nf[added]=0;nf[ridx]=-1
   for l in nf.loops:l.copy_from(loops[l.vert])
  bm.faces.remove(f)
 vm={i:v for i,v in enumerate(base)};inv=o.matrix_world.inverted()
 for split in patch['edge_splits']:
  a,b=split['edge'];e=bm.edges.get((base[a],base[b]));assert e is not None,(id,split)
  _,v=bmesh.utils.edge_split(e,base[a],split['factor']);v.co=inv@Vector(patch['new_vertices'][split['vertex']-nv]);vm[split['vertex']]=v
 for j,co in enumerate(patch['new_vertices'],nv):
  if j not in vm:vm[j]=bm.verts.new(inv@Vector(co))
 mat=bpy.data.materials.get('V24_Independent_Contact_Lining') or bpy.data.materials.new('V24_Independent_Contact_Lining');mat.diffuse_color=(.72,.67,.56,1)
 if patch['new_faces']:
  m.materials.append(mat);matidx=len(m.materials)-1
  groups={}
  for gi,g in enumerate(patch['groups'],1):
   for k in range(g['start'],g['start']+g['count']):groups[k]=gi
  for i,t in enumerate(patch['new_faces']):
   f=bm.faces.new([vm[v] for v in t]);f[oldlayer]=-1;f[added]=1;f[ridx]=i;f[pairlayer]=groups[i];f.material_index=matidx;f.smooth=False
  for e in bm.edges:
   if len(e.link_faces)==2:
    a,b=e.link_faces
    if a[added]!=b[added] or (a[added] and a[pairlayer]!=b[pairlayer]):e.seam=True
 bm.normal_update();bm.to_mesh(m);bm.free();m.update()
 assert all((m.vertices[i].co-oldcoords[i]).length<1e-9 for i in range(nv)),id+' original vertices changed'
 # Verify all pre-existing UV corners, not just the active UV layer.
 for layer in m.uv_layers:
  reference=original_uv[layer.name]
  for poly in m.polygons:
   old=m.attributes['RepairOriginalFace'].data[poly.index].value
   if old<0:continue
   for li in poly.loop_indices:
    vi=m.loops[li].vertex_index
    if vi in reference[old]:assert (layer.data[li].uv-Vector(reference[old][vi])).length<2e-7,(id,layer.name,old,vi)
 active=m.uv_layers.active.name if m.uv_layers.active else None
 if patch['new_faces']:
  uv=m.uv_layers.get('V24_Contact_Inspection_UV') or m.uv_layers.new(name='V24_Contact_Inspection_UV');m.uv_layers.active=uv
  bpy.ops.object.select_all(action='DESELECT');o.hide_set(False);o.hide_viewport=False;o.select_set(True);bpy.context.view_layer.objects.active=o
  bpy.ops.object.mode_set(mode='EDIT');bpy.ops.mesh.select_all(action='DESELECT');edit=bmesh.from_edit_mesh(m);al=edit.faces.layers.int['RepairAdded']
  for f in edit.faces:
   if f[al]:f.select_set(True)
  bmesh.update_edit_mesh(m)
  bpy.ops.uv.smart_project(angle_limit=math.radians(66),island_margin=.02,correct_aspect=False)
  bpy.ops.object.mode_set(mode='OBJECT')
  if active:m.uv_layers.active=m.uv_layers[active]
 bm=bmesh.new();bm.from_mesh(m);boundary=sum(e.is_boundary for e in bm.edges);nonmanifold=sum(len(e.link_faces)>2 for e in bm.edges);badverts=sum(not v.is_manifold for v in bm.verts if v.link_faces);bm.free()
 assert nonmanifold==0,(id,'native nonmanifold')
 if id not in ('J01','L01'):assert boundary==0,(id,'native shell open')
 o['v24_contact_repair']='Separate paired contact surfaces; wearer opening protected.'
 report['parts'][id]={'native_vertices':len(m.vertices),'native_polygons':len(m.polygons),'added_contact_triangles':len(patch['new_faces']),'inserted_boundary_midpoints':len(patch['edge_splits']),'boundary_edges':boundary,'nonmanifold_edges':nonmanifold,'nonmanifold_vertices_including_open_boundaries':badverts,'original_vertices_unchanged':True,'original_uv_corners_unchanged':True}
 m.calc_loop_triangles();obj=dict(models[id]);obj.update(positions=[],normals=[],uv=[],colors=[],edges=[]);normalmat=o.matrix_world.to_3x3().inverted().transposed();oldUV=m.uv_layers.get(p.get('uv_layer','')) or m.uv_layers.active;newUV=m.uv_layers.get('V24_Contact_Inspection_UV');ordered=sorted(m.loop_triangles,key=lambda t:bool(m.attributes['RepairAdded'].data[t.polygon_index].value));newfaces=[]
 for tri in ordered:
  poly=tri.polygon_index;isnew=bool(m.attributes['RepairAdded'].data[poly].value);old=m.attributes['RepairOriginalFace'].data[poly].value
  if isnew and 'closureStart' not in obj:obj['closureStart']=len(obj['positions'])//3
  color='#E6AC49' if isnew else p.get('panel_colors',{}).get(p['faces'][old].get('piece'),p.get('color','#708C66'));rgb=[int(color[i:i+2],16)/255 for i in (1,3,5)];n=(normalmat@tri.normal).normalized();layer=newUV if isnew else oldUV
  wp=[];up=[]
  for vi,li in zip(tri.vertices,tri.loops):
   co=o.matrix_world@m.vertices[vi].co;uv=layer.data[li].uv if layer else Vector((0,0));obj['positions'].extend(round(float(x),9) for x in co);obj['normals'].extend(round(float(x),8) for x in n);obj['uv'].extend(round(float(x),8) for x in uv);obj['colors'].extend(rgb);wp.append(list(co));up.append(list(uv))
  if isnew:newfaces.append({'vertices':list(tri.vertices),'world':wp,'uv':up,'pair':m.attributes['RepairPair'].data[poly].value})
 for e in m.edges:
  for vi in e.vertices:obj['edges'].extend(round(float(x),9) for x in (o.matrix_world@m.vertices[vi].co))
 obj['repair_revision']='v24-independent-shells';sidecar[id]={'object':o.name,'vertices_world':[list(o.matrix_world@v.co) for v in m.vertices],'faces':[list(f.vertices) for f in m.polygons],'new_faces':newfaces,'groups':patch['groups'],'uv_status':'inspection-only; separate contact layer'};models[id]=obj
 print('NATIVE',id,report['parts'][id],flush=True)
assert all(fingerprint(bpy.data.objects[name])==digest for name,digest in unchanged.items()),'unrelated geometry changed'
report['unrelated_meshes_unchanged']=len(unchanged);l=bpy.data.objects[layouts['L01']['object']]
assert all((l.matrix_world@l.data.vertices[i].co-Vector(layouts['L01']['vertices_world'][i])).length<1e-9 for i in layouts['L01']['inner_loop'])
report['Z01_upper_opening_unchanged']=True
for image in bpy.data.images:
 if image.source=='FILE' and not image.packed_file:
  candidate=R/pathlib.Path(image.filepath.replace('\\','/')).name
  if candidate.exists():image.filepath=str(candidate);image.pack()
path=F/'morbol-v24-independent-shells.blend';bpy.ops.wm.save_as_mainfile(filepath=str(path));sha=hashlib.sha256(path.read_bytes()).hexdigest();report['repaired_native_sha256']=sha
model['objects']=[models[o['id']] for o in model['objects']];model['baseline_source_sha256']=model['source_sha256'];model['source_sha256']=sha;model['version']=24;model['repair_revision']='v24-independent-shells'
(F/'morbol-model.js').write_text('window.MORBOL_MODEL='+json.dumps(model,ensure_ascii=False,separators=(',',':'))+';')
(F/'native-repair-validation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));(F/'contact-repair-native-mesh.json').write_text(json.dumps(sidecar,ensure_ascii=False,separators=(',',':')))
print('SAVED',path,sha,flush=True)
