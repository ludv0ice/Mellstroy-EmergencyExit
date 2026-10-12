export const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const angleDelta=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function circleRect(x,y,r,box){
  const dx=x-clamp(x,box.x,box.x+box.w),dy=y-clamp(y,box.y,box.y+box.h);
  return dx*dx+dy*dy<r*r;
}
export function rayRect(ax,ay,bx,by,box,pad=0){
  let lo=0,hi=1;
  for(const [a,d,min,max] of [[ax,bx-ax,box.x-pad,box.x+box.w+pad],[ay,by-ay,box.y-pad,box.y+box.h+pad]]){
    if(Math.abs(d)<1e-9){if(a<min||a>max)return null;}
    else{let t1=(min-a)/d,t2=(max-a)/d;if(t1>t2)[t1,t2]=[t2,t1];lo=Math.max(lo,t1);hi=Math.min(hi,t2);if(lo>hi)return null;}
  }return lo;
}
export function segmentCircle(ax,ay,bx,by,x,y,r){
  const dx=bx-ax,dy=by-ay,a=dx*dx+dy*dy;
  if(a<1e-9)return Math.hypot(ax-x,ay-y)<=r?0:null;
  const fx=ax-x,fy=ay-y,c=fx*fx+fy*fy-r*r;
  if(c<=0)return 0;
  const b=2*(fx*dx+fy*dy),disc=b*b-4*a*c;
  if(disc<0)return null;const t=(-b-Math.sqrt(disc))/(2*a);return t>=0&&t<=1?t:null;
}
export class SpatialIndex{
  constructor(rects,size=64){this.size=size;this.buckets=new Map();
    for(const box of rects)for(let y=Math.floor(box.y/size);y<=Math.floor((box.y+box.h)/size);y++)for(let x=Math.floor(box.x/size);x<=Math.floor((box.x+box.w)/size);x++){
      const key=x+','+y;if(!this.buckets.has(key))this.buckets.set(key,[]);this.buckets.get(key).push(box);
    }
  }
  query(x,y,w,h){const found=new Set();for(let cy=Math.floor(y/this.size);cy<=Math.floor((y+h)/this.size);cy++)for(let cx=Math.floor(x/this.size);cx<=Math.floor((x+w)/this.size);cx++)for(const box of this.buckets.get(cx+','+cy)??[])if(!box.entity?.broken||box.entity.glass)found.add(box);return [...found];}
}
export class Navigation{
  constructor(width,height,blocked,cell=8){this.cell=cell;this.cols=Math.ceil(width/cell);this.rows=Math.ceil(height/cell);
    this.blocked=new Uint8Array(this.cols*this.rows);
    for(let y=0;y<this.rows;y++)for(let x=0;x<this.cols;x++)this.blocked[y*this.cols+x]=blocked((x+.5)*cell,(y+.5)*cell)?1:0;
  }
  point(id){return {x:(id%this.cols+.5)*this.cell,y:(Math.floor(id/this.cols)+.5)*this.cell};}
  nearest(x,y){const cx=clamp(Math.floor(x/this.cell),0,this.cols-1),cy=clamp(Math.floor(y/this.cell),0,this.rows-1);
    for(let r=0;r<12;r++)for(let yy=Math.max(0,cy-r);yy<=Math.min(this.rows-1,cy+r);yy++)for(let xx=Math.max(0,cx-r);xx<=Math.min(this.cols-1,cx+r);xx++){
      const id=yy*this.cols+xx;if(!this.blocked[id])return id;
    }return null;
  }
  path(from,to){const start=this.nearest(from.x,from.y),goal=this.nearest(to.x,to.y);if(start===null||goal===null)return [];
    const parent=new Map(),g=new Map([[start,0]]),open=new Set([start]),closed=new Set();
    const heuristic=id=>Math.abs(id%this.cols-goal%this.cols)+Math.abs(Math.floor(id/this.cols)-Math.floor(goal/this.cols));
    let visits=0;
    while(open.size&&visits++<12000){let current=null,best=Infinity;for(const id of open){const score=g.get(id)+heuristic(id);if(score<best){current=id;best=score;}}
      if(current===goal){const route=[];let id=goal;while(id!==start){route.push(this.point(id));id=parent.get(id);}return route.reverse();}
      open.delete(current);closed.add(current);
      const x=current%this.cols,y=Math.floor(current/this.cols);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,id=ny*this.cols+nx;
        if(nx<0||ny<0||nx>=this.cols||ny>=this.rows||this.blocked[id]||closed.has(id))continue;
        const next=g.get(current)+1;if(next<(g.get(id)??Infinity)){g.set(id,next);parent.set(id,current);open.add(id);}
      }
    }return [];
  }
}
