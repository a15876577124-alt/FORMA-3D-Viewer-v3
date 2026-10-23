/* FORMA Motion V2. Authored timeline; exact approved paths at rest. Zero runtime dependencies. */
(function(global){
  const G=typeof module!=='undefined'&&module.exports?require('./geometry.js'):global.FORMA_GEOMETRY;
  const palette={dark:{background:'#0A0C0F',foreground:'#F2EDE4'},light:{background:'#FFFFFF',foreground:'#101318'}};
  const timelines={
    precision:{name:'Precision Assembly',duration:2.8,settle:1.94,shift:[.90,1.62],word:[1.10,1.94],letters:1.14,
      planes:[{start:.12,end:.72,dx:-30,dy:22},{start:.28,end:.95,dx:34,dy:-22},{start:.44,end:1.13,dx:26,dy:19}]},
    spatial:{name:'Spatial Construction',duration:3,settle:2.14,shift:[1.06,1.78],word:[1.40,2.14],letters:1.44,
      planes:[{start:.10,end:1.05,dx:-16,dy:12,z:24,rx:0,ry:-58,pivot:[32,64]},
        {start:.28,end:1.24,dx:19,dy:-18,z:80,rx:66,ry:-18,pivot:[52,26]},
        {start:.48,end:1.44,dx:26,dy:20,z:-48,rx:-12,ry:48,pivot:[52,60]}]}
  };
  const points=[[[20,32],[44,18],[44,100],[20,114]],[[52,14],[108,14],[94,38],[52,38]],[[52,48],[92,48],[78,72],[52,72]]];
  const clamp=x=>Math.max(0,Math.min(1,x)),num=x=>String(Math.round(x*10000)/10000);
  function bezier(x,a,b,c,d){if(x<=0)return 0;if(x>=1)return 1;let lo=0,hi=1,u=.5;for(let i=0;i<18;i++){u=(lo+hi)/2;const v=3*(1-u)*(1-u)*u*a+3*(1-u)*u*u*c+u*u*u;if(v<x)lo=u;else hi=u;}return 3*(1-u)*(1-u)*u*b+3*(1-u)*u*u*d+u*u*u;}
  const progress=(t,start,end,curve='arrival')=>{const x=clamp((t-start)/(end-start));return curve==='glide'?bezier(x,.65,0,.35,1):bezier(x,.22,.61,.36,1);};
  function colorMix(bg,fg,r){const a=bg.match(/\w\w/g).map(h=>parseInt(h,16)),b=fg.match(/\w\w/g).map(h=>parseInt(h,16));return '#'+a.map((v,i)=>Math.round(v+(b[i]-v)*r).toString(16).padStart(2,'0')).join('');}
  const pathOf=pts=>'M'+pts.map(p=>p.map(num).join(' ')).join('L')+'Z';
  function project(point,s,p,depth=0){
    const k=1-p,ry=s.ry*k*Math.PI/180,rx=s.rx*k*Math.PI/180,x=point[0]-s.pivot[0],y=point[1]-s.pivot[1];
    const ax=x*Math.cos(ry),az=-x*Math.sin(ry),by=y*Math.cos(rx)-az*Math.sin(rx),bz=y*Math.sin(rx)+az*Math.cos(rx)+s.z*k+depth;
    const factor=520/(520-bz);
    return [64+(ax+s.pivot[0]+s.dx*k-64)*factor,64+(by+s.pivot[1]+s.dy*k-64)*factor];
  }
  function finalBody(fg,prefix){return `<g id="${prefix}-symbol" fill="${fg}">${G.parts.map(p=>`<g id="${prefix}-${p.id}"><path d="${p.d}"/></g>`).join('')}</g><g id="${prefix}-wordmark" fill="${fg}" transform="${G.wordTransform}">${G.letters.map(l=>`<g id="${prefix}-letter-${l.id}" transform="translate(${l.x} 0)"><path fill-rule="evenodd" d="${l.d}"/></g>`).join('')}</g>`;}
  function animatedBody(t,variant,colors,prefix){
    const tl=timelines[variant],shift=155.4*(1-progress(t,...tl.shift,'glide'));
    let planes='';
    G.parts.forEach((part,i)=>{
      const s=tl.planes[i],p=progress(t,s.start,s.end,variant==='spatial'?'glide':'arrival'),opacity=progress(t,s.start,s.start+.18);
      if(opacity===0)return;
      if(variant==='precision')planes+=`<g id="${prefix}-${part.id}" opacity="${num(opacity)}" transform="translate(${num(s.dx*(1-p))} ${num(s.dy*(1-p))})"><path fill="${colors.foreground}" d="${part.d}"/></g>`;
      else{
        const front=points[i].map(v=>project(v,s,p));
        const back=points[i].map(v=>project(v,s,p,-5*(1-p)));
        const light=.5+.5*Math.abs(Math.cos(s.rx*(1-p)*Math.PI/180)*Math.cos(s.ry*(1-p)*Math.PI/180));
        let sides='';if(p<1)for(let j=0;j<4;j++)sides+=`<path fill="${colorMix(colors.background,colors.foreground,.22)}" d="${pathOf([back[j],back[(j+1)%4],front[(j+1)%4],front[j]])}"/>`;
        planes+=`<g id="${prefix}-${part.id}" opacity="${num(opacity)}">${sides}<path fill="${colorMix(colors.background,colors.foreground,light)}" d="${p===1?part.d:pathOf(front)}"/></g>`;
      }
    });
    const reveal=progress(t,...tl.word,'glide'),clip=variant==='precision'?`<rect x="-2" y="-4" width="${num(414*reveal)}" height="90"/>`:`<path d="M-2-4H${num(440*reveal+12)}L${num(440*reveal-12)} 86H-2Z"/>`;
    const letters=G.letters.map((l,i)=>{const p=progress(t,tl.letters+i*.045,tl.letters+i*.045+.48);return `<g id="${prefix}-letter-${l.id}" opacity="${num(p)}" transform="translate(${l.x} ${num(6*(1-p))})"><path fill-rule="evenodd" d="${l.d}"/></g>`;}).join('');
    return `<g id="${prefix}-symbol" transform="translate(${num(shift)} 0)">${planes}</g><defs><clipPath id="${prefix}-word-reveal">${clip}</clipPath></defs><g id="${prefix}-wordmark" fill="${colors.foreground}" transform="${G.wordTransform}"><g clip-path="url(#${prefix}-word-reveal)">${letters}</g></g>`;
  }
  function render(t,options={}){
    const variant=options.variant||'precision',theme=options.theme||'dark',tl=timelines[variant],colors=palette[theme],prefix=options.id||'forma';
    t=Math.max(0,Math.min(t,tl.duration));
    const body=t>=tl.settle?finalBody(colors.foreground,prefix):animatedBody(t,variant,colors,prefix);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${options.width||960}" height="${options.height||540}" viewBox="0 0 960 540" role="img" aria-label="FORMA ${tl.name}">${options.transparent?'':`<rect width="960" height="540" fill="${colors.background}"/>`}<g id="${prefix}-approved-lockup" transform="translate(260.6 206)">${body}</g></svg>`;
  }
  function staticLockup(theme='dark',prefix='static'){return `<svg xmlns="http://www.w3.org/2000/svg" width="421" height="128" viewBox="0 0 421 128">${finalBody(palette[theme].foreground,prefix)}</svg>`;}
  class Player{
    constructor(host,options={}){
      this.host=host;this.variant=options.variant||'precision';this.theme=options.theme||'dark';this.id=options.id||'player';this.duration=timelines[this.variant].duration;this.time=this.duration;this.playing=false;this.frame=0;this.onUpdate=options.onUpdate||(()=>{});this.metrics=[];
      this.reduce=matchMedia('(prefers-reduced-motion: reduce)');this.preference=()=>{if(this.reduce.matches)this.final();};this.reduce.addEventListener('change',this.preference);
      this.hidden=()=>{if(document.hidden)this.pause();};document.addEventListener('visibilitychange',this.hidden);
      this.observer=new IntersectionObserver(entries=>{if(!entries[0].isIntersecting)this.pause();},{threshold:0});this.observer.observe(host);this.draw();
    }
    draw(){const start=performance.now();this.host.innerHTML=render(this.time,{variant:this.variant,theme:this.theme,id:this.id});this.metrics.push(performance.now()-start);if(this.metrics.length>600)this.metrics.shift();this.onUpdate(this);}
    setTheme(theme){this.theme=theme;this.draw();}
    seek(seconds){this.pause(false);this.time=Math.max(0,Math.min(seconds,this.duration));this.draw();}
    final(){this.seek(this.duration);}
    pause(update=true){cancelAnimationFrame(this.frame);this.playing=false;if(update)this.onUpdate(this);}
    play(){if(this.reduce.matches){this.final();return;}if(this.playing)return;if(this.time>=this.duration)this.time=0;this.playing=true;this.origin=performance.now()-this.time*1000;const tick=now=>{if(!this.playing)return;this.time=Math.min((now-this.origin)/1000,this.duration);this.draw();if(this.time>=this.duration){this.pause();return;}this.frame=requestAnimationFrame(tick);};this.frame=requestAnimationFrame(tick);}
    replay(){if(this.reduce.matches){this.final();return;}this.seek(0);this.play();}
    destroy(){this.pause(false);this.observer.disconnect();this.reduce.removeEventListener('change',this.preference);document.removeEventListener('visibilitychange',this.hidden);}
  }
  const API={render,staticLockup,timelines,palette,Player,progress};
  if(typeof module!=='undefined'&&module.exports)module.exports=API;else global.FORMA_MOTION=API;
})(typeof globalThis!=='undefined'?globalThis:this);
