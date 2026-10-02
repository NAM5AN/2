import numpy as np,json,pathlib
from scipy.spatial import cKDTree
from collections import Counter,defaultdict
R=pathlib.Path(__file__).resolve().parents[1];P=R;O=R/'repair-output';F=O/'final';F.mkdir(parents=True,exist_ok=True)
D=np.load(O/'tetra/partition.npz');S=np.load(O/'tetra/native-source.npz');CV=D['vertices'];ids=S['ids'].tolist()
M=json.loads((P/'morbol-model.js').read_text().split('=',1)[1].rstrip(';\n '));pa=json.loads((P/'tentacle-uv-layout.json').read_text())['parts']+json.loads((P/'supplemental-layout.json').read_text())['parts'];parts={p['id']:p for p in pa};origpoly={id:[p['vertices'] for p in parts[id]['faces']] for id in ids}
def stat(v,f):
 ec=Counter(tuple(sorted((int(a),int(b)))) for t in f for a,b in zip(t,np.roll(t,-1)));dc=Counter((int(a),int(b)) for t in f for a,b in zip(t,np.roll(t,-1)));boundary=[e for e,n in ec.items() if n==1];ad=defaultdict(set)
 for a,b in boundary:ad[a].add(b);ad[b].add(a)
 seen=set();comps=[]
 for a in ad:
  if a in seen:continue
  q=[a];seen.add(a);cc=[]
  while q:
   a=q.pop();cc.append(a)
   for b in ad[a]:
    if b not in seen:seen.add(b);q.append(b)
  comps.append(cc)
 used={i for t in f for i in t}
 return {'vertices':len(used),'faces':len(f),'boundary_edges':len(boundary),'boundary_loops':[len(c) for c in comps],'nonmanifold':sum(n>2 for n in ec.values()),'winding_conflicts':sum(n==2 and (dc[e]!=1 or dc[e[::-1]]!=1) for e,n in ec.items()),'euler':len(used)-len(ec)+len(f),'boundary_vertices':[v[i].tolist() for c in comps for i in c]}
def orient(f,n_original):
 ef=defaultdict(list)
 for fi,t in enumerate(f):
  for a,b in zip(t,np.roll(t,-1)):ef[tuple(sorted((a,b)))].append((fi,a<b))
 adj=defaultdict(list)
 for fs in ef.values():
  if len(fs)==2:
   (a,da),(b,db)=fs;adj[a].append((b,da==db));adj[b].append((a,da==db))
 flags=np.full(len(f),-1,int);flags[:n_original]=0;todo=list(range(n_original))
 for seed in [-1]+list(range(n_original,len(f))):
  if seed>=0:
   if flags[seed]>=0:continue
   flags[seed]=0;todo=[seed]
  while todo:
   a=todo.pop()
   for b,op in adj[a]:
    val=int(flags[a])^int(op)
    if flags[b]<0:flags[b]=val;todo.append(b)
    else:assert flags[b]==val,'non-orientable contact sheet'
 return [t[::-1] if flag else t for t,flag in zip(f,flags)],int(sum(flags==1))
parent=list(range(len(CV)))
def root(i):
 while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
 return i
for a,b in cKDTree(CV).query_pairs(2e-9):parent[root(b)]=root(a)
remap=np.array([root(i) for i in range(len(CV))]);uvs=np.unique(remap);reidx=np.full(len(CV),-1,int);reidx[uvs]=np.arange(len(uvs));remap=reidx[remap];CV=CV[uvs];ctree=cKDTree(CV);pairs={}
for key in D.files:
 if key=='vertices':continue
 _,a,b=key.split('_');fs=remap[D[key]];fs=np.array([t for t in fs if len(set(t))==3]);_,idx=np.unique(np.sort(fs,axis=1),axis=0,return_index=True);pairs[int(a),int(b)]=fs[np.sort(idx)]
