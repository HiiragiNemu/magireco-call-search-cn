import base64,gzip,hashlib,io,json,shutil,subprocess,tarfile
from pathlib import Path
from PIL import Image
out=Path('/tmp/call-r22-verify');out.mkdir(exist_ok=True)
parts=Path('.github/maintenance/call-r22')
payload=base64.b64decode(''.join((parts/f'part{i}.b64').read_text().strip() for i in range(4)),validate=True)
assert hashlib.sha256(payload).hexdigest()=='89cd6e82737182e6ef77d592fd3eb519d4b6b4e6b2d44581af03f668755e911b'
patch=gzip.decompress(payload);(out/'applied-text.patch').write_bytes(patch)
subprocess.run(['git','apply','--check','-'],input=patch,check=True)
subprocess.run(['git','apply','-'],input=patch,check=True)
for correction in sorted(parts.glob('*.patch')):
 data=correction.read_bytes();subprocess.run(['git','apply','--check','-'],input=data,check=True);subprocess.run(['git','apply','-'],input=data,check=True)
source=Path('/tmp/call-r22-source/upstream')
load=lambda p:json.loads(Path(p).read_text(encoding='utf-8'))
def save(p,data):Path(p).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
portraits=load(source/'portraits.json');assert len(portraits)==98
local=load('public/data/story-v7/localization.json')['characters'];proof=[]
for item in portraits:
 jp=item['jp'];stem='story-'+hashlib.sha256(jp.encode()).hexdigest()[:12]
 raw=(source/item['file']).read_bytes();assert hashlib.sha256(raw).hexdigest()==item['sha256']
 image=Image.open(io.BytesIO(raw)).convert('RGBA');dest=Path('public/img/png')/(stem+'.png');assert not dest.exists()
 image.save(dest);decoded=Image.open(dest).convert('RGBA');assert image.size==decoded.size and image.tobytes()==decoded.tobytes()
 proof.append({'jp':jp,'image':stem,'sourceUrl':item['sourceUrl'],'sourceSha256':item['sha256'],'pngSha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'decodedPixelsEqual':True,'size':list(image.size),'chineseSource':local[jp]['source']})
save('docs/story-character-assets-20260929.json',proof)
selectors=load(source/'selectors.json');save('tests/fixtures/story-selectors-r22.json',{k:[x['jp'] for x in v] for k,v in selectors.items()})
shutil.rmtree(parts);Path('.github/workflows/call-r22-verify.yml').unlink()
subprocess.run(['git','add','-A'],check=True)
paths=subprocess.check_output(['git','diff','--cached','--name-only','-z']).decode().split('\0');paths=[p for p in paths if p]
public=[p for p in paths if p.startswith('public/') and Path(p).is_file()]
assert len(public)==110,len(public)
save('public/call-r22-release.json',{'release':'call-r22-layout-catalog-20260929','sourceSnapshotSha256':'92cced9f176c583ab125b0a77b513116a27b4c376332de0c5f4c031f83ac51cc','baseCharacters':193,'storyCharacters':291,'attendanceCharacters':194,'sha256':{p[7:]:hashlib.sha256(Path(p).read_bytes()).hexdigest() for p in public}})
subprocess.run(['git','add','-A'],check=True)
paths=[p for p in subprocess.check_output(['git','diff','--cached','--name-only','-z']).decode().split('\0') if p]
for p in paths:
 assert not p.startswith(('functions/','public/aio/','public/edge-functions/','public/data/story-v6/')),p
 if p.startswith('public/img/'):
  assert p.startswith('public/img/png/story-'),p
  assert subprocess.check_output(['git','diff','--cached','--diff-filter=A','--name-only','--',p]).strip(),p
(out/'candidate.patch').write_bytes(subprocess.check_output(['git','diff','--cached','--binary']))
with tarfile.open(out/'candidate-files.tar.gz','w:gz') as archive:
 for p in paths:
  if Path(p).is_file():archive.add(p,arcname=p)
save(out/'candidate-files.json',{p:(hashlib.sha256(Path(p).read_bytes()).hexdigest() if Path(p).is_file() else None) for p in paths})
print('Prepared',len(paths),'changed/deleted files; verified 98 pixel-identical source portraits.')
