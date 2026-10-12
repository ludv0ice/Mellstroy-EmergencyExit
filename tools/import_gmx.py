"""Lossless data import; deliberately does not execute arbitrary GML code."""
import json, re, shutil, hashlib
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'HotlineMiami.gmx-master/Source/GameMaker Studio 1.4'
OUT = ROOT / 'public/assets'

def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

def num(value, default=0):
    try: return float(value)
    except (TypeError, ValueError): return default

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    strips = {}
    for path in (ROOT / 'sprites').rglob('*.png'):
        strips[re.sub(r'_strip\d+$', '', path.stem)] = path
    sprites = {}
    for path in (SOURCE / 'sprites').glob('*.sprite.gmx'):
        key = path.name.split('.')[0]
        xml = ET.parse(path).getroot()
        w, h = int(xml.findtext('width')), int(xml.findtext('height'))
        frames = xml.findall('frames/frame')
        dest = OUT / 'original' / (key + '.png')
        dest.parent.mkdir(parents=True, exist_ok=True)
        external = strips.get(key)
        if external:
            image = Image.open(external)
            count_match = re.search(r'_strip(\d+)$', external.stem)
            count = int(count_match[1]) if count_match else 1
            fw, fh = image.width // count, image.height
            shutil.copy2(external, dest)
        else:
            count, fw, fh = max(1, len(frames)), w, h
            image = Image.new('RGBA', (fw * count, fh))
            for i, frame in enumerate(frames):
                p = SOURCE / 'sprites' / frame.text.replace('\\', '/')
                if p.exists(): image.paste(Image.open(p).convert('RGBA'), (i * fw, 0))
            image.save(dest)
        sprites[key] = {'url':'/assets/original/'+key+'.png', 'width':fw, 'height':fh,
            'frames':count, 'originX':num(xml.findtext('xorig'))+(fw-w)/2,
            'originY':num(xml.findtext('yorigin'))+(fh-h)/2,
            'gmxWidth':w,'gmxHeight':h,
            'bbox':[num(xml.findtext('bbox_'+side)) + ((fw-w)/2 if side in ('left','right') else (fh-h)/2) for side in ('left','top','right','bottom')],
            'source':str(external.relative_to(ROOT)).replace('\\','/') if external else str(path.relative_to(ROOT)).replace('\\','/')}
    backgrounds = {}
    for path in (SOURCE/'background/images').glob('*.png'):
        dest = OUT / 'background' / path.name
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, dest)
        backgrounds[path.stem] = '/assets/background/'+path.name
    objects = {}
    for path in (SOURCE / 'objects').glob('*.object.gmx'):
        xml = ET.parse(path).getroot()
        key = path.name.split('.')[0]
        events = [{'type':int(e.get('eventtype')), 'number':e.get('enumb'), 'other':e.get('ename'),
                   'code':'\n'.join(a.text or '' for a in e.findall('.//argument/string'))} for e in xml.findall('events/event')]
        objects[key] = {'sprite':xml.findtext('spriteName'), 'parent':xml.findtext('parentName'),
                        'mask':xml.findtext('maskName'), 'solid':num(xml.findtext('solid'))!=0,
                        'visible':num(xml.findtext('visible'))!=0,'depth':num(xml.findtext('depth')),
                        'create':'\n'.join(e['code'] for e in events if e['type']==0)}
        write(OUT/'gml/objects'/(key+'.json'), events)
    def inherits(key, parent):
        seen=set()
        while key in objects and key not in seen:
            if key==parent:return True
            seen.add(key); key=objects[key]['parent']
        return False
    rooms = []
    project=ET.parse(SOURCE/'HotlineMiami.project.gmx').getroot()
    order=[Path(e.text.replace('\\','/')).name for e in project.findall('.//rooms/room') if e.text]
    for path in (SOURCE/'rooms').glob('*.room.gmx'):
        xml=ET.parse(path).getroot(); key=path.name.split('.')[0]
        instances=[]
        for inst in xml.findall('instances/instance'):
            attrs=dict(inst.attrib)
            for field in ('x','y','scaleX','scaleY','rotation','colour'):attrs[field]=num(attrs.get(field),1 if field.startswith('scale') else 0)
            instances.append(attrs)
        tiles=[]
        for tile in xml.findall('tiles/tile'):
            attrs=dict(tile.attrib)
            for field in ('x','y','w','h','xo','yo','depth','scaleX','scaleY'):attrs[field]=num(attrs.get(field),1 if field.startswith('scale') else 0)
            tiles.append(attrs)
        data={'id':key,'width':num(xml.findtext('width')),'height':num(xml.findtext('height')),
              'speed':num(xml.findtext('speed')),'colour':num(xml.findtext('colour')),
              'code':xml.findtext('code') or '', 'instances':instances,'tiles':tiles,
              'backgrounds':[dict(b.attrib) for b in xml.findall('backgrounds/background')]}
        write(OUT/'rooms'/(key+'.json'),data)
        enemies=sum(inherits(i['objName'],'objEnemy') or inherits(i['objName'],'objPolice') or inherits(i['objName'],'objSwat') or inherits(i['objName'],'objDog') for i in instances)
        player=next((i for i in instances if inherits(i['objName'],'objPlayer')),None)
        rooms.append({'id':key,'width':data['width'],'height':data['height'],'enemies':enemies,'instances':len(instances),
                      'tiles':len(tiles),'hasPlayer':player is not None,'order':order.index(key) if key in order else 9999})
    rooms.sort(key=lambda r:r['order'])
    for path in (SOURCE/'scripts').glob('*.gml'):
        dest=OUT/'gml/scripts'/path.name; dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(path,dest)
    audio={}
    for path in (SOURCE/'sound').glob('*.sound.gmx'):
        xml=ET.parse(path).getroot();name=path.name.split('.')[0]
        fname=xml.findtext('data') or ''
        candidates=list((SOURCE/'sound/audio').glob(name+'.*'))
        if fname:
            p=SOURCE/'sound'/fname.replace('\\','/')
            if p.exists():candidates=[p]
        if candidates:
            p=candidates[0];dest=OUT/'audio'/p.name;dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,dest)
            audio[name]='/assets/audio/'+p.name
    fonts=ROOT/'HotlineMiami.gmx-master/Media/Fonts - Hotline Miami'
    for file in ('justice.ttf','justicesolid.ttf'):
        if (fonts/file).exists():
            (OUT/'fonts').mkdir(exist_ok=True);shutil.copy2(fonts/file,OUT/'fonts'/file)
    stats={'sprites':len(sprites),'objects':len(objects),'rooms':len(rooms),'scripts':len(list((SOURCE/'scripts').glob('*.gml'))),
           'combatRooms':sum(r['enemies']>0 for r in rooms),'audio':len(audio)}
    write(OUT/'manifest.json',{'sprites':sprites,'backgrounds':backgrounds,'audio':audio,'objects':objects,'rooms':rooms,'stats':stats})
    print(json.dumps(stats))

if __name__=='__main__':main()