out={'revision':'v24-independent-shells','source_sha256':M['source_sha256'],'vertices':CV.tolist(),'pairs':{},'parts':{},'validation':{}}
for (a,b),f in pairs.items():out['pairs'][ids[a]+'__'+ids[b]]=f.tolist()
actual={}
for label,id in enumerate(ids):
 p=parts[id];v=np.array(p['vertices_world']);ds,ii=cKDTree(v).query(CV);newv=[];mp=[]
 for j,(d,i) in enumerate(zip(ds,ii)):
  if d<6e-7:mp.append(int(i))
  else:mp.append(len(v)+len(newv));newv.append(CV[j])
 f=[];groups=[]
 for (a,b),t in pairs.items():
  if label not in (a,b):continue
  t=t if label==a else t[:,::-1];groups.append({'pair':[ids[a],ids[b]],'start':len(f),'count':len(t)});f.extend(np.array(mp)[t].tolist())
 V=np.r_[v,np.array(newv)];assert all(len(set(t))==3 for t in f)
 ec=Counter(tuple(sorted(e)) for t in origpoly[id] for e in zip(t,np.roll(t,-1)));splits=[];edgemap={};capused={x for t in f for x in t}
 for edge,n in ec.items():
  if n!=1:continue
  midpoint=v[list(edge)].mean(0);dist,ci=ctree.query(midpoint);vi=mp[ci]
  if dist<3e-7 and vi not in edge and (id=='L01' or vi in capused):
   splits.append({'edge':list(map(int,edge)),'vertex':int(vi),'factor':.5});edgemap[edge]=vi
 old=[]
 for t in origpoly[id]:
  nt=[]
  for a,b in zip(t,np.roll(t,-1)):
   nt.append(int(a));key=tuple(sorted((a,b)))
   if key in edgemap:nt.append(edgemap[key])
  old.append(nt)
 used=np.unique([x for t in f+old for x in t]);newused=used[used>=len(v)];rr=np.arange(len(V));rr[newused]=np.arange(len(newused))+len(v);f=[rr[t].tolist() for t in f];old=[rr[t].tolist() for t in old];V=np.r_[v,V[newused]]
 for s in splits:s['vertex']=int(rr[s['vertex']])
 full,flips=orient(old+f,len(old));f=full[len(old):];st=stat(V,full);st['corrected_face_windings']=flips;out['validation'][id]=st
 out['parts'][id]={'object':p['object'],'original_vertices':len(v),'original_faces':len(p['faces']),'new_vertices':V[len(v):].tolist(),'new_faces':f,'edge_splits':splits,'groups':groups};actual[id]=(V,full)
 print(id,{k:v for k,v in st.items() if k!='boundary_vertices'},flush=True)
Jv,Jf=actual['J01'];Lv,Lf=actual['L01'];ds,ii=cKDTree(Jv).query(Lv);vm=[];new=[]
for x,d,i in zip(Lv,ds,ii):
 if d<6e-7:vm.append(int(i))
 else:vm.append(len(Jv)+len(new));new.append(x)
v=np.r_[Jv,np.array(new)];f=Jf+[[vm[i] for i in t] for t in Lf];f=[list(dict.fromkeys(t)) for t in f];f=[t for t in f if len(t)>=3];st=stat(v,f);out['validation']['J01+L01']=st
for id in ids[:7]:
 q=out['validation'][id];assert q['nonmanifold']==q['winding_conflicts']==0,(id,q)
 if id!='J01':assert q['boundary_edges']==0,(id,'open shell')
assert st['boundary_loops']==[86] and st['nonmanifold']==st['winding_conflicts']==0,'Z01 must remain the only assembled opening'
z=np.array(parts['L01']['vertices_world'])[parts['L01']['inner_loop']];assert cKDTree(z).query(np.array(st['boundary_vertices']))[0].max()<1e-8
out['validation']['Z01_original_86_vertices_unchanged']=True
(F/'contact-repair-data.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':')))
(F/'geometry-validation.json').write_text(json.dumps(out['validation'],ensure_ascii=False,indent=2))
print('GEOMETRY VALIDATION PASSED',flush=True)
