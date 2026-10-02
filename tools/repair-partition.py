"""Source-conforming interfaces; no shared mesh object and no delivered Z01 lid."""
import pathlib,numpy as np,itertools
from collections import defaultdict
from scipy.sparse import coo_matrix
from scipy.sparse.linalg import spsolve
R=pathlib.Path(__file__).resolve().parents[1];O=R/'repair-output/tetra';D=np.load(O/'tet.npz');S=np.load(O/'source.npz');N=np.load(O/'native-source.npz');V=D['vertices'];T=D['tetrahedra']
Slabel=np.minimum(S['labels'],6).copy();Slabel[S['labels']==7]=0
origf={tuple(sorted(f)):l for f,l in zip(S['triangles'],Slabel)};faces={};tetfaces=[]
for t in T:
 fs=[]
 for comb in [(1,2,3),(0,3,2),(0,1,3),(0,2,1)]:
  f=tuple(sorted(t[list(comb)]));fs.append(faces.setdefault(f,len(faces)))
 tetfaces.append(fs)
Fs=np.array(list(faces));tetfaces=np.array(tetfaces)
V=V.copy();V[:len(N['vertices'])]=N['vertices']
Es=np.unique(np.sort(np.concatenate([T[:,[a,b]] for a,b in itertools.combinations(range(4),2)]),axis=1),axis=0)
edgemap={tuple(e):i for i,e in enumerate(Es)}
Vall=np.r_[V,V[Fs].mean(1),V[T].mean(1),V[Es].mean(1)]
nv=len(V);nf=len(Fs);nt=len(T);nn=len(Vall);ebase=nv+nf+nt
Pall=np.zeros((nn,7));fixed=np.zeros(nn,bool);owners=defaultdict(set);edgeowners=defaultdict(set)
for f,label in origf.items():
 fi=faces[f];Pall[nv+fi,label]=1;fixed[nv+fi]=True
 for vv in f:owners[vv].add(int(label))
 for a,b in itertools.combinations(f,2):edgeowners[tuple(sorted((a,b)))].add(int(label))
for vv,own in owners.items():Pall[vv,list(own)]=1/len(own);fixed[vv]=True
for edge,own in edgeowners.items():
 ec=ebase+edgemap[edge];Pall[ec,list(own)]=1/len(own);fixed[ec]=True
edges=set()
for ei,e in enumerate(Es):
 for vv in e:edges.add(tuple(sorted((int(vv),ebase+ei))))
for fi,f in enumerate(Fs):
 fc=nv+fi
 for vv in f:edges.add(tuple(sorted((int(vv),fc))))
 for aa,bb in itertools.combinations(f,2):edges.add(tuple(sorted((ebase+edgemap[tuple(sorted((aa,bb)))],fc))))
for ti,t in enumerate(T):
 tc=nv+nf+ti
 for vv in t:edges.add((int(vv),tc))
 for fi in tetfaces[ti]:edges.add((nv+int(fi),tc))
 for aa,bb in itertools.combinations(t,2):edges.add(tuple(sorted((ebase+edgemap[tuple(sorted((aa,bb)))],tc))))
e=np.array(sorted(edges));w=1/np.maximum(np.linalg.norm(Vall[e[:,0]]-Vall[e[:,1]],axis=1),1e-6);aa=e[:,0];bb=e[:,1]
lap=coo_matrix((np.r_[w,w,-w,-w],(np.r_[aa,bb,aa,bb],np.r_[aa,bb,bb,aa])),shape=(nn,nn)).tocsr();u=np.flatnonzero(~fixed);known=np.flatnonzero(fixed)
Pall[u]=spsolve(lap[u][:,u],-lap[u][:,known]@Pall[known])
# Local positive cavity collars remove returning sheets and point-only contacts
# at source concavities. Original boundary ownership is never modified.
collar_nodes=set()
for native_edge in [(1189,1191),(1300,1301),(1299,1305)]:
 ga,gb=S['original_vertex_map'][list(native_edge)];affected=np.flatnonzero(np.sum(np.isin(T,[ga,gb]),axis=1)==2)
 for ti in affected:
  collar_nodes.add(nv+nf+int(ti));collar_nodes.update(int(vv) for vv in T[ti]);collar_nodes.update(nv+int(fi) for fi in tetfaces[ti])
  for aa,bb in itertools.combinations(T[ti],2):collar_nodes.add(ebase+edgemap[tuple(sorted((aa,bb)))])
