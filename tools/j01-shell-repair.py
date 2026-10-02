"""Prepare geometry tooling in the isolated repair branch; do not alter the model."""
import pathlib, subprocess, shutil, glob, json
out=pathlib.Path('repair-output/geometry-runtime');out.mkdir(parents=True,exist_ok=True)
result={}
cmd=['python','-m','pip','download','--only-binary=:all:','--no-deps','--python-version','313','--abi','cp313','--platform','manylinux_2_17_x86_64','--dest',str(out),'tetgenpy']
r=subprocess.run(cmd,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT);print(r.stdout,flush=True);result['wheel_download_returncode']=r.returncode
r=subprocess.run(['sudo','apt-get','install','-y','tetgen'],text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT);print(r.stdout,flush=True);result['tetgen_install_returncode']=r.returncode
exe=shutil.which('tetgen')
if exe:
    shutil.copy2(exe,out/'tetgen')
    for p in glob.glob('/usr/lib/x86_64-linux-gnu/libtet*'):
        if pathlib.Path(p).is_file():shutil.copy2(p,out/pathlib.Path(p).name)
    result['ldd']=subprocess.run(['ldd',exe],text=True,stdout=subprocess.PIPE).stdout
(out/'runtime-report.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result),flush=True)
