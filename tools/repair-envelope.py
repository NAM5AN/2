"""Auxiliary volume only. The temporary Z01 lid is never exported."""
import json,pathlib,numpy as np,tetgenpy
from scipy.spatial import cKDTree
from collections import Counter
R=pathlib.Path(__file__).resolve().parents[1];P=R;O=R/'repair-output/tetra';O.mkdir(parents=True,exist_ok=True)
M=json.loads((P/'morbol-model.js').read_text().split('=',1)[1].rstrip(';\n '));D=json.loads((P/'tentacle-uv-layout.json').read_text());L=json.loads((P/'supplemental-layout.json').read_text());S=json.loads((P/'assembly-seams.json').read_text())
parts={p['id']:p for p in D['parts']+L['parts']};ids=['J01','T03','T04','T05','T06','T21','T22','L01'];obs={p['id']:p for p in M['objects']};vertices=[];tri=[];labels=[];offsets={}
for label,id in enumerate(ids):
 p=parts[id];v=np.array(p['vertices_world']);offsets[id]=len(vertices);vertices.extend(v)
 dist,local=cKDTree(v).query(np.array(obs[id]['positions']).reshape(-1,3));assert dist.max()<1e-6
 tri.extend(local.reshape(-1,3)+offsets[id]);labels.extend([label]*(len(local)//3))
vertices=np.array(vertices);tri=np.array(tri);labels=np.array(labels);parent=list(range(len(vertices)))
def root(i):
 while parent[i]!=i:parent[i]=parent[parent[i]];i=parent[i]
 return i
for seam in S:
 aa,bb=seam['sides']
 if aa['part'] not in ids or bb['part'] not in ids:continue
 av=np.array(aa['vertices'])+offsets[aa['part']];bv=np.array(bb['vertices'])+offsets[bb['part']]
 ds,ii=cKDTree(vertices[av]).query(vertices[bv])
 for b,i,d in zip(bv,ii,ds):
  if d<6e-7:parent[root(b)]=root(av[i])
remap=np.array([root(i) for i in range(len(vertices))]);tri=remap[tri];valid=np.array([len(set(f))==3 for f in tri]);tri=tri[valid];labels=labels[valid]
ec=Counter(tuple(sorted(e)) for t in tri for e in zip(t,np.roll(t,-1)));assert sum(n==1 for n in ec.values())==86;assert max(ec.values())==2
z=remap[np.array(parts['L01']['inner_loop'])+offsets['L01']]
cen=vertices[z].mean(0);cen[2]+=.15;k=len(vertices);vertices=np.r_[vertices,[cen]]
for a,b in zip(z,np.roll(z,-1)):tri=np.r_[tri,[[a,b,k]]];labels=np.r_[labels,0]
ec=Counter(tuple(sorted(e)) for t in tri for e in zip(t,np.roll(t,-1)));assert set(ec.values())=={2}
used=np.unique(tri);gmap=np.full(len(vertices),-1,int);gmap[used]=np.arange(len(used));tri=gmap[tri];vs=vertices[used]
source=dict(vertices=vs,triangles=tri,labels=labels,original_vertex_map=gmap[remap],offsets=np.array([offsets[i] for i in ids]),ids=np.array(ids),lid_vertex=gmap[k])
np.savez(O/'native-source.npz',**source)
# An inherited 5.3-nanometre segment/facet crossing prevents PLC recovery.
# Resolve it in the solver copy only, with a guarded 0.1-micrometre shift.
t=vs[[1306,1304,1451]];n=np.cross(t[1]-t[0],t[2]-t[0]);n/=np.linalg.norm(n)
d=float(np.dot(vs[1303]-t[0],n));assert -2e-8<d<2e-8,(d,'unexpected source revision')
vs[1303]+=n*1e-7;np.savez(O/'source.npz',**source)
p=tetgenpy.PLC();p.add_points(vs);p.add_facets(tri,facet_id=labels+1)
o=tetgenpy.tetrahedralize('pYfnn',p)
np.savez(O/'tet.npz',vertices=o.points(),tetrahedra=o.tetrahedra(),faces=o.trifaces(),face_markers=o.trifacemarkers(),face_tets=o.adjacent_tetrahedra(),neighbors=o.neighbors())
print('AUXILIARY VOLUME',len(vs),len(tri),flush=True)
