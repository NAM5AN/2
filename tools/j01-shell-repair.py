"""Build an isolated v24 review revision; never overwrite or push main."""
import pathlib,subprocess,sys,json,traceback
R=pathlib.Path(__file__).resolve().parents[1];F=R/'repair-output/final';F.mkdir(parents=True,exist_ok=True)
steps=['repair-envelope.py','repair-partition.py','repair-local-remesh.py','repair-validate.py','repair-native.py']
state={'completed':[],'baseline':'894874e81657178910a523b292144a1423297d66','native_compatibility':'Fresh CustomData handles and explicit UV copying, without BMFace.copy_from.'}
try:
 for name in steps:
  target=R/'tools'/name
  if name=='repair-native.py':
   code=target.read_text()
   needle=' for i,f in enumerate(nativefaces):f[oldlayer]=i;f[added]=0;f[ridx]=-1'
   assert code.count(needle)==1
   code=code.replace(needle," bm.verts.ensure_lookup_table();bm.faces.ensure_lookup_table();base=list(bm.verts);nativefaces=list(bm.faces)\n oldlayer=bm.faces.layers.int['RepairOriginalFace'];added=bm.faces.layers.int['RepairAdded'];ridx=bm.faces.layers.int['RepairIndex'];pairlayer=bm.faces.layers.int['RepairPair']\n"+needle)
   start=code.index('  loops={l.vert:l for l in f.loops}')
   end=code.index('  bm.faces.remove(f)',start)+len('  bm.faces.remove(f)')
   replacement="""  material_index=f.material_index;smooth=f.smooth
  oldvalues={name:f[bm.faces.layers.int[name]] for name in bm.faces.layers.int.keys()}
  uvvalues={name:{l.vert:(tuple(l[bm.loops.layers.uv[name]].uv),l[bm.loops.layers.uv[name]].pin_uv) for l in f.loops} for name in bm.loops.layers.uv.keys()}
  for tri in triangles[i]:
   nf=bm.faces.new([base[j] for j in tri]);nf.material_index=material_index;nf.smooth=smooth
   for name,value in oldvalues.items():nf[bm.faces.layers.int[name]]=value
   nf[bm.faces.layers.int['RepairOriginalFace']]=i;nf[bm.faces.layers.int['RepairAdded']]=0;nf[bm.faces.layers.int['RepairIndex']]=-1
   for l in nf.loops:
    for name,values in uvvalues.items():
     value,pin=values[l.vert];l[bm.loops.layers.uv[name]].uv=value;l[bm.loops.layers.uv[name]].pin_uv=pin
  bm.faces.remove(f)"""
   code=code[:start]+replacement+code[end:]
   target=R/'tools/repair-native-runtime.py';target.write_text(code)
  print('START',name,flush=True)
  with (F/(name+'.log')).open('w') as log:p=subprocess.run([sys.executable,str(target)],cwd=R,stdout=log,stderr=subprocess.STDOUT)
  print((F/(name+'.log')).read_text(),flush=True)
  if p.returncode:raise RuntimeError(name+' failed: '+str(p.returncode))
  state['completed'].append(name)
 state['status']='completed'
except Exception as e:
 state['status']='failed';state['error']=str(e);state['traceback']=traceback.format_exc();raise
finally:
 (F/'build-status.json').write_text(json.dumps(state,ensure_ascii=False,indent=2))
