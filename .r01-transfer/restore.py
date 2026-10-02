from pathlib import Path, PurePosixPath
import base64, collections, hashlib, io, json, os, subprocess, tarfile
import zstandard as zstd

source = Path.cwd()
transfer = source / '.r01-transfer'
out = source / 'publication-output'
out.mkdir(exist_ok=True)
manifest = json.loads((transfer / 'manifest.json').read_text())
corrections = json.loads((transfer / 'corrections.json').read_text())
base = manifest['base_commit']

def sha(data):
    return hashlib.sha256(data).hexdigest()

def git(*args, cwd=source):
    return subprocess.check_output(['git', *args], cwd=cwd)

def original(path):
    return git('show', base + ':' + path)

pieces = []
for i in range(19):
    name = f'{i:02}'
    paths = [name + '.b64'] if i != 6 else ['06a.b64', '06b.b64']
    text = ''.join(''.join((transfer / path).read_text().split()) for path in paths)
    for a, b, replacement in reversed(corrections.get(name, [])):
        text = text[:a] + replacement + text[b:]
    pieces.append(text)
payload = base64.b64decode(''.join(pieces), validate=True)
assert sha(payload) == manifest['payload_sha256'], 'Transfer checksum mismatch'
dictionary = b''.join(original(path) for path in manifest['dictionary_files'])
assert sha(dictionary) == manifest['dictionary_sha256'], 'Baseline dictionary mismatch'
dd = zstd.ZstdCompressionDict(dictionary, dict_type=zstd.DICT_TYPE_RAWCONTENT)
raw = zstd.ZstdDecompressor(dict_data=dd).decompress(payload, max_output_size=manifest['tar_size'])
assert len(raw) == manifest['tar_size']
files = {}
with tarfile.open(fileobj=io.BytesIO(raw), mode='r:') as archive:
    for entry in archive:
        path = PurePosixPath(entry.name)
        assert entry.isfile() and not path.is_absolute() and '..' not in path.parts
        assert entry.name in manifest['files'] and entry.name not in files
        data = archive.extractfile(entry).read()
        assert sha(data) == manifest['files'][entry.name], entry.name
        files[entry.name] = data
assert set(files) == set(manifest['files'])

def model(data):
    return json.loads(data.decode().split('=', 1)[1].rstrip(';\n'))

before = model(original('morbol-model.js'))
after = model(files['morbol-model.js'])
before_objects = {o['id']: o for o in before['objects']}
after_objects = {o['id']: o for o in after['objects']}
assert len(after_objects) == 64 and set(before_objects) == set(after_objects)
changed = {'J01', 'T03', 'T04', 'T05', 'T06', 'T21', 'T22'}
for key in set(after_objects) - changed:
    assert after_objects[key] == before_objects[key], 'Unexpected object change: ' + key
geometry = {}
for key in sorted(changed):
    o = after_objects[key]
    pts = [tuple(o['positions'][i:i+3]) for i in range(0, len(o['positions']), 3)]
    edges = collections.Counter()
    for i in range(0, len(pts), 3):
        tri = pts[i:i+3]
        for a, b in zip(tri, tri[1:]+tri[:1]):
            edges[tuple(sorted((a,b)))] += 1
    boundary = sum(v == 1 for v in edges.values())
    nonmanifold = sum(v > 2 for v in edges.values())
    assert boundary == (103 if key == 'J01' else 0), key
    assert nonmanifold == 0, key
    geometry[key] = {'boundary_edges': boundary, 'nonmanifold_edges': nonmanifold}

lines = ['# Morbol J01-CLOSURE-R01, meters, Blender Z-up coordinates',
         '# Independent objects, shared position indices within each object, original per-corner UV retained.',
         'mtllib morbol-independent-shells-R01.mtl']
vbase = tbase = 0
for o in after['objects']:
    pts = [tuple(o['positions'][i:i+3]) for i in range(0, len(o['positions']), 3)]
    verts = sorted(set(pts))
    lookup = {q:i+vbase+1 for i,q in enumerate(verts)}
    lines += ['o '+o['id'], 'g '+o['id'], 'usemtl '+o['id']]
    lines += ['v %.9f %.9f %.9f'%q for q in verts]
    lines += ['vt %.9f %.9f'%tuple(o['uv'][i:i+2]) for i in range(0,len(o['uv']),2)]
    lines += ['vn %.8f %.8f %.8f'%tuple(o['normals'][i:i+3]) for i in range(0,len(o['normals']),3)]
    lines += ['f '+' '.join('%d/%d/%d'%(lookup[pts[j]],tbase+j+1,tbase+j+1)
              for j in range(i,i+3)) for i in range(0,len(pts),3)]
    vbase += len(verts)
    tbase += len(pts)
obj = ('\n'.join(lines)+'\n').encode()
assert sha(obj) == manifest['obj_sha256'], 'OBJ reconstruction mismatch'
files['morbol-independent-shells-R01.obj'] = obj
assert files['index.html'] == files['몰볼-통합-UV-대조.html']

ready = Path(os.environ['RUNNER_TEMP']) / 'r01-ready'
git('worktree', 'add', '-b', 'publish/r01-ready', str(ready), base)
for name, data in files.items():
    dest = ready / name
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(data)
assert sha((ready/'morbol-v23-softened-lips-uv.blend').read_bytes()) == 'e515e4d59e3c4a0c3dfe1d84dedabf927fa9d515b04508c6e86bc5aa61933d2b'
for path in ready.glob('*.js'):
    subprocess.run(['node', '--check', str(path)], check=True)
report = {'revision':'J01-CLOSURE-R01', 'base_commit':base,
          'exact_changed_files_verified':len(files), 'unchanged_objects':57,
          'objects_total':64, 'geometry':geometry,
          'baseline_blend_preserved':True, 'javascript_syntax_passed':True,
          'native_blender_reopen_tested':False, 'integrated_webgl_tested':False,
          'standalone_review_test': 'Previously tested; see browser-review-validation.json',
          'source_delivery_zip_sha256':'302cf18569379f2968f4d238f74d5d71eea0c93e137f4e9811e72d14fcad2deb',
          'note':'Working files, not a byte-identical upload of the original ZIP. Four PNG review screenshots remain in the delivered ZIP.'}
(ready/'R01-publication-validation.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
checks = ''.join(sha(data)+'  '+name+'\n' for name,data in sorted(files.items()))
(ready/'R01-publication-SHA256SUMS.txt').write_text(checks)
git('config', 'user.name', 'github-actions[bot]', cwd=ready)
git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com', cwd=ready)
git('add', '--all', cwd=ready)
git('commit', '-m', 'Publish R01 independent tentacle shells; preserve J01 body opening and baseline', cwd=ready)
commit = git('rev-parse', 'HEAD', cwd=ready).decode().strip()
git('push', 'origin', 'publish/r01-ready', cwd=ready)
report['ready_commit'] = commit
(out/'publication-result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
(out/'R01-publication-SHA256SUMS.txt').write_text(checks)
print(json.dumps(report, ensure_ascii=False, indent=2), flush=True)
