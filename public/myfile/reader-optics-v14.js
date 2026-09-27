/* Reader 7bd527d: shared night/cold signal graphs, adapted to Call's stationary viewport.
   All graph changes happen on theme/effect/viewport changes, never on hover. */
(() => {
  'use strict';
  const ns='http://www.w3.org/2000/svg';
  const parse=markup=>new DOMParser().parseFromString('<svg xmlns="'+ns+'">'+markup+'</svg>','image/svg+xml').querySelector('filter');
  const instances=new WeakMap(),materialInstances=new WeakMap();
  let nextInstance=0;
  function mountMaterials(scene){
    if(materialInstances.has(scene))return materialInstances.get(scene);
    function surface(className,enabled){
      const current=scene.querySelector('.'+className);
      if(!enabled){current?.remove();return;}
      if(current)return;
      const span=document.createElement('span');
      span.className=className+' call-material-direct-v11';
      span.setAttribute('aria-hidden','true');scene.appendChild(span);
    }
    function sync(){
      const d=document.documentElement.dataset;
      // One painted span, no SVG paths or resize observer for materials.
      // Off removes the effect instead of keeping a transparent texture alive.
      surface('call-fx-day-grain-v7',d.callFxNoise==='true' && d.callTheme!=='dark');
      surface('call-fx-scanlines-v7',d.callFxScanlines==='true');
      d.callReaderOptics='v14';
    }
    sync();
    const api={sync};materialInstances.set(scene,api);return api;
  }
  function mount(scene){
    if(instances.has(scene))return instances.get(scene);
    const id='call-tube-'+(++nextInstance),flatId='call-flat-'+nextInstance;
    const svg=document.createElementNS(ns,'svg');
    svg.classList.add('call-optics-defs-v7','call-reader-optics-defs-v14');
    scene.style.setProperty('--call-active-tube-filter','url(#'+id+')');
    scene.style.setProperty('--call-active-flat-filter','url(#'+flatId+')');
    // Definitions are not a child of the filtered source, nor of an interactive control.
    document.body.appendChild(svg);
    svg.setAttribute('width','0');svg.setAttribute('height','0');svg.setAttribute('aria-hidden','true');
    svg.style.cssText='position:absolute;left:0;top:0;width:0;height:0;pointer-events:none;overflow:hidden';
    const defs=document.createElementNS(ns,'defs');svg.replaceChildren(defs);
    const materials=mountMaterials(scene);
    let graphKey='',sizeKey='',lens,flat;
    function sync(){
      const root=document.documentElement, d=root.dataset;
      const key=d.callTheme==='dark'?'dark:'+d.callPhosphor:d.callTheme+':'+d.callFxRegistration;
      if(key!==graphKey){
        lens=document.importNode(parse(window.CallReaderGraphsV14[key]),true);
        flat=document.importNode(parse(window.CallReaderGraphsV14['flat:'+(d.callTheme==='dark'?d.callPhosphor:'day')]),true);
        lens.setAttribute('id',id);flat.setAttribute('id',flatId);
        defs.replaceChildren(lens,flat);graphKey=key;sizeKey='';
      }
      const width=scene.clientWidth,height=scene.clientHeight;
      const nextSize=width+'x'+height;
      if(nextSize!==sizeKey){
        // SVG defaults can derive intermediate primitive bounds from changing ink.
        // Explicit pixel regions keep the input map and every pass on ONE viewport.
        for(const filter of [lens,flat]){
          filter.setAttribute('filterUnits','userSpaceOnUse');
          filter.setAttribute('primitiveUnits','userSpaceOnUse');
          for(const primitive of [filter,...filter.children]){
            primitive.setAttribute('x','0');primitive.setAttribute('y','0');
            primitive.setAttribute('width',String(width));primitive.setAttribute('height',String(height));
          }
        }
        lens.querySelector('feDisplacementMap').setAttribute('scale',width<=767?'38':'50');
        sizeKey=nextSize;
      }
      materials.sync();scene.dataset.opticalGraph=key;scene.dataset.opticalViewport=nextSize;
    }
    sync();
    if(typeof ResizeObserver==='function')new ResizeObserver(sync).observe(scene);
    const api={sync};instances.set(scene,api);return api;
  }
  window.CallReaderOpticsV14=Object.freeze({mount,mountMaterials});
})();
