"""Build an isolated v24 review revision; never overwrite or push main."""
import pathlib,subprocess,sys,json,traceback
R=pathlib.Path(__file__).resolve().parents[1];F=R/'repair-output/final';F.mkdir(parents=True,exist_ok=True)
steps=['repair-envelope.py','repair-partition.py','repair-validate.py','repair-native.py'];state={'completed':[],'baseline':'894874e81657178910a523b292144a1423297d66','native_compatibility':'Refresh BMesh element references after CustomData layer allocation.'}
try:
 for name in steps:
  target=R/'tools'/name
  if name=='repair-native.py':
   code=target.read_text();needle=' for i,f in enumerate(nativefaces):f[oldlayer]=i;f[added]=0;f[ridx]=-1'
   assert code.count(needle)==1
   code=code.replace(needle,' bm.verts.ensure_lookup_table();bm.faces.ensure_lookup_table();base=list(bm.verts);nativefaces=list(bm.faces)\n'+needle)
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
