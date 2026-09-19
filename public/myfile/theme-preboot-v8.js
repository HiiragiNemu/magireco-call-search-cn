(() => {
  'use strict';
  const root=document.documentElement;
  const valid=new Set(['light','paper','green','dark','frost']);
  const get=(k)=>{try{return localStorage.getItem(k)}catch(_){return null}};
  let theme=get('magireco-call-theme-v2');
  if(!valid.has(theme)){
    const legacy=get('magireco-call-theme-v1');
    theme=legacy==='dark'||legacy==='light'?legacy:(matchMedia?.('(prefers-color-scheme: dark)').matches?'dark':'paper');
  }
  const defaults={
    light:{curvature:false,scanlines:false,noise:true,pixelFont:false,registration:false},
    paper:{curvature:false,scanlines:false,noise:true,pixelFont:false,registration:false},
    green:{curvature:false,scanlines:true,noise:true,pixelFont:false,registration:false},
    dark:{curvature:true,scanlines:true,noise:true,pixelFont:true,registration:true},
    frost:{curvature:true,scanlines:true,noise:true,pixelFont:true,registration:false}
  };
  let state={};
  try{state=JSON.parse(get('magireco-call-visual-v7-4')||'{}')||{}}catch(_){state={}};
  const effects={...defaults[theme],...(state.effects?.[theme]||{})};
  if(theme==='dark'){
    effects.curvature=true;effects.scanlines=true;effects.noise=true;effects.registration=true;
  }
  if(theme==='frost') effects.registration=false;
  root.dataset.callTheme=theme;
  root.dataset.callPhosphor=state.phosphor==='amber'?'amber':'green';
  root.dataset.callThemeBarMode=state.themeBarMode==='floating'?'floating':'top';
  root.dataset.callPreboot='true';
  root.style.colorScheme=(theme==='dark'||theme==='frost')?'dark':'light';
  for(const [key,value] of Object.entries(effects)){
    root.dataset['callFx'+key[0].toUpperCase()+key.slice(1)]=String(Boolean(value));
  }
})();