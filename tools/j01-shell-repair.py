"""Build an isolated v24 review revision; never overwrite or push main."""
import pathlib,subprocess,sys,json,traceback,hashlib
R=pathlib.Path(__file__).resolve().parents[1];F=R/'repair-output/final';F.mkdir(parents=True,exist_ok=True)
steps=['repair-envelope.py','repair-partition.py','repair-validate.py','repair-native.py'];state={'completed':[],'baseline':'894874e81657178910a523b292144a1423297d66'}
try:
 for name in steps:
  print('START',name,flush=True)
  with (F/(name+'.log')).open('w') as log:
   p=subprocess.run([sys.executable,str(R/'tools'/name)],cwd=R,stdout=log,stderr=subprocess.STDOUT)
  print((F/(name+'.log')).read_text(),flush=True)
  if p.returncode:raise RuntimeError(name+' failed: '+str(p.returncode))
  state['completed'].append(name)
 state['status']='completed'
except Exception as e:
 state['status']='failed';state['error']=str(e);state['traceback']=traceback.format_exc();raise
finally:
 (F/'build-status.json').write_text(json.dumps(state,ensure_ascii=False,indent=2))
