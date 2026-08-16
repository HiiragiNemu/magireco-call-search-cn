/* Corrective production renderer: responsive table scaling, restored network physics,
 * collision-free height chart and exact per-character height guides. */
(function (global) {
  'use strict';

  const U = global.MagirecoNameUtils;
  if (!U) {
    console.error('MagirecoNameUtils was not loaded.');
    return;
  }

  const META_KEYS = U.META_KEYS;
  const SECOND_PERSON_ID = '__second_person__';
  const MOBILE_QUERY = '(max-width: 640px)';

  const SCHOOL_DEFINITIONS = [
    ['神浜市立大附属', '神滨市立大学附属学校'],
    ['水名女学園', '水名女子学园'],
    ['参京院教育学園', '参京院教育学园'],
    ['栄総合学園', '荣综合学园'],
    ['中央学園', '中央学园'],
    ['南凪自由学園', '南凪自由学园'],
    ['工匠学舎', '工匠学舍'],
    ['大東学院', '大东学院'],
    ['聖リリアンナ学園', '圣莉莉安娜学园'],
    ['神浜未来アカデミー', '神滨未来学院'],
    ['湯の花国際中学・高等学校', '汤之花国际中学・高等学校'],
    ['松宮市立第一中学校', '松宫市立第一中学'],
    ['霧峰村立霧峰中学校', '雾峰村立雾峰中学'],
    ['虎屋町学園', '虎屋町学园'],
    ['竜ケ崎学院', '龙崎学院'],
    ['蛇の宮中学・高等学校', '蛇之宫中学・高等学校'],
    ['宝崎順心学園', '宝崎顺心学园'],
    ['宝崎市立光塚中等教育学校', '宝崎市立光冢中等教育学校'],
    ['見滝原中学校', '见泷原中学'],
    ['白羽女学院', '白羽女学院'],
    ['あすなろ市立南部中学校', '翌桧市立南部中学'],
    ['茜ヶ咲中学校', '茜咲中学'],
    ['聖乙女学園', '圣乙女学园'],
    ['その他学校', '其他学校'],
    ['__NO_SCHOOL__', '无学校信息']
  ];

  const ORGANIZATION_DEFINITIONS = [
    ['マギアユニオン', '神滨魔法联盟'],
    ['時女一族', '时女一族'],
    ['プロミストブラッド', 'PROMISED BLOOD'],
    ['ネオマギウス', 'Neo-Magius'],
    ['フォークロア', 'Folklore of 0'],
    ['ピュエラケア', 'Puella Care'],
    ['ヒストリア', '历史篇'],
    ['__NO_ORGANIZATION__', '无从属组织信息']
  ];

  const GRADE_DEFINITIONS = [
    ['小学生', '小学生'],
    ['中1', '初一'],
    ['中2', '初二'],
    ['中3', '初三'],
    ['中学生', '初中生'],
    ['高1', '高一'],
    ['高2', '高二'],
    ['高3', '高三'],
    ['高校生', '高中生'],
    ['その他', '其他'],
    ['学年不明', '年级不详']
  ];

  const GRADE_VALUE_MAP = new Map([
    ['初一', ['中1', '中学生']],
    ['初二', ['中2', '中学生']],
    ['初三', ['中3', '中学生']],
    ['中1', ['中1', '中学生']],
    ['中2', ['中2', '中学生']],
    ['中3', ['中3', '中学生']],
    ['高一', ['高1', '高校生']],
    ['高二', ['高2', '高校生']],
    ['高三', ['高3', '高校生']],
    ['高1', ['高1', '高校生']],
    ['高2', ['高2', '高校生']],
    ['高3', ['高3', '高校生']]
  ]);

  const relationState = {
    scale: global.matchMedia(MOBILE_QUERY).matches ? 0.62 : 1,
    mode: global.matchMedia(MOBILE_QUERY).matches ? 'manual' : 'fit',
    viewportVh: global.matchMedia(MOBILE_QUERY).matches ? 66 : 70
  };

  const heightState = {
    dataSource: 'global',
    xMode: 'age',
    viewMode: 'scatter',
    scale: 0.5,
    mode: 'manual'
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || min));
  }

  function parseNumber(value) {
    const match = String(value || '').match(/\d+(?:\.\d+)?/u);
    return match ? Number(match[0]) : NaN;
  }

  function getDisplayOptions() {
    if (typeof global.getCallDisplayOptions === 'function') return global.getCallDisplayOptions();
    return { japanese: true, romaji: true, chinese: true };
  }

  function formatName(value, fallback, options) {
    if (typeof global.formatNameText === 'function') {
      return global.formatNameText(value, options) || fallback || '';
    }
    return value || fallback || '';
  }

  function formatCall(value, options) {
    if (typeof global.formatCallText === 'function') return global.formatCallText(value || '', options);
    return String(value || '');
  }

  function formatNode(value, fallback, options) {
    if (typeof global.formatNodeLabel === 'function') return global.formatNodeLabel(value, fallback, options);
    return formatName(value, fallback, options).replace(/\s*\(/u, '\n(');
  }

  function secondPersonLabel(options) {
    if (typeof global.getSecondPersonNodeLabel === 'function') return global.getSecondPersonNodeLabel(options);
    return options.romaji && !options.chinese && !options.japanese ? 'second person' : '二人称';
  }

  function imageNameFor(canonical, checkbox) {
    if (checkbox) return U.getDisplayShortName(checkbox.value);
    if (canonical === '晓美焰(眼镜ver)') return '晓美焰-眼镜ver';
    if (canonical === '名字') return '名小姐';
    if (canonical === '水树塁') return '水树垒';
    return canonical;
  }

  function getSelectedEntries() {
    const keyIndex = U.buildCallTableKeyIndex();
    const entries = [];
    const orderedCheckboxes = typeof global.getSelectedCharacterCheckboxesInOrder === 'function'
      ? global.getSelectedCharacterCheckboxesInOrder()
      : U.getCharacterCheckboxes();
    for (const checkbox of orderedCheckboxes) {
      if (!checkbox.checked) continue;
      const canonical = U.canonicalFromCheckbox(checkbox);
      if (!canonical || entries.some((item) => item.canonical === canonical)) continue;
      entries.push({
        checkbox,
        canonical,
        htmlValue: checkbox.value,
        callKey: keyIndex.get(canonical) || null,
        imageName: imageNameFor(canonical, checkbox)
      });
    }
    return entries;
  }

  function getAllHeightEntries(dataSource) {
    if (dataSource === 'selected') return getSelectedEntries();
    if (typeof callTable === 'undefined' || !(callTable instanceof Map)) return [];
    const checkboxIndex = U.buildCheckboxIndex().byCanonical;
    return Array.from(callTable.keys()).map((key) => {
      const canonical = U.normalizeShortName(key);
      const checkbox = checkboxIndex.get(canonical) || null;
      return {
        checkbox,
        canonical,
        htmlValue: checkbox ? checkbox.value : key,
        callKey: key,
        imageName: imageNameFor(canonical, checkbox)
      };
    });
  }

  function detailsForEntry(entry) {
    return entry.callKey && typeof callTable !== 'undefined' && callTable instanceof Map ? callTable.get(entry.callKey) : null;
  }

  function canonicalRelations(details) {
    const result = new Map();
    if (!(details instanceof Map)) return result;
    for (const [key, value] of details) {
      if (!META_KEYS.has(key)) result.set(U.normalizeShortName(key), value);
    }
    return result;
  }

  function setResetButtonsDisabled(disabled) {
    for (const id of ['mgreset', 'mgreset2']) {
      const button = document.getElementById(id);
      if (button) button.disabled = disabled;
    }
  }

  function addCell(row, tag, text) {
    const cell = document.createElement(tag);
    cell.textContent = text || '';
    row.appendChild(cell);
    return cell;
  }

  function makeButton(text, label, handler) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    if (label) button.setAttribute('aria-label', label);
    button.addEventListener('click', handler);
    return button;
  }

  function measureNatural(element) {
    if (!element) return { width: 1, height: 1 };
    const width = Math.max(1, element.scrollWidth, element.offsetWidth, element.getBoundingClientRect().width);
    const height = Math.max(1, element.scrollHeight, element.offsetHeight, element.getBoundingClientRect().height);
    return { width, height };
  }

  function applyScaledStage(stage, surface, scale) {
    if (!stage || !surface) return;
    const natural = measureNatural(surface);
    surface.dataset.naturalWidth = String(natural.width);
    surface.dataset.naturalHeight = String(natural.height);
    surface.style.transform = `scale(${scale})`;
    stage.style.width = `${Math.ceil(natural.width * scale)}px`;
    stage.style.height = `${Math.ceil(natural.height * scale)}px`;
  }

  function refreshRelationReadout() {
    const readout = document.querySelector('[data-relation-scale-readout]');
    if (readout) readout.textContent = `${Math.round(relationState.scale * 100)}%`;
    const range = document.querySelector('[data-relation-scale-range]');
    if (range) range.value = String(Math.round(relationState.scale * 100));
    const heightReadout = document.querySelector('[data-relation-height-readout]');
    if (heightReadout) heightReadout.textContent = `${relationState.viewportVh}vh`;
    const heightRange = document.querySelector('[data-relation-height-range]');
    if (heightRange) heightRange.value = String(relationState.viewportVh);
  }

  function applyRelationScale(scale, mode) {
    relationState.scale = clamp(scale, 0.25, 1.6);
    if (mode) relationState.mode = mode;
    const stage = document.querySelector('.relationship-table-stage');
    const surface = document.querySelector('.relationship-table-surface');
    applyScaledStage(stage, surface, relationState.scale);
    refreshRelationReadout();
  }

  function fitRelationTable() {
    const viewport = document.querySelector('.relationship-table-viewport');
    const surface = document.querySelector('.relationship-table-surface');
    if (!viewport || !surface) return;
    const natural = measureNatural(surface);
    const scale = clamp((viewport.clientWidth - 4) / natural.width, 0.25, 1);
    applyRelationScale(scale, 'fit');
    viewport.scrollLeft = 0;
  }

  function buildRelationshipControls(host) {
    const controls = document.createElement('div');
    controls.className = 'relationship-table-controls';

    controls.appendChild(makeButton('适应宽度', '将完整称呼表缩放到当前浏览器宽度', fitRelationTable));
    controls.appendChild(makeButton('−', '缩小称呼表', () => applyRelationScale(relationState.scale - 0.08, 'manual')));

    const range = document.createElement('input');
    range.type = 'range';
    range.min = '25';
    range.max = '160';
    range.step = '5';
    range.dataset.relationScaleRange = '';
    range.value = String(Math.round(relationState.scale * 100));
    range.setAttribute('aria-label', '称呼表缩放比例');
    range.addEventListener('input', () => applyRelationScale(Number(range.value) / 100, 'manual'));
    controls.appendChild(range);

    controls.appendChild(makeButton('＋', '放大称呼表', () => applyRelationScale(relationState.scale + 0.08, 'manual')));
    controls.appendChild(makeButton('100%', '恢复称呼表原始大小', () => applyRelationScale(1, 'manual')));

    const scaleReadout = document.createElement('span');
    scaleReadout.dataset.relationScaleReadout = '';
    controls.appendChild(scaleReadout);

    const heightWrap = document.createElement('label');
    heightWrap.className = 'relationship-height-control';
    heightWrap.appendChild(document.createTextNode('框高'));
    const heightRange = document.createElement('input');
    heightRange.type = 'range';
    heightRange.min = '45';
    heightRange.max = '90';
    heightRange.step = '5';
    heightRange.value = String(relationState.viewportVh);
    heightRange.dataset.relationHeightRange = '';
    heightRange.setAttribute('aria-label', '称呼表显示框高度');
    heightRange.addEventListener('input', () => {
      relationState.viewportVh = Number(heightRange.value);
      const viewport = document.querySelector('.relationship-table-viewport');
      if (viewport) viewport.style.height = `${relationState.viewportVh}vh`;
      refreshRelationReadout();
    });
    heightWrap.appendChild(heightRange);
    const heightReadout = document.createElement('span');
    heightReadout.dataset.relationHeightReadout = '';
    heightWrap.appendChild(heightReadout);
    controls.appendChild(heightWrap);

    const hint = document.createElement('span');
    hint.className = 'relationship-scroll-hint-v2';
    hint.textContent = '桌面端默认完整适配浏览器宽度；手机端可缩放整个称呼表，并在框内上下左右滑动。';
    controls.appendChild(hint);

    host.appendChild(controls);
    refreshRelationReadout();
  }

  function buildRelationshipTable(entries, options) {
    const table = document.createElement('table');
    table.id = 'girltable';

    const thead = document.createElement('thead');
    const header = document.createElement('tr');
    addCell(header, 'th', '↓ 称呼者　被称呼者 →');
    addCell(header, 'th', '第一人称');
    addCell(header, 'th', '第二人称');
    for (const entry of entries) addCell(header, 'th', formatName(entry.htmlValue, entry.canonical, options));
    thead.appendChild(header);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (const caller of entries) {
      const row = document.createElement('tr');
      addCell(row, 'th', formatName(caller.htmlValue, caller.canonical, options));
      const details = detailsForEntry(caller);
      addCell(row, 'td', formatCall(details instanceof Map ? details.get('第一人称') : '', options));
      addCell(row, 'td', formatCall(details instanceof Map ? details.get('二人称') : '', options));
      const relations = canonicalRelations(details);
      for (const callee of entries) {
        const value = caller.canonical === callee.canonical ? '—' : formatCall(relations.get(callee.canonical) || '', options);
        addCell(row, 'td', value);
      }
      tbody.appendChild(row);
    }
    table.appendChild(tbody);
    return table;
  }

  function renderRelationshipTable(entries, options) {
    const host = document.getElementById('mytable');
    if (!host) return;
    host.replaceChildren();
    buildRelationshipControls(host);

    const viewport = document.createElement('div');
    viewport.className = 'relationship-table-viewport';
    viewport.style.height = `${relationState.viewportVh}vh`;

    const stage = document.createElement('div');
    stage.className = 'relationship-table-stage';
    const surface = document.createElement('div');
    surface.className = 'relationship-table-surface';
    surface.appendChild(buildRelationshipTable(entries, options));
    stage.appendChild(surface);
    viewport.appendChild(stage);
    host.appendChild(viewport);

    requestAnimationFrame(() => {
      if (relationState.mode === 'fit' && !global.matchMedia(MOBILE_QUERY).matches) fitRelationTable();
      else applyRelationScale(relationState.scale, relationState.mode);
    });
  }

  function makeSafeImageFilename() {
    const names = getSelectedEntries().map((entry) => entry.canonical);
    const stem = names.length
      ? `称呼关系_${names.slice(0, 8).join('_')}${names.length > 8 ? `_等${names.length}人` : ''}`
      : '称呼关系';
    return stem.replace(/[\\/:*?"<>|]+/gu, '_').slice(0, 110) + '.jpg';
  }

  global.makeImageName = function makeImageNameCorrected() {
    const link = document.getElementById('canvasImgLink');
    if (link) link.download = makeSafeImageFilename();
  };

  global.drawNet_Table = function drawNetTableCorrected() {
    const entries = getSelectedEntries();
    const options = getDisplayOptions();

    if (global.network && typeof global.network.destroy === 'function') global.network.destroy();
    global.network = null;
    global.nodes = [];
    global.edges = [];

    if (!entries.length) {
      setResetButtonsDisabled(true);
      const host = document.getElementById('mytable');
      if (host) host.replaceChildren();
      global.draw();
      return;
    }

    setResetButtonsDisabled(false);
    renderRelationshipTable(entries, options);

    const count = entries.length;
    const radius = count <= 2 ? 150 : Math.min(440, 170 + count * 24);
    entries.forEach((entry, index) => {
      const angle = count > 1 ? (2 * Math.PI * index) / count : 0;
      global.nodes.push({
        id: entry.canonical,
        shape: 'circularImage',
        image: `./img/png/${entry.imageName}.png`,
        label: formatNode(entry.htmlValue, entry.canonical, options),
        x: count > 1 ? radius * Math.cos(angle) : 0,
        y: count > 1 ? radius * Math.sin(angle) : 0,
        physics: true
      });
    });

    for (const caller of entries) {
      const details = detailsForEntry(caller);
      const relations = canonicalRelations(details);
      for (const callee of entries) {
        if (caller.canonical === callee.canonical) continue;
        const raw = relations.get(callee.canonical);
        if (raw) {
          global.edges.push({
            from: caller.canonical,
            to: callee.canonical,
            label: formatCall(raw, options)
          });
        }
      }
      if (details instanceof Map && details.get('第一人称')) {
        global.edges.push({
          from: caller.canonical,
          to: caller.canonical,
          label: formatCall(details.get('第一人称'), options)
        });
      }
    }

    global.nodes.push({
      id: SECOND_PERSON_ID,
      shape: 'circularImage',
      image: './img/png/二人称.png',
      label: secondPersonLabel(options),
      x: radius + 170,
      y: radius + 90,
      physics: true
    });
    for (const entry of entries) {
      const details = detailsForEntry(entry);
      if (details instanceof Map && details.get('二人称')) {
        global.edges.push({
          from: entry.canonical,
          to: SECOND_PERSON_ID,
          label: formatCall(details.get('二人称'), options)
        });
      }
    }

    global.draw();
  };

  global.draw = function drawNetworkWithPhysics() {
    const container = document.getElementById('mynetwork');
    if (!container || typeof global.vis === 'undefined') return;
    if (global.network && typeof global.network.destroy === 'function') global.network.destroy();

    const compact = global.matchMedia(MOBILE_QUERY).matches;
    const data = { nodes: global.nodes || [], edges: global.edges || [] };
    const options = {
      autoResize: true,
      layout: { improvedLayout: true, randomSeed: 23 },
      interaction: {
        dragNodes: true,
        dragView: true,
        zoomView: true,
        hover: true,
        tooltipDelay: 160,
        multiselect: false
      },
      physics: {
        enabled: true,
        solver: 'barnesHut',
        barnesHut: {
          gravitationalConstant: compact ? -1550 : -2100,
          centralGravity: 0.16,
          springLength: compact ? 130 : 165,
          springConstant: 0.055,
          damping: 0.16,
          avoidOverlap: 0.72
        },
        maxVelocity: 36,
        minVelocity: 0.08,
        stabilization: {
          enabled: true,
          iterations: compact ? 250 : 380,
          updateInterval: 25,
          fit: true
        }
      },
      nodes: {
        physics: true,
        mass: 3,
        borderWidth: compact ? 4 : 7,
        size: compact ? 30 : 40,
        color: {
          border: '#ff82c0',
          background: '#ffffff',
          highlight: { border: '#ff42a0', background: '#ffffff' }
        },
        font: {
          color: '#ffffff',
          strokeColor: '#ff42a0',
          size: compact ? 15 : 20,
          strokeWidth: compact ? 3 : 4
        }
      },
      edges: {
        arrows: 'to',
        width: compact ? 1.5 : 2,
        color: {
          color: '#d8d8ef',
          highlight: '#ff42a0',
          hover: '#ff82c0'
        },
        font: {
          color: '#111111',
          size: compact ? 13 : 18,
          strokeColor: '#ffffff',
          strokeWidth: 4,
          align: 'middle'
        },
        smooth: { enabled: true, type: 'dynamic', roundness: 0.25 },
        selfReference: { size: compact ? 22 : 30 }
      }
    };

    global.network = new global.vis.Network(container, data, options);
    let fitted = false;
    global.network.once('stabilized', () => {
      if (!fitted && global.network) {
        fitted = true;
        global.network.fit({ animation: { duration: 260, easingFunction: 'easeInOutQuad' } });
      }
    });
    global.network.on('dragEnd', (params) => {
      if (params.nodes && params.nodes.length && global.network) global.network.startSimulation();
    });
    global.network.on('afterDrawing', (context) => {
      try {
        const link = document.getElementById('canvasImgLink');
        if (link) link.href = context.canvas.toDataURL('image/jpeg', 0.92);
      } catch (error) {
        console.warn('关系图图片生成失败：', error);
      }
    });
    global.network.on('doubleClick', (params) => {
      const chosen = params.nodes && params.nodes[0];
      if (!chosen || !global.network) return;
      const others = (global.nodes || []).filter((node) => node.id !== chosen && node.id !== SECOND_PERSON_ID);
      const radius = Math.min(380, 145 + others.length * 24);
      global.network.moveNode(chosen, 0, 0);
      others.forEach((node, index) => {
        const angle = others.length ? (2 * Math.PI * index) / others.length : 0;
        global.network.moveNode(node.id, radius * Math.cos(angle), radius * Math.sin(angle));
      });
      if ((global.nodes || []).some((node) => node.id === SECOND_PERSON_ID)) {
        global.network.moveNode(SECOND_PERSON_ID, radius + 150, radius + 70);
      }
      global.network.selectNodes([chosen]);
      global.network.startSimulation();
      global.network.fit({ animation: { duration: 300, easingFunction: 'easeInOutQuad' } });
    });

    if ((global.nodes || []).length) global.network.startSimulation();
    global.makeImageName();
  };

  global.girlReset = function girlResetCorrected() {
    for (const checkbox of U.getCharacterCheckboxes()) checkbox.checked = false;
    global.nodes = [];
    global.edges = [];
    const host = document.getElementById('mytable');
    if (host) host.replaceChildren();
    setResetButtonsDisabled(true);
    global.draw();
  };

  global.canvasSet = function canvasSetCorrected() {
    const element = document.getElementById('mynetwork');
    const widthInput = document.getElementById('canvasWidth');
    const unit = document.getElementById('widthUnit');
    const heightInput = document.getElementById('canvasHeight');
    if (!element || !widthInput || !unit || !heightInput) return;
    const width = Math.max(20, Number(widthInput.value) || 90);
    const height = Math.min(3000, Math.max(260, Number(heightInput.value) || 400));
    element.style.setProperty('width', `${width}${unit.value}`, 'important');
    element.style.setProperty('height', `${height}px`, 'important');
    if (global.network) global.network.fit({ animation: false });
  };

  global.drawAndJump = function drawAndJumpCorrected() {
    global.toggleHeightView(false);
    global.drawNet_Table();
    const target = document.getElementById('mynetwork');
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return false;
  };

  function attributesForEntry(entry) {
    const result = new Set();
    if (typeof charaAttribute === 'undefined' || !(charaAttribute instanceof Map)) return result;
    const japaneseName = U.getJapaneseNameFromValue(entry.callKey || entry.htmlValue);
    if (!japaneseName) return result;
    for (const [versionedName, attributes] of charaAttribute) {
      if (!U.variantBelongsTo(versionedName, japaneseName)) continue;
      for (const attribute of attributes) result.add(attribute);
    }
    return result;
  }

  function gradeAttributesForEntry(entry, details) {
    const result = new Set();
    const raw = details instanceof Map ? String(details.get('学年') || '').trim() : '';
    const direct = GRADE_VALUE_MAP.get(raw);
    if (direct) direct.forEach((item) => result.add(item));
    else if (raw.startsWith('小')) result.add('小学生');
    else if (raw && raw !== '-' && raw !== '?' && ['大1', '浪人生', '专门生', '成人?'].includes(raw)) result.add('その他');

    const japaneseName = U.getJapaneseNameFromValue(entry.callKey || entry.htmlValue);
    const explicit = global.EXPLICIT_GRADE_ATTRIBUTES instanceof Map
      ? global.EXPLICIT_GRADE_ATTRIBUTES.get(japaneseName)
      : null;
    if (explicit) explicit.forEach((item) => result.add(item));
    if (!result.size) result.add('学年不明');
    return result;
  }

  function selectedAttributeDefinitions() {
    const form = document.getElementById('at_form');
    if (!form) return [];
    return Array.from(form.querySelectorAll('[name="at_attribute"]:checked')).map((checkbox) => {
      const label = checkbox.closest('label');
      return [checkbox.value, label ? label.textContent.trim() || checkbox.value : checkbox.value];
    });
  }

  function categoryDefinitions(mode) {
    if (mode === 'age') {
      return Array.from({ length: 11 }, (_, index) => {
        const age = String(index + 10);
        return [age, `${age}岁`];
      }).concat([['其他', '其他年龄'], ['__NO_AGE__', '无年龄信息']]);
    }
    if (mode === 'grade') return GRADE_DEFINITIONS.slice();
    if (mode === 'school') return SCHOOL_DEFINITIONS.slice();
    if (mode === 'organization') return ORGANIZATION_DEFINITIONS.slice();
    return selectedAttributeDefinitions();
  }

  function matchingCategories(entry, details, attributes, mode, categoryKeys) {
    const result = new Set();
    if (mode === 'age') {
      const rawAge = details instanceof Map ? String(details.get('年龄') || details.get('年齢') || '').trim() : '';
      const age = parseNumber(rawAge);
      const missing = !rawAge || rawAge === '-' || rawAge === '?' || /不详|不明|未知/u.test(rawAge);
      const key = missing
        ? '__NO_AGE__'
        : (Number.isFinite(age) && age >= 10 && age <= 20 && Number.isInteger(age) ? String(age) : '其他');
      if (categoryKeys.has(key)) result.add(key);
      return result;
    }
    if (mode === 'grade') {
      for (const grade of gradeAttributesForEntry(entry, details)) if (categoryKeys.has(grade)) result.add(grade);
      return result;
    }
    if (mode === 'school') {
      const known = new Set(SCHOOL_DEFINITIONS.map(([key]) => key).filter((key) => !['その他学校', '__NO_SCHOOL__'].includes(key)));
      for (const key of known) if (attributes.has(key) && categoryKeys.has(key)) result.add(key);
      if (!result.size) {
        const schoolLike = [...attributes].some((value) => /学園|学院|学校|中学|高校|高等|学舎|アカデミー/u.test(String(value)));
        const fallback = schoolLike ? 'その他学校' : '__NO_SCHOOL__';
        if (categoryKeys.has(fallback)) result.add(fallback);
      }
      return result;
    }
    if (mode === 'organization') {
      const known = ORGANIZATION_DEFINITIONS.map(([key]) => key).filter((key) => key !== '__NO_ORGANIZATION__');
      for (const key of known) if (attributes.has(key) && categoryKeys.has(key)) result.add(key);
      if (!result.size && categoryKeys.has('__NO_ORGANIZATION__')) result.add('__NO_ORGANIZATION__');
      return result;
    }
    for (const key of categoryKeys) if (attributes.has(key)) result.add(key);
    return result;
  }

  function createRadio(name, value, label, checked, handler) {
    const wrapper = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.checked = checked;
    input.addEventListener('change', handler);
    wrapper.append(input, document.createTextNode(` ${label}`));
    return wrapper;
  }

  function buildHeightModeControls(shell) {
    const controls = document.createElement('div');
    controls.className = 'height-chart-controls';

    const viewGroup = document.createElement('div');
    viewGroup.className = 'height-control-group';
    const viewTitle = document.createElement('strong');
    viewTitle.textContent = '显示模式：';
    viewGroup.appendChild(viewTitle);
    viewGroup.appendChild(createRadio('viewMode', 'scatter', '散点图', heightState.viewMode === 'scatter', () => {
      heightState.viewMode = 'scatter';
      global.displayHeightChart(heightState.dataSource, heightState.xMode);
    }));
    viewGroup.appendChild(createRadio('viewMode', 'bar', '条形图（平均身高）', heightState.viewMode === 'bar', () => {
      heightState.viewMode = 'bar';
      global.displayHeightChart(heightState.dataSource, heightState.xMode);
    }));

    const axisGroup = document.createElement('div');
    axisGroup.className = 'height-control-group';
    const axisTitle = document.createElement('strong');
    axisTitle.textContent = 'X轴分类：';
    axisGroup.appendChild(axisTitle);
    [
      ['age', '年龄'],
      ['grade', '学年'],
      ['school', '学校'],
      ['organization', '组织'],
      ['attribute', '自定义属性']
    ].forEach(([value, label]) => {
      axisGroup.appendChild(createRadio('xAxisMode', value, label, heightState.xMode === value, () => {
        global.syncAndDrawHeightChart(value, heightState.dataSource);
      }));
    });

    controls.append(viewGroup, axisGroup);
    shell.appendChild(controls);
  }

  function refreshHeightScaleReadout() {
    const displayPercent = Math.round(heightState.scale * 200);
    const readout = document.querySelector('[data-height-scale-readout-v2]');
    if (readout) {
      readout.textContent = `${displayPercent}%`;
      readout.classList.add('height-scale-readout-v10');
    }
    const range = document.querySelector('[data-height-scale-range-v2]');
    if (range) range.value = String(displayPercent);
    const controls = document.querySelector('.height-zoom-controls-v2');
    if (controls) controls.dataset.v10Scale = 'true';
  }

  function applyHeightScale(scale, mode) {
    heightState.scale = clamp(scale, 0.25, 1.25);
    if (mode) heightState.mode = mode;
    const stage = document.querySelector('.height-chart-stage-v2');
    const surface = document.querySelector('.height-chart-surface-v2');
    applyScaledStage(stage, surface, heightState.scale);
    refreshHeightScaleReadout();
  }

  function fitHeightChart() {
    const viewport = document.querySelector('.height-chart-viewport-v2');
    const surface = document.querySelector('.height-chart-surface-v2');
    if (!viewport || !surface) return;
    const natural = measureNatural(surface);
    const scale = clamp((viewport.clientWidth - 4) / natural.width, 0.25, 1.25);
    applyHeightScale(scale, 'fit');
    viewport.scrollLeft = 0;
  }

  function buildHeightScaleControls(shell) {
    const controls = document.createElement('div');
    controls.className = 'height-zoom-controls-v2';
    controls.appendChild(makeButton('适应屏幕', '将完整身高图适配到当前显示框宽度', fitHeightChart));
    controls.appendChild(makeButton('−', '缩小身高图', () => applyHeightScale(heightState.scale - 0.05, 'manual')));

    const range = document.createElement('input');
    range.type = 'range';
    range.min = '50';
    range.max = '250';
    range.step = '10';
    range.value = String(Math.round(heightState.scale * 200));
    range.dataset.heightScaleRangeV2 = '';
    range.setAttribute('aria-label', '身高图缩放比例；100%等于旧版50%基准');
    range.addEventListener('input', () => applyHeightScale(Number(range.value) / 200, 'manual'));
    controls.appendChild(range);

    controls.appendChild(makeButton('＋', '放大身高图', () => applyHeightScale(heightState.scale + 0.05, 'manual')));
    controls.appendChild(makeButton('100%', '恢复身高图紧凑基准大小', () => applyHeightScale(0.5, 'manual')));
    const readout = document.createElement('span');
    readout.dataset.heightScaleReadoutV2 = '';
    controls.appendChild(readout);
    const note = document.createElement('span');
    note.textContent = '每名角色都有对应的精确身高横线；点击头像会置顶并高亮其横线。';
    controls.appendChild(note);
    shell.appendChild(controls);
    refreshHeightScaleReadout();
  }

  function buildTooltip(shell) {
    const tooltip = document.createElement('div');
    tooltip.className = 'height-chart-tooltip-v2';
    tooltip.setAttribute('role', 'status');
    shell.appendChild(tooltip);
    return tooltip;
  }

  function showHeightTooltip(tooltip, point, text) {
    tooltip.textContent = text;
    const rect = point.getBoundingClientRect();
    tooltip.style.display = 'block';
    const left = Math.min(global.innerWidth - tooltip.offsetWidth - 8, Math.max(8, rect.left));
    const top = Math.min(global.innerHeight - tooltip.offsetHeight - 8, rect.bottom + 8);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(8, top)}px`;
  }

  function assignLanes(items, plotHeight, minHeight, maxHeight) {
    const sorted = items.slice().sort((a, b) => b.height - a.height || a.entry.canonical.localeCompare(b.entry.canonical, 'zh-CN'));
    const lanes = [];
    const minVerticalGap = global.matchMedia(MOBILE_QUERY).matches ? 54 : 61;
    const result = [];
    for (const item of sorted) {
      const y = ((maxHeight - item.height) / (maxHeight - minHeight)) * plotHeight;
      let lane = lanes.findIndex((positions) => positions.every((existingY) => Math.abs(existingY - y) >= minVerticalGap));
      if (lane < 0) {
        lane = lanes.length;
        lanes.push([]);
      }
      lanes[lane].push(y);
      result.push({ item, y, lane });
    }
    return { points: result, laneCount: Math.max(1, lanes.length) };
  }

  function createHeightSurface(categories, grouped, viewMode, tooltip) {
    const plotHeight = 720;
    const minHeight = 120;
    const maxHeight = 180;
    const axisWidth = global.matchMedia(MOBILE_QUERY).matches ? 66 : 80;
    const laneWidth = global.matchMedia(MOBILE_QUERY).matches ? 54 : 62;
    const baseCategoryWidth = global.matchMedia(MOBILE_QUERY).matches ? 112 : 132;

    const layouts = [];
    let plotWidth = 0;
    categories.forEach((category) => {
      const items = grouped.get(category[0]) || [];
      const laneLayout = assignLanes(items, plotHeight, minHeight, maxHeight);
      const width = viewMode === 'bar'
        ? baseCategoryWidth
        : Math.max(baseCategoryWidth, laneLayout.laneCount * laneWidth + 30);
      layouts.push({ category, items, laneLayout, x: plotWidth, width });
      plotWidth += width;
    });
    plotWidth = Math.max(280, plotWidth);

    const viewport = document.createElement('div');
    viewport.className = 'height-chart-viewport-v2';
    const stage = document.createElement('div');
    stage.className = 'height-chart-stage-v2';
    const surface = document.createElement('div');
    surface.className = 'height-chart-surface-v2';
    surface.style.gridTemplateColumns = `${axisWidth}px ${plotWidth}px`;

    const yAxis = document.createElement('div');
    yAxis.className = 'height-y-axis-v2';
    yAxis.style.gridColumn = '1';
    for (let height = minHeight; height <= maxHeight; height += 5) {
      const label = document.createElement('span');
      label.className = 'height-y-label-v2';
      label.textContent = `${height}cm`;
      label.style.top = `${((maxHeight - height) / (maxHeight - minHeight)) * 100}%`;
      yAxis.appendChild(label);
    }

    const plot = document.createElement('div');
    plot.className = 'height-plot-v2';
    plot.style.gridColumn = '2';
    plot.style.width = `${plotWidth}px`;
    for (let height = minHeight; height <= maxHeight; height += 5) {
      const line = document.createElement('div');
      line.className = 'height-major-line-v2';
      line.style.top = `${((maxHeight - height) / (maxHeight - minHeight)) * 100}%`;
      plot.appendChild(line);
    }

    const pointPairs = [];
    layouts.forEach((layout) => {
      const column = document.createElement('div');
      column.className = 'height-category-column-v2';
      column.style.left = `${layout.x}px`;
      plot.appendChild(column);

      if (viewMode === 'bar') {
        const heights = layout.items.map((item) => item.height).filter(Number.isFinite);
        if (!heights.length) return;
        const average = heights.reduce((sum, value) => sum + value, 0) / heights.length;
        const bar = document.createElement('div');
        bar.className = 'height-bar-v2';
        bar.dataset.category = layout.category[0];
        bar.style.left = `${layout.x + layout.width / 2}px`;
        bar.style.width = `${Math.min(90, layout.width * 0.64)}px`;
        bar.style.height = `${Math.max(0, Math.min(100, ((average - minHeight) / (maxHeight - minHeight)) * 100))}%`;
        const label = document.createElement('span');
        label.className = 'height-bar-label-v2';
        label.textContent = `${average.toFixed(1)}cm / ${heights.length}人`;
        bar.appendChild(label);
        plot.appendChild(bar);
        return;
      }

      const lanesWidth = layout.laneLayout.laneCount * laneWidth;
      const laneStart = layout.x + Math.max(15, (layout.width - lanesWidth) / 2 + laneWidth / 2);
      layout.laneLayout.points.forEach(({ item, y, lane }) => {
        const x = laneStart + lane * laneWidth;
        const guide = document.createElement('div');
        guide.className = 'height-point-guide-v2';
        guide.style.top = `${y}px`;
        guide.style.width = `${x}px`;
        guide.dataset.character = item.entry.canonical;
        guide.dataset.category = layout.category[0];
        plot.appendChild(guide);

        const point = document.createElement('button');
        point.type = 'button';
        point.className = 'height-point-v2';
        point.style.left = `${x}px`;
        point.style.top = `${y}px`;
        point.dataset.character = item.entry.canonical;
        point.dataset.category = layout.category[0];
        point.dataset.height = String(item.height);
        const image = document.createElement('img');
        image.src = `./img/png/${item.entry.imageName}.png`;
        image.alt = item.entry.canonical;
        image.loading = 'lazy';
        image.addEventListener('error', () => { image.src = './img/png/二人称.png'; }, { once: true });
        point.appendChild(image);

        const detailsText = [
          item.entry.canonical,
          `身高：${item.height}cm`,
          `年龄：${item.ageText || '不详'}`,
          `学年：${item.gradeText || '不详'}`,
          `学校：${item.schoolText || '不详'}`
        ].join('\n');
        point.setAttribute('aria-label', detailsText.replace(/\n/gu, '，'));

        const activate = () => {
          for (const pair of pointPairs) {
            pair.point.classList.toggle('is-active', pair.point === point);
            pair.guide.classList.toggle('is-active', pair.guide === guide);
          }
          showHeightTooltip(tooltip, point, detailsText);
        };
        point.addEventListener('click', (event) => { event.stopPropagation(); activate(); });
        point.addEventListener('focus', activate);
        plot.appendChild(point);
        pointPairs.push({ point, guide });
      });
    });

    const spacer = document.createElement('div');
    spacer.className = 'height-x-axis-spacer-v2';
    spacer.style.gridColumn = '1';
    const xAxis = document.createElement('div');
    xAxis.className = 'height-x-axis-v2';
    xAxis.style.gridColumn = '2';
    xAxis.style.width = `${plotWidth}px`;
    layouts.forEach((layout) => {
      const label = document.createElement('div');
      label.className = 'height-x-label-v2';
      label.style.flexBasis = `${layout.width}px`;
      label.style.width = `${layout.width}px`;
      label.dataset.category = layout.category[0];
      label.textContent = layout.category[1];
      xAxis.appendChild(label);
    });

    surface.append(yAxis, plot, spacer, xAxis);
    stage.appendChild(surface);
    viewport.appendChild(stage);
    viewport.addEventListener('click', (event) => {
      if (event.target.closest('.height-point-v2')) return;
      tooltip.style.display = 'none';
      for (const pair of pointPairs) {
        pair.point.classList.remove('is-active');
        pair.guide.classList.remove('is-active');
      }
    });

    requestAnimationFrame(() => applyHeightScale(heightState.scale, heightState.mode));
    return viewport;
  }

  global.toggleHeightView = function toggleHeightViewCorrected(show) {
    const canvas = document.getElementById('canvasflame');
    const height = document.getElementById('heightChartContainer');
    const table = document.getElementById('mytable');
    const relationSave = document.getElementById('canvasImgLink');
    const heightSave = document.getElementById('saveHeightChartBtn');
    const twitter = document.querySelector('.twitter-share-button');
    if (canvas) canvas.style.display = show ? 'none' : 'block';
    if (table) table.style.display = show ? 'none' : 'block';
    if (height) height.style.display = show ? 'block' : 'none';
    if (relationSave) relationSave.style.display = show ? 'none' : 'inline-block';
    if (heightSave) heightSave.style.display = show ? 'inline-block' : 'none';
    if (twitter) twitter.style.display = show ? 'none' : 'inline-block';
    global.isHeightView = Boolean(show);
  };

  global.syncAndDrawHeightChart = function syncAndDrawHeightChartCorrected(mode, dataSource) {
    heightState.xMode = mode || heightState.xMode;
    heightState.dataSource = dataSource || heightState.dataSource;
    global.displayHeightChart(heightState.dataSource, heightState.xMode);
  };

  global.displayHeightChart = function displayHeightChartCorrected(dataSource, mode) {
    heightState.dataSource = dataSource || heightState.dataSource || 'global';
    heightState.xMode = mode || heightState.xMode || 'age';
    global.toggleHeightView(true);

    const container = document.getElementById('heightChartContainer');
    if (!container) return;
    container.replaceChildren();

    const shell = document.createElement('section');
    shell.className = 'height-chart-shell';
    const title = document.createElement('h3');
    title.textContent = '身高分布图';
    shell.appendChild(title);
    buildHeightModeControls(shell);

    const entries = getAllHeightEntries(heightState.dataSource);
    if (heightState.dataSource === 'selected' && !entries.length) {
      const message = document.createElement('div');
      message.className = 'height-chart-message';
      message.textContent = '请先在上方勾选角色，再进行“身高搜索（选中）”。';
      shell.appendChild(message);
      container.appendChild(shell);
      return;
    }

    const categories = categoryDefinitions(heightState.xMode);
    if (heightState.xMode === 'attribute' && !categories.length) {
      const message = document.createElement('div');
      message.className = 'height-chart-message';
      message.textContent = '自定义属性模式需要先在上方至少勾选一个属性。角色选择不会被重置。';
      shell.appendChild(message);
      container.appendChild(shell);
      return;
    }

    const categoryKeys = new Set(categories.map(([key]) => key));
    const grouped = new Map(categories.map(([key]) => [key, []]));
    const schoolLabels = new Map(SCHOOL_DEFINITIONS);
    let validHeightCount = 0;

    for (const entry of entries) {
      const details = detailsForEntry(entry);
      if (!(details instanceof Map)) continue;
      const height = parseNumber(details.get('身高'));
      if (!Number.isFinite(height)) continue;
      validHeightCount++;
      const attributes = attributesForEntry(entry);
      const matches = matchingCategories(entry, details, attributes, heightState.xMode, categoryKeys);
      const schoolKey = SCHOOL_DEFINITIONS.find(([key]) => !['その他学校', '__NO_SCHOOL__'].includes(key) && attributes.has(key));
      const item = {
        entry,
        height,
        ageText: String(details.get('年龄') || details.get('年齢') || ''),
        gradeText: String(details.get('学年') || ''),
        schoolText: schoolKey ? schoolLabels.get(schoolKey[0]) : ''
      };
      for (const category of matches) if (grouped.has(category)) grouped.get(category).push(item);
    }

    if (!validHeightCount) {
      const message = document.createElement('div');
      message.className = 'height-chart-message';
      message.textContent = '当前范围内没有可用的身高数据。';
      shell.appendChild(message);
      container.appendChild(shell);
      return;
    }

    buildHeightScaleControls(shell);
    const tooltip = buildTooltip(shell);
    shell.appendChild(createHeightSurface(categories, grouped, heightState.viewMode, tooltip));
    container.appendChild(shell);
  };

  global.saveHeightChart = function saveHeightChartCorrected() {
    const button = document.getElementById('saveHeightChartBtn');
    const surface = document.querySelector('.height-chart-surface-v2');
    if (!surface || typeof global.html2canvas === 'undefined') return;
    const originalText = button ? button.textContent : '';
    if (button) {
      button.disabled = true;
      button.textContent = '正在生成…';
    }
    global.html2canvas(surface, {
      useCORS: true,
      allowTaint: false,
      backgroundColor: '#ffffff',
      scale: 1
    }).then((canvas) => {
      const link = document.createElement('a');
      link.href = canvas.toDataURL('image/png');
      link.download = `身高分布图_${heightState.xMode}_${heightState.viewMode}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    }).catch((error) => {
      console.error('生成身高图失败：', error);
      alert('生成身高图失败，请缩小分类范围后重试。');
    }).finally(() => {
      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
    });
  };

  let resizeTimer = null;
  global.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = global.setTimeout(() => {
      if (relationState.mode === 'fit' && document.querySelector('.relationship-table-surface')) fitRelationTable();
      if (heightState.mode === 'fit' && document.querySelector('.height-chart-surface-v2')) fitHeightChart();
      if (global.network && !global.isHeightView) global.network.fit({ animation: false });
    }, 160);
  }, { passive: true });

  global.__MAGIRECO_CORRECTION_V2__ = Object.freeze({
    release: 'layout-correction-v2-20260816',
    relationState,
    heightState,
    fitRelationTable,
    fitHeightChart,
    applyRelationScale,
    applyHeightScale
  });
})(window);
