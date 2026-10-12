// IDs and ammo originate in scrCurrentWeapon.gml and objWeapon's Create event.
const definitions = [
  ['M16','M16',24,2/60,1,6*Math.PI/180,960,'sndM16'],['Дробовик','Shotgun',6,30/60,8,12*Math.PI/180,960,'sndShotgun'],
  ['Клюшка','Club'],['Труба','Pipe'],['Бита','Bat'],['Нож','Knife'],
  ['Двустволка','DoubleBarrel',2,8/60,16,20*Math.PI/180,960,'sndDoubleBarrel'],
  ['Пистолет с глушителем','Silencer',13,10/60,1,6*Math.PI/180,960,'sndSilencer'],['Катана','Sword'],
  ['UZI','Uzi',30,1/60,1,10*Math.PI/180,960,'sndUzi'],['Магнум','Magnum',6,8/60,1,0,960,'sndMagnum'],
  ['Scorpion','Scorpion',20,2/60,1,6*Math.PI/180,960,'sndScorpion'],['MP5','MP5',32,2/60,1,10*Math.PI/180,960,'sndMP5'],
  ['Бильярдный кий','Pool'],['Сломанный кий','PoolBroke'],['Топор','Axe'],
  ['Дубинка','NightStick'],['Лом','Crowbar'],['Мачете','Machete'],['Кувалда','SledgeHammer'],
  ['Кубок','Trophy'],['Дрель','Drill'],['Сковорода','Pan'],['Кипяток','BoilingPot'],
  ['Кастрюля','Pot'],['UZI с глушителем','SilencedUzi',30,2/60,1,10*Math.PI/180,960,'sndSilencer'],
  ['Пакет','Bag'],['Кирпич','Throw'],['Бутылка','Throw'],['Дротик','Throw'],
  ['Нож для метания','Throw'],['Ножницы','Throw'],['Молоток','Throw'],['Звезда','Throw'],['Молотов','Throw']
];
export const WEAPONS=definitions.map((d,id)=>({id,name:d[0],sprite:d[1],ammo:d[2]??0,
  gun:d[2]>0,cooldown:d[3]??(id===19?.5:.26),pellets:d[4]??0,spread:d[5]??0,
  speed:d[6]??0,sound:d[7]??'sndSwing1',range:id===5?25:id===8?39:32,
  sharp:[5,8,15,18,21].includes(id),throwOnly:id>=27,silent:[7,25].includes(id)}));
const meleeReload={Club:19,Pipe:22,Bat:25,Knife:10,Sword:15,Pool:20,PoolBroke:20,Axe:30,NightStick:15,Crowbar:20,Machete:12,SledgeHammer:30,Trophy:20,Drill:20,Pan:20,BoilingPot:25,Pot:25,Bag:20,Throw:20};
for(const weapon of WEAPONS)if(!weapon.gun)weapon.cooldown=(meleeReload[weapon.sprite]??20)/60;
export const UNARMED={id:-1,name:'Кулаки',sprite:'Unarmed',gun:false,ammo:0,cooldown:20/60,range:25,sound:'sndPunch'};
export const weaponBySprite=(name='')=>WEAPONS.find(w=>name.replace(/^(sprPolice|sprE|sprP)(Walk|Attack)/,'')===w.sprite)??UNARMED;