for native_vertex in [1101,1103,1174,1121,1189,1193,1296,1427,1294,1302,1298,1297,1295,1448,1447,1303,1306,1304,1451,1237,1238]:
 gv=S['original_vertex_map'][native_vertex];affected=np.flatnonzero(np.any(T==gv,axis=1))
 for ti in affected:
  collar_nodes.add(nv+nf+int(ti));collar_nodes.update(int(vv) for vv in T[ti]);collar_nodes.update(nv+int(fi) for fi in tetfaces[ti])
  for aa,bb in itertools.combinations(T[ti],2):collar_nodes.add(ebase+edgemap[tuple(sorted((aa,bb)))])
nodes=sorted(i for i in collar_nodes if not fixed[i]);Pall[nodes]*=.08;Pall[nodes,0]+=.92
EV=list(itertools.combinations(range(4),2));verts=[];lookup={};groups=defaultdict(list);polygons=defaultdict(dict)
def vid(p):
 key=tuple(np.round(p,10));i=lookup.get(key)
 if i is None:i=len(verts);lookup[key]=i;verts.append(p)
 return i
def cut(x,p,a,b):
 h=p[:,a]-p[:,b];tol=1e-10
 if h.min()>tol or h.max()<-tol or np.max(abs(h))<tol:return
 poly=[]
 for i in range(4):
  if abs(h[i])<tol:poly.append(np.eye(4)[i])
 for i,j in EV:
  if h[i]*h[j]<-tol*tol:
   w=h[i]/(h[i]-h[j]);u=np.zeros(4);u[i]=1-w;u[j]=w;poly.append(u)
 if len(poly)<3:return
 poly=np.unique(np.round(poly,13),axis=0)
 if len(poly)<3:return
 xyz=poly@x;_,sv,B=np.linalg.svd(xyz-xyz.mean(0),full_matrices=False)
 if sv[1]<1e-11:return
 xy=(xyz-xyz.mean(0))@B[:2].T;poly=poly[np.argsort(np.arctan2(xy[:,1],xy[:,0]))]
 for k in range(7):
  if k in (a,b):continue
  hv=p[:,a]-p[:,k];val=poly@hv;new=[]
  for i,u in enumerate(poly):
   j=(i+1)%len(poly);w=poly[j];v0=val[i];v1=val[j]
   if v0>=-tol:new.append(u)
   if (v0<-tol and v1>tol) or (v0>tol and v1<-tol):new.append(u+(w-u)*(v0/(v0-v1)))
  if len(new)<3:return
  poly=np.array(new)
 poly2=[]
 for u in poly:
  if not poly2 or np.linalg.norm((u-poly2[-1])@x)>1e-10:poly2.append(u)
 if len(poly2)>1 and np.linalg.norm((poly2[-1]-poly2[0])@x)<1e-10:poly2.pop()
 if len(poly2)<3:return
 xyz=np.array(poly2)@x
 try:grad=np.linalg.solve(x[1:]-x[0],h[1:]-h[0])
 except np.linalg.LinAlgError:return
 if np.dot(np.cross(xyz[1]-xyz[0],xyz[2]-xyz[0]),grad)>0:xyz=xyz[::-1]
 ids=[vid(q) for q in xyz]
 if len(set(ids))<3:return
 m=ids.index(min(ids));ids=ids[m:]+ids[:m];rev=[ids[0]]+ids[:0:-1];key=min(tuple(ids),tuple(rev));sgn=1 if key==tuple(ids) else -1
 polygons[a,b][key]=polygons[a,b].get(key,0)+sgn
for ti,t in enumerate(T):
 center=nv+nf+ti
 for fi in tetfaces[ti]:
  f=Fs[fi];fc=nv+fi
  for ei in range(3):
   edge=tuple(sorted((int(f[ei]),int(f[(ei+1)%3]))));ec=ebase+edgemap[edge]
   for endpoint in edge:
    v=[endpoint,ec,fc,center];p=Pall[v];x=Vall[v]
    cand=[k for k in range(7) if not any(np.all(p[:,j]>p[:,k]+1e-10) for j in range(7) if j!=k)]
    for a,b in itertools.combinations(cand,2):cut(x,p,a,b)
 if ti%2000==0:print('partition',ti,flush=True)
for pair,pg in polygons.items():
 for key,sign in pg.items():
  if sign==0:continue
  ids=list(key) if sign>0 else [key[0]]+list(key[:0:-1]);xyz=np.array([verts[j] for j in ids])
  for k in range(1,len(ids)-1):
   if np.linalg.norm(np.cross(xyz[k]-xyz[0],xyz[k+1]-xyz[0]))>1e-14:groups[pair].append([ids[0],ids[k],ids[k+1]])
np.savez(O/'partition.npz',vertices=np.array(verts),**{f'pair_{a}_{b}':np.array(fs) for (a,b),fs in groups.items()})
print('CONTACT INTERFACES',len(verts),{str(k):len(v) for k,v in groups.items()},flush=True)
