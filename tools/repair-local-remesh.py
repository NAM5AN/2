"""Replace a small folded disk in J01/T22; neither owner's original shell moves."""
import pathlib,numpy as np,json,sys,subprocess
from collections import defaultdict,Counter
from scipy.spatial import cKDTree
try:
 import shapely
except ImportError:
 subprocess.run([sys.executable,'-m','pip','install','shapely==2.1.2'],check=True)
 import shapely
from shapely.geometry import Polygon
R=pathlib.Path(__file__).resolve().parents[1];O=R/'repair-output/tetra';d=dict(np.load(O/'partition.npz'));V=d['vertices'];F=d['pair_0_6'];center=np.array([.1495,.2695,1.2735]);ef=defaultdict(list)
for fi,t in enumerate(F):
 for a,b in zip(t,np.roll(t,-1)):ef[tuple(sorted((int(a),int(b))))].append(fi)
seed=set(np.flatnonzero(np.min(np.linalg.norm(V[F]-center,axis=2),axis=1)<.007).tolist());selected=set(seed)
for step in range(2):
 old=set(selected)
 for e,faces in ef.items():
  if any(f in old for f in faces):selected.update(faces)
edges=Counter(tuple(sorted((int(a),int(b)))) for fi in selected for a,b in zip(F[fi],np.roll(F[fi],-1)));bedges=[e for e,n in edges.items() if n==1];ad=defaultdict(list)
for a,b in bedges:ad[a].append(b);ad[b].append(a)
assert len(selected)==129 and len(bedges)==23 and all(len(n)==2 for n in ad.values()),'unexpected contact revision'
remaining=set(ad);loops=[]
while remaining:
 a=next(iter(remaining));loop=[a];prev=None;cur=a
 while True:
  nxt=[v for v in ad[cur] if v!=prev][0]
  if nxt==a:break
  loop.append(nxt);prev,cur=cur,nxt;assert len(loop)<=len(ad)+1
 remaining.difference_update(loop);loops.append(loop)
assert len(loops)==1
loop=loops[0];xyz=V[loop];cen=xyz.mean(0);_,sv,B=np.linalg.svd(xyz-cen,full_matrices=False);xy=(xyz-cen)@B[:2].T;poly=Polygon(xy);assert poly.is_valid
tris=shapely.constrained_delaunay_triangles(poly);tree=cKDTree(xy);new=[]
for tri in tris.geoms:
 coords=np.array(tri.exterior.coords)[:-1];ds,ii=tree.query(coords);assert ds.max()<1e-7;new.append([loop[i] for i in ii])
keep=[t.tolist() for i,t in enumerate(F) if i not in selected];d['pair_0_6']=np.array(keep+new);np.savez(O/'partition.npz',**d)
report={'pair':['J01','T22'],'removed_triangles':len(selected),'replacement_triangles':len(new),'boundary_vertices_preserved':len(loop),'original_shell_vertices_moved':0}
(R/'repair-output/final/local-remesh-report.json').write_text(json.dumps(report,indent=2));print(report,flush=True)
