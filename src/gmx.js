// A safe data adapter. GML text is retained for traceability; never eval'd.
export function inherits(manifest,name,parent){
  const seen=new Set();
  while(manifest.objects[name]&&!seen.has(name)){
    if(name===parent)return true;seen.add(name);name=manifest.objects[name].parent;
  }return false;
}
function arithmetic(text){
  const tokens=text.match(/\d+(?:\.\d+)?|[()+*/-]/g);
  if(!tokens||tokens.join('')!==text.replace(/\s/g,''))return undefined;
  let i=0;
  function atom(){let t=tokens[i++];if(t==='-')return -atom();if(t==='+')return atom();if(t==='('){const v=sum();if(tokens[i++]!==')')throw Error();return v;}if(t===undefined)throw Error();return Number(t);}
  function product(){let v=atom();while(tokens[i]==='*'||tokens[i]==='/'){const op=tokens[i++],r=atom();v=op==='*'?v*r:v/r;}return v;}
  function sum(){let v=product();while(tokens[i]==='+'||tokens[i]==='-'){const op=tokens[i++],r=product();v=op==='+'?v+r:v-r;}return v;}
  try{const v=sum();return i===tokens.length&&Number.isFinite(v)?v:undefined;}catch{return undefined;}
}
export function assignments(code){
  const out={};
  for(const line of (code??'').replace(/\/\*[\s\S]*?\*\//g,'').split(/[\n;]/)){
    const m=line.trim().match(/^(\w+)\s*=\s*([^=]+)$/);
    if(!m)continue;
    const text=m[2].replace(/\/\/.*$/,'').trim();
    if(/^(spr|rm)\w+$/.test(text))out[m[1]]=text;
    else{const n=arithmetic(text);if(n!==undefined)out[m[1]]=n;}
  }return out;
}
export function buildRoom(manifest,raw){
  const entities=raw.instances.map((i,index)=>{
    const obj=manifest.objects[i.objName];if(!obj)return null;
    const init={...assignments(obj.create),...assignments(i.code)};
    const sprite=init.sprite_index??obj.sprite;
    const meta=manifest.sprites[sprite];
    const kind=inherits(manifest,i.objName,'objPlayer')?'player':
      inherits(manifest,i.objName,'objEnemy')||inherits(manifest,i.objName,'objPolice')||i.objName==='objSwat'||inherits(manifest,i.objName,'objBoss')||i.objName==='objBoss3'?'enemy':
      inherits(manifest,i.objName,'objDoorV')?'door':inherits(manifest,i.objName,'objWeapon')?'weapon':
      /Transitioner|Elevator|Stairs|Ladder|PlayerCarEnter/.test(i.objName)?'exit':'decor';
    const isWall=inherits(manifest,i.objName,'objWall')||/GlassPanel|CellWall|WoodFence|Rail[HV]/.test(i.objName);
    const furniture=inherits(manifest,i.objName,'objFurniture');
    const solid=init.solid!==undefined?!!init.solid:obj.solid||inherits(manifest,i.objName,'objSolid')||furniture||isWall;
    return {id:index,name:i.objName,kind,sprite,meta,x:i.x,y:i.y,
      scaleX:init.image_xscale??i.scaleX,scaleY:init.image_yscale??i.scaleY,
      angle:-(init.image_angle??i.rotation??0)*Math.PI/180,
      frame:init.image_index??0,depth:init.depth??obj.depth,
      visible:init.visible!==undefined?!!init.visible:obj.visible,solid,isWall,furniture,
      glass:/GlassPanel/.test(i.objName),broken:/GlassPanel.*Broken|GlassPanel.*Destroyed/.test(i.objName),init,code:i.code,mask:manifest.sprites[obj.mask]};
  }).filter(Boolean);
  return {...raw,entities};
}
export function rectFor(entity){
  const m=entity.mask??entity.meta;
  if(!m)return null;
  const b=m.bbox,ox=m.originX,oy=m.originY;
  const corners=[[b[0]-ox,b[1]-oy],[b[2]-ox+1,b[1]-oy],[b[2]-ox+1,b[3]-oy+1],[b[0]-ox,b[3]-oy+1]];
  const c=Math.cos(entity.angle),s=Math.sin(entity.angle);
  const points=corners.map(([x,y])=>[entity.x+x*entity.scaleX*c-y*entity.scaleY*s,entity.y+x*entity.scaleX*s+y*entity.scaleY*c]);
  return {x:Math.min(...points.map(p=>p[0])),y:Math.min(...points.map(p=>p[1])),
    w:Math.max(...points.map(p=>p[0]))-Math.min(...points.map(p=>p[0])),h:Math.max(...points.map(p=>p[1]))-Math.min(...points.map(p=>p[1])),entity};
}
