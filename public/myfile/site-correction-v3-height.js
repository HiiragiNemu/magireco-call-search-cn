/* Neo11 mobile V3: dual fixed cm rulers and character-coloured local height guides. */
(function (global) {
  'use strict';
  const RELEASE = 'neo11-mobile-interaction-v3-20260816';
  const MOBILE = '(max-width: 640px)';
  const V3 = global.__MAGIRECO_CORRECTION_V3__;
  if (!V3 || !global.__MAGIRECO_CORRECTION_V2__) return;
  const compact = () => global.matchMedia(MOBILE).matches;

  const CHARACTER_COLORS = new Map(Object.entries({
    '鹿目圆':'#FA71BD','晓美焰':'#B56ABF','巴麻美':'#EA9C54','美树沙耶香':'#64C5E6','佐仓杏子':'#E64545',
    '百江渚':'#B192C0','爱生眩':'#EBA4F0','环彩羽':'#F57689','七海八千代':'#1A9AB7','由比鹤乃':'#FF5F4B',
    '二叶莎奈':'#6DD1B5','深月菲莉希亚':'#8D6AD2','梓美冬':'#7C8AA7','十咎桃子':'#FC7459','水波玲奈':'#9BDAEB',
    '秋野枫':'#CE3225','御园花凛':'#FFCF3D','龙城明日香':'#4A8DE4','里见灯花':'#E73D24','柊音梦':'#EAB088',
    '阿莉娜·格雷':'#CCF02A','环忧':'#D14C69','八云御魂':'#3D78C1','天音月夜':'#EF3775','天音月咲':'#EF3775',
    '空穗夏希':'#B8DAFF','常盘七香':'#FF5B7E','夏目佳子':'#53FEC9','纯美雨':'#4E80C2','伊吹丽良':'#E38D84',
    '桑水清佳':'#8AA5CA','相野未都':'#7DAC7C','粟根心':'#AAF43B','更纱帆奈':'#ED7CA2','真尾日美香':'#D14969',
    '五十铃怜':'#5564A7','静海木叶':'#6E29FF','游佐叶月':'#FBDD00','三栗菖蒲':'#8CE70E','加贺见真良':'#8ABAF0',
    '绫野梨花':'#EF4D77','千秋理子':'#39ADE1','安名梅露':'#4EF6D5','万年樱之谣':'#FFAEDC','雪野加奈惠':'#EB4877',
    '阿什莉·泰勒':'#FF4227','入名库什':'#EB2B28','美国织莉子':'#D7DAE6','吴纪里香':'#A79DD6','千岁由麻':'#ACCDA1',
    '浅古小糸':'#FF61CC'
  }));

  function hash(value) {
    let result = 2166136261;
    for (const ch of String(value || '')) { result ^= ch.codePointAt(0); result = Math.imul(result, 16777619); }
    return result >>> 0;
  }
  const stripVariant = (name) => String(name || '')
    .replace(/[-－]眼镜ver\.?$/u, '')
    .replace(/[（(][^）)]*(?:ver|版本|装束|scene0)[^）)]*[）)]$/iu, '')
    .replace(/\s+/gu, '').trim();
  function characterColor(name) {
    const exact = String(name || '').trim();
    const base = stripVariant(exact);
    if (CHARACTER_COLORS.has(exact)) return CHARACTER_COLORS.get(exact);
    if (CHARACTER_COLORS.has(base)) return CHARACTER_COLORS.get(base);
    const value = hash(exact || 'unknown');
    return `hsl(${value % 360} ${60 + ((value >>> 8) % 18)}% ${42 + ((value >>> 16) % 13)}%)`;
  }
  function darken(color) {
    const match = String(color).match(/^#([0-9a-f]{6})$/iu);
    if (!match) return color;
    const value = Number.parseInt(match[1], 16);
    let r = value >>> 16 & 255, g = value >>> 8 & 255, b = value & 255;
    if ((.2126*r + .7152*g + .0722*b)/255 > .72) { r*=.72; g*=.72; b*=.72; }
    return `#${[r,g,b].map((part)=>Math.round(part).toString(16).padStart(2,'0')).join('')}`;
  }
  function alphaColor(color, alpha) {
    const match = String(color).match(/^#([0-9a-f]{6})$/iu);
    if (!match) return color;
    const value = Number.parseInt(match[1], 16);
    return `rgba(${value>>>16&255}, ${value>>>8&255}, ${value&255}, ${alpha})`;
  }
  const px = (value) => Number.parseFloat(String(value || '')) || 0;

  function axisLabel(axis) {
    let label = axis.querySelector('.height-active-y-label-v3');
    if (!label) { label = document.createElement('span'); label.className = 'height-active-y-label-v3'; axis.appendChild(label); }
    return label;
  }
  function showActive(activeGuide, leftAxis, rightAxis, point, color) {
    const y = px(point.style.top), height = point.dataset.height || '', name = point.dataset.character || point.querySelector('img')?.alt || '';
    activeGuide.style.display = 'block'; activeGuide.style.top = `${y}px`; activeGuide.style.borderTopColor = color;
    activeGuide.querySelector('.height-active-guide-label-v3').textContent = `${name} · ${height}cm`;
    for (const axis of [leftAxis, rightAxis]) {
      const label = axisLabel(axis); label.style.display = 'block'; label.style.top = `${y}px`; label.style.color = color; label.textContent = `${height}cm`;
    }
  }
  function hideActive(activeGuide, leftAxis, rightAxis) {
    activeGuide.style.display = 'none';
    for (const axis of [leftAxis, rightAxis]) { const label = axis.querySelector('.height-active-y-label-v3'); if (label) label.style.display = 'none'; }
  }

  function categoryBounds(plot) {
    const width = Math.max(px(plot.style.width), plot.clientWidth, plot.scrollWidth);
    const starts = [...plot.querySelectorAll('.height-category-column-v2')].map((el)=>px(el.style.left)).sort((a,b)=>a-b);
    if (!starts.length || starts[0] !== 0) starts.unshift(0);
    const unique = starts.filter((value,index)=>index===0 || value!==starts[index-1]); unique.push(width);
    return { width, starts: unique };
  }
  function boundsForX(bounds, x) {
    for (let i=0;i<bounds.starts.length-1;i++) if (x>=bounds.starts[i] && x<=bounds.starts[i+1]) return [bounds.starts[i],bounds.starts[i+1]];
    return [0,bounds.width];
  }

  function syncRulers(viewport, leftAxis, rightAxis) {
    if (!viewport || !leftAxis || !rightAxis) return;
    const scale = global.__MAGIRECO_CORRECTION_V2__.heightState.scale || 1;
    leftAxis.style.transform = `translateX(${viewport.scrollLeft/scale-leftAxis.offsetLeft}px)`;
    if (viewport.dataset.selectedHeightV11 === 'true') {
      rightAxis.style.transform = 'translateX(0px)';
      return;
    }
    const axisWidth = rightAxis.offsetWidth || leftAxis.offsetWidth || 66;
    const viewportRight = (viewport.scrollLeft + viewport.clientWidth) / scale - axisWidth;
    const desired = Math.min(rightAxis.offsetLeft, viewportRight);
    rightAxis.style.transform = `translateX(${desired-rightAxis.offsetLeft}px)`;
  }
  const scheduleSync = (viewport,left,right) => global.requestAnimationFrame(()=>syncRulers(viewport,left,right));

  function enhanceHeightChart() {
    const viewport = document.querySelector('.height-chart-viewport-v2');
    const stage = document.querySelector('.height-chart-stage-v2');
    const surface = document.querySelector('.height-chart-surface-v2');
    const plot = document.querySelector('.height-plot-v2');
    const leftAxis = document.querySelector('.height-y-axis-v2');
    if (!viewport || !stage || !surface || !plot || !leftAxis || surface.dataset.v3Enhanced === 'true') return;
    surface.dataset.v3Enhanced = 'true';
    viewport.dataset.v3ScrollModel = compact() ? 'page-y-inner-x' : 'desktop-box';
    V3.installHorizontalTouchDrag(viewport);
    leftAxis.classList.add('height-y-axis-left-v3'); leftAxis.style.gridColumn = '1';

    const columns = surface.style.gridTemplateColumns.trim().split(/\s+/u);
    const axisColumn = columns[0] || `${compact()?66:80}px`;
    const plotColumn = columns.slice(1).join(' ') || `${Math.max(plot.scrollWidth,plot.clientWidth)}px`;
    surface.style.gridTemplateColumns = `${axisColumn} ${plotColumn} ${axisColumn}`;
    const rightAxis = leftAxis.cloneNode(true);
    rightAxis.classList.remove('height-y-axis-left-v3'); rightAxis.classList.add('height-y-axis-right-v3'); rightAxis.style.gridColumn = '3';
    rightAxis.querySelector('.height-active-y-label-v3')?.remove();
    const spacer = document.createElement('div'); spacer.className = 'height-x-axis-spacer-right-v3'; spacer.style.gridColumn = '3';
    surface.append(rightAxis, spacer);

    const activeGuide = document.createElement('div'); activeGuide.className = 'height-active-guide-v3';
    const activeText = document.createElement('span'); activeText.className = 'height-active-guide-label-v3'; activeGuide.appendChild(activeText); plot.appendChild(activeGuide);
    const bounds = categoryBounds(plot);
    const guidesByName = new Map();
    for (const guide of plot.querySelectorAll('.height-point-guide-v2')) {
      const list = guidesByName.get(guide.dataset.character) || []; list.push(guide); guidesByName.set(guide.dataset.character,list);
    }
    const used = new Map();
    for (const point of plot.querySelectorAll('.height-point-v2')) {
      const name = point.dataset.character || point.querySelector('img')?.alt || '';
      const pointColor = characterColor(name), lineColor = darken(pointColor), value = hash(name);
      const opacity = .48 + ((value>>>7)%24)/100;
      point.style.setProperty('--character-color',pointColor); point.dataset.characterColor = pointColor;
      const list = guidesByName.get(name) || [], index = used.get(name) || 0, guide = list[index] || list[0]; used.set(name,index+1);
      if (guide) {
        const x = px(point.style.left), [start,end] = boundsForX(bounds,x);
        guide.style.left = `${start+4}px`;
        guide.style.width = `${Math.max(12,Math.min(end-start-8,x-start-4))}px`;
        guide.style.borderTopColor = alphaColor(lineColor,opacity);
        guide.style.borderTopStyle = ['solid','dashed','dotted'][(value>>>15)%3];
        guide.style.setProperty('--guide-opacity',String(Math.min(.86,opacity+.08)));
        guide.dataset.v3LocalStart = String(start); guide.dataset.v3LocalEnd = String(end); guide.dataset.v3GuideColor = lineColor;
      }
      const activate = () => showActive(activeGuide,leftAxis,rightAxis,point,lineColor);
      point.addEventListener('click',activate); point.addEventListener('focus',activate);
      point.addEventListener('pointerdown',()=>{point.style.zIndex='24';});
    }
    viewport.addEventListener('click',(event)=>{if(!event.target.closest('.height-point-v2')) hideActive(activeGuide,leftAxis,rightAxis);});
    const sync = () => scheduleSync(viewport,leftAxis,rightAxis);
    viewport.addEventListener('scroll',sync,{passive:true});
    const controls = document.querySelector('.height-zoom-controls-v2');
    controls?.addEventListener('input',sync,{passive:true}); controls?.addEventListener('click',sync);
    if (compact()) viewport.style.removeProperty('height');
    V3.remeasure(stage,surface,global.__MAGIRECO_CORRECTION_V2__.heightState.scale);
    scheduleSync(viewport,leftAxis,rightAxis);
  }

  const baseDisplay = global.displayHeightChart;
  if (typeof baseDisplay === 'function') global.displayHeightChart = function displayHeightChartV3() {
    const result = baseDisplay.apply(this,arguments); global.requestAnimationFrame(enhanceHeightChart); return result;
  };
  global.addEventListener('resize',()=>global.requestAnimationFrame(()=>{
    const viewport=document.querySelector('.height-chart-viewport-v2'), surface=document.querySelector('.height-chart-surface-v2');
    const stage=document.querySelector('.height-chart-stage-v2'), left=document.querySelector('.height-y-axis-left-v3'), right=document.querySelector('.height-y-axis-right-v3');
    if(surface?.dataset.v3Enhanced==='true'){V3.remeasure(stage,surface,global.__MAGIRECO_CORRECTION_V2__.heightState.scale);syncRulers(viewport,left,right);}
  }),{passive:true});

  Object.assign(V3,{release:RELEASE,height:true,CHARACTER_COLORS,characterColor,enhanceHeightChart,syncRulers});
})(window);
