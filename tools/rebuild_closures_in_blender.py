"""Optional native rebuild from the untouched v23 file using Blender's own mesh API.

Run from Blender's Scripting workspace or:
  blender --background --python tools/rebuild_closures_in_blender.py

Requires the complete R01 folder. It never overwrites the source or the delivered
R01 native file. Geometry comes only from the supplied closure-report.json.
This script is syntax-checked, but has not been executed in Blender here.
"""
from pathlib import Path
import hashlib
import json
import sys
import bpy
import bmesh
from mathutils import Vector
from mathutils.kdtree import KDTree


def package_root() -> Path:
    if '__file__' in globals():
        return Path(__file__).resolve().parent.parent
    # Blender Text Editor when __file__ is absent.
    text = getattr(getattr(bpy.context, 'space_data', None), 'text', None)
    if text and text.filepath:
        return Path(bpy.path.abspath(text.filepath)).resolve().parent.parent
    raise RuntimeError('Open this script from the R01 tools folder before running.')


def main() -> None:
    root = package_root()
    report = json.loads((root / 'closure-report.json').read_text(encoding='utf-8'))
    src = root / 'morbol-v23-softened-lips-uv.blend'
    if hashlib.sha256(src.read_bytes()).hexdigest() != report['source_sha256']:
        raise RuntimeError('Source checksum mismatch: no changes made.')
    data = (root / 'morbol-model.js').read_text(encoding='utf-8')
    model = json.loads(data.split('=', 1)[1].rstrip(';\n'))
    names = {o['id']: o['object'] for o in model['objects'] if o['id'] in report['parts']}
    bpy.ops.wm.open_mainfile(filepath=str(src))
    result = {}
    for part, patch in report['parts'].items():
        obj = bpy.data.objects.get(names[part])
        if obj is None or obj.type != 'MESH':
            raise RuntimeError('Missing native object: ' + part)
        if len(obj.data.polygons) != patch['before']['faces']:
            raise RuntimeError('Source face count mismatch: ' + part)
        bm = bmesh.new()
        bm.from_mesh(obj.data)
        bm.verts.ensure_lookup_table()
        old_verts = list(bm.verts)
        tree = KDTree(len(old_verts))
        for i, vert in enumerate(old_verts):
            tree.insert(obj.matrix_world @ vert.co, i)
        tree.balance()
        uv_layer = bm.loops.layers.uv.get('TentacleUV_Connected')
        if uv_layer is None:
            bm.free()
            raise RuntimeError('Source UV layer missing: ' + part)
        extra = {}
        inv = obj.matrix_world.inverted()
        uvs = patch['new_uv']
        for j, triangle in enumerate(patch['new_triangle_world']):
            vertices = []
            for xyz in triangle:
                point = Vector(xyz)
                _co, i, distance = tree.find(point)
                if distance < 1e-6:
                    vert = old_verts[i]
                else:
                    key = tuple(round(float(x), 9) for x in xyz)
                    if key not in extra:
                        extra[key] = bm.verts.new(inv @ point)
                    vert = extra[key]
                vertices.append(vert)
            face = bm.faces.new(vertices)
            face.material_index = 0
            face.smooth = False
            for k, loop in enumerate(face.loops):
                loop[uv_layer].uv = uvs[3*j+k]
        bm.normal_update()
        open_edges = sum(len(edge.link_faces) == 1 for edge in bm.edges)
        bad_edges = sum(len(edge.link_faces) > 2 for edge in bm.edges)
        expected = 103 if part == 'J01' else 0
        if open_edges != expected or bad_edges:
            bm.free()
            raise RuntimeError(f'{part}: failed closure check ({open_edges}, {bad_edges})')
        bm.to_mesh(obj.data)
        bm.free()
        obj.data.update()
        result[part] = {'boundary_edges': open_edges, 'nonmanifold_edges': bad_edges,
                        'faces': len(obj.data.polygons)}
    dst = root / 'morbol-v24-independent-shells-R01-blender-resaved.blend'
    if dst.exists():
        raise RuntimeError('Output already exists; rename it to preserve the previous result.')
    bpy.ops.wm.save_as_mainfile(filepath=str(dst))
    result_path = root / 'blender-rebuild-validation.json'
    result_path.write_text(json.dumps({'blender_version': bpy.app.version_string,
                                      'native_file': dst.name, 'parts': result}, indent=2),
                           encoding='utf-8')
    print('Saved:', dst)


if __name__ == '__main__':
    main()
