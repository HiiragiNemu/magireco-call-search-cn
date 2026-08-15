/* Neo11 mobile V3: stable relationship graph and page-y/table-x touch model. */
(function (global) {
  'use strict';
  const RELEASE = 'neo11-mobile-interaction-v3-20260816';
  const MOBILE = '(max-width: 640px)';
  if (!global.MagirecoNameUtils || !global.__MAGIRECO_CORRECTION_V2__) return;
  const compact = () => global.matchMedia(MOBILE).matches;

  function connectedEdges(network, id) {
    try { return network.getConnectedEdges(id) || []; } catch { return []; }
  }
  function highlight(network, id) {
    if (!network || !id) return;
    try {
      const edges = connectedEdges(network, id);
      if (typeof network.setSelection === 'function') {
        network.setSelection({ nodes: [id], edges }, { unselectAll: true, highlightEdges: true });
      } else network.selectNodes([id], true);
    } catch (error) { console.warn('关系图高亮失败：', error); }
  }

  let settleTimer = 0;
  function settleEdges(network, ms) {
    global.clearTimeout(settleTimer);
    try { network.startSimulation(); } catch { return; }
    settleTimer = global.setTimeout(() => {
      if (network === global.network) try { network.stopSimulation(); } catch { /* no-op */ }
    }, ms);
  }

  const edgeChosen = (values) => { values.color = '#ffffff'; values.width = 4; };
  const edgeLabelChosen = (values) => {
    values.color = '#ff4500'; values.size = compact() ? 17 : 23; values.mod = 'bold'; values.strokeWidth = 5;
  };
  const nodeChosen = (values) => { values.borderWidth = compact() ? 7 : 10; values.borderColor = '#ff42a0'; };
  const nodeLabelChosen = (values) => {
    values.color = '#fff'; values.size = compact() ? 19 : 25; values.strokeColor = '#ff42a0'; values.strokeWidth = 5;
  };

  global.draw = function drawStableRelationNetwork() {
    const container = document.getElementById('mynetwork');
    if (!container || !global.vis) return;
    if (global.network?.destroy) global.network.destroy();
    const mobile = compact();
    const sourceNodes = Array.isArray(global.nodes) ? global.nodes : [];
    const sourceEdges = Array.isArray(global.edges) ? global.edges : [];
    sourceNodes.forEach((node) => { node.physics = false; node.fixed = false; });

    const options = {
      autoResize: true,
      layout: { improvedLayout: false, randomSeed: 23 },
      interaction: {
        dragNodes: true, dragView: true, zoomView: true, hover: true,
        tooltipDelay: 160, multiselect: false, selectConnectedEdges: true
      },
      physics: {
        enabled: true,
        stabilization: { enabled: true, iterations: 50000, updateInterval: 50, fit: false },
        minVelocity: 0.18,
        maxVelocity: 16
      },
      nodes: {
        physics: false, mass: 3, borderWidth: mobile ? 4 : 7, size: mobile ? 30 : 40,
        color: { border: '#ff82c0', background: '#fff', highlight: { border: '#ff42a0', background: '#fff' } },
        font: { color: '#fff', strokeColor: '#ff82c0', size: mobile ? 15 : 22, strokeWidth: 3 },
        chosen: { label: nodeLabelChosen, node: nodeChosen }
      },
      edges: {
        arrows: 'to', width: mobile ? 1.5 : 2,
        color: { color: '#eaeaff', highlight: '#fff', hover: '#ff82c0' },
        font: { color: '#000', size: mobile ? 13 : 22, strokeColor: '#fff', strokeWidth: mobile ? 4 : 3, align: 'middle' },
        smooth: { enabled: true, type: 'dynamic', roundness: 0.25 },
        selfReference: { size: mobile ? 22 : 30 },
        chosen: { label: edgeLabelChosen, edge: edgeChosen }
      }
    };

    global.network = new global.vis.Network(
      container,
      { nodes: sourceNodes.map((node) => ({ ...node, physics: false, fixed: false })), edges: sourceEdges },
      options
    );
    const network = global.network;
    network.once('stabilized', () => {
      if (network !== global.network) return;
      try { network.stopSimulation(); if (sourceNodes.length) network.fit({ animation: false }); } catch { /* no-op */ }
    });
    network.on('dragStart', (params) => {
      const id = params.nodes?.[0];
      if (!id) return;
      try { network.stopSimulation(); } catch { /* no-op */ }
      highlight(network, id);
    });
    network.on('dragEnd', (params) => {
      const id = params.nodes?.[0];
      if (!id) return;
      highlight(network, id);
      settleEdges(network, mobile ? 250 : 320);
    });
    network.on('selectNode', (params) => highlight(network, params.nodes?.[0]));
    network.on('doubleClick', (params) => {
      const chosen = params.nodes?.[0];
      if (!chosen || network !== global.network) return;
      const secondary = sourceNodes.find((node) => node.id === '__second_person__' || node.id === '二人称')?.id;
      const others = sourceNodes.filter((node) => node.id !== chosen && node.id !== secondary);
      const radius = Math.min(380, 145 + others.length * 24);
      network.moveNode(chosen, 0, 0);
      others.forEach((node, index) => {
        const angle = others.length ? 2 * Math.PI * index / others.length : 0;
        network.moveNode(node.id, radius * Math.cos(angle), radius * Math.sin(angle));
      });
      if (secondary) network.moveNode(secondary, radius + 150, radius + 70);
      highlight(network, chosen);
      settleEdges(network, mobile ? 260 : 340);
      network.fit({ animation: { duration: 260, easingFunction: 'easeInOutQuad' } });
    });
    network.on('afterDrawing', (ctx) => {
      try {
        const link = document.getElementById('canvasImgLink');
        if (link) link.href = ctx.canvas.toDataURL('image/jpeg', 0.92);
      } catch (error) { console.warn('关系图图片生成失败：', error); }
    });
    if (typeof global.makeImageName === 'function') global.makeImageName();
  };

  function installHorizontalTouchDrag(viewport) {
    if (!viewport || viewport.dataset.v3TouchDrag === 'true' || !compact()) return;
    viewport.dataset.v3TouchDrag = 'true';
    let startX = 0, startY = 0, startScrollLeft = 0, axis = '';
    viewport.addEventListener('touchstart', (event) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      startX = touch.clientX; startY = touch.clientY; startScrollLeft = viewport.scrollLeft; axis = '';
    }, { passive: true });
    viewport.addEventListener('touchmove', (event) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      const dx = touch.clientX - startX, dy = touch.clientY - startY;
      if (!axis && Math.max(Math.abs(dx), Math.abs(dy)) >= 7) axis = Math.abs(dx) > Math.abs(dy) * 1.15 ? 'x' : 'y';
      if (axis !== 'x') return;
      event.preventDefault();
      viewport.scrollLeft = startScrollLeft - dx;
    }, { passive: false });
    viewport.addEventListener('touchend', () => { axis = ''; }, { passive: true });
    viewport.addEventListener('touchcancel', () => { axis = ''; }, { passive: true });
  }

  function remeasure(stage, surface, scale) {
    if (!stage || !surface) return;
    const width = Math.max(1, surface.scrollWidth, surface.offsetWidth);
    const height = Math.max(1, surface.scrollHeight, surface.offsetHeight);
    surface.dataset.naturalWidth = String(width);
    surface.dataset.naturalHeight = String(height);
    surface.style.transform = `scale(${scale})`;
    stage.style.width = `${Math.ceil(width * scale)}px`;
    stage.style.height = `${Math.ceil(height * scale)}px`;
  }

  function enhanceRelationshipViewport() {
    const viewport = document.querySelector('.relationship-table-viewport');
    const stage = document.querySelector('.relationship-table-stage');
    const surface = document.querySelector('.relationship-table-surface');
    if (!viewport || !stage || !surface) return;
    viewport.dataset.v3ScrollModel = compact() ? 'page-y-inner-x' : 'desktop-box';
    installHorizontalTouchDrag(viewport);
    const hint = document.querySelector('.relationship-scroll-hint-v2');
    if (hint) hint.textContent = compact()
      ? '手机端：上下滑动继续滚动整个页面；左右滑动查看称呼列。可用上方滑块缩放整张表。'
      : '桌面端默认适应浏览器宽度；需要时可缩放或在表格内横向滚动。';
    if (compact()) {
      viewport.style.removeProperty('height');
      remeasure(stage, surface, global.__MAGIRECO_CORRECTION_V2__.relationState.scale);
    }
  }

  const baseDrawNetTable = global.drawNet_Table;
  if (typeof baseDrawNetTable === 'function') {
    global.drawNet_Table = function drawNetTableV3() {
      const result = baseDrawNetTable.apply(this, arguments);
      global.requestAnimationFrame(enhanceRelationshipViewport);
      return result;
    };
  }

  global.addEventListener('resize', () => global.requestAnimationFrame(enhanceRelationshipViewport), { passive: true });
  global.__MAGIRECO_CORRECTION_V3__ = Object.assign(global.__MAGIRECO_CORRECTION_V3__ || {}, {
    release: RELEASE,
    network: true,
    enhanceRelationshipViewport,
    installHorizontalTouchDrag,
    remeasure
  });
})(window);
