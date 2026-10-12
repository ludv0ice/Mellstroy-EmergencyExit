"""Normalize generated artwork only; never resize or paint the source sprites."""
from pathlib import Path
from PIL import Image
import json, shutil

ROOT=Path(__file__).resolve().parents[1]
GEN=Path(r'C:/Users/ludv0ice/.codex/generated_images/01a13141-fbe0-7713-a988-ad77715a2ca2')
OUT=ROOT/'public/assets/custom'
OUT.mkdir(parents=True,exist_ok=True)
RAW=ROOT/'assets/generated'
RAW.mkdir(parents=True,exist_ok=True)

def strip(file,key,frames,fw,fh,body,reference=None,origin=None):
    raw_path=RAW/(key+'-generated.png')
    input_path=raw_path if raw_path.exists() else GEN/file
    source=Image.open(input_path).convert('RGBA')
    if input_path!=raw_path:shutil.copy2(input_path,raw_path)
    # Ignore stray almost-transparent pixels when measuring the generated silhouette.
    source.putalpha(source.getchannel('A').point(lambda a:255 if a>100 else 0))
    slots=[source.crop((round(i*source.width/frames),0,round((i+1)*source.width/frames),source.height)) for i in range(frames)]
    bounds=[slot.getbbox() for slot in slots]
    scale=min(body[0]/max(b[2]-b[0] for b in bounds),body[1]/max(b[3]-b[1] for b in bounds))
    result=Image.new('RGBA',(fw*frames,fh))
    original=Image.open(ROOT/reference).convert('RGBA') if reference else None
    for i,(slot,b) in enumerate(zip(slots,bounds)):
        tile=slot.crop(b)
        tile=tile.resize((max(1,round(tile.width*scale)),max(1,round(tile.height*scale))),Image.Resampling.NEAREST)
        if original:
            bound=original.crop((i*fw,0,(i+1)*fw,fh)).getbbox()
            cx,cy=(bound[0]+bound[2])/2,(bound[1]+bound[3])/2
        else:cx,cy=fw/2,fh/2
        result.paste(tile,(i*fw+round(cx-tile.width/2),round(cy-tile.height/2)))
    result.save(OUT/(key+'.png'))
    return {'url':'/assets/custom/'+key+'.png','width':fw,'height':fh,'frames':frames,'originX':origin[0] if origin else fw/2,'originY':origin[1] if origin else fh/2}

skins={}
skins['hero']=strip('exec-21b89256-7cd5-4ca1-84df-ba498c706cb9.png','mellstroy-walk',8,60,60,(16,26),'sprites/Player/sprPWalkUnarmed_strip8.png',(30,30))
skins['police']=strip('exec-f09b8ca1-bfe5-4666-a263-5e149f634de9.png','police-walk',8,32,24,(31,17),'sprites/Combat/Enemy/sprPoliceWalkM16_strip8.png',(8,10))
skins['policeUnarmed']=strip('exec-b58cbf96-90ce-4582-818a-92384ca129d7.png','police-unarmed',8,32,32,(16,24),'sprites/Combat/Enemy/sprPoliceWalkUnarmed_strip8.png',(16,16))
skins['punch']=strip('exec-f9bd30d8-9eb5-4f0f-9bdc-403581e4c48f.png','mellstroy-punch',7,44,32,(32,24),'sprites/Player/sprPAttackPunch_strip7.png',(13,16))
skins['corpse']=strip('exec-6d9f5338-fa24-4c23-8bb7-5e8de116f9c0.png','police-corpse',4,60,60,(43,24),'sprites/Combat/Enemy/sprPoliceBackMachinegun_strip4.png',(30,30))
skins['car']=strip('exec-d6ece240-4008-4403-829c-8bc6d3097eb0.png','escape-car',13,107,70,(107,52),'sprites/Vehicles/sprPlayerCar_strip13.png',(53,46))
skins['desk']=strip('exec-7e439d21-7301-4ce5-9d57-e4808d66c8a3.png','streamer-desk',6,53,25,(49,25),'sprites/Furniture/sprAndersDesk_strip6.png',(26,14))
floor_raw=RAW/'floor-atlas-generated.png'
floor_input=floor_raw if floor_raw.exists() else GEN/'exec-17dfef08-ae91-4b0b-a0c7-f7b6493e6d2f.png'
source=Image.open(floor_input).convert('RGBA')
source.resize((816,368),Image.Resampling.NEAREST).save(OUT/'floor-atlas.png')
if floor_input!=floor_raw:shutil.copy2(floor_input,floor_raw)
skins['floor']={'url':'/assets/custom/floor-atlas.png','width':816,'height':368}
(OUT/'skins.json').write_text(json.dumps(skins,indent=2),encoding='utf8')
print(json.dumps(skins))
