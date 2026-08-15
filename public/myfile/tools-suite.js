/* Shared runtime for the integrated Magia Record tools. */
(function (global) {
  'use strict';

  const CATALOG_URL = './data/character-catalog.json';
  const NAV_ITEMS = [
    { id: 'calls', href: './index.html', icon: '↔', label: '称呼与身高' },
    { id: 'story', href: './story.html', icon: '▤', label: '角色故事搜索' },
    { id: 'attendance', href: './attendance.html', icon: '▥', label: '同席次数排行' },
    { id: 'runes', href: './runes.html', icon: '⌁', label: '魔女文字解读' }
  ];

  const DISPLAY_ALIASES = Object.freeze({
    '環いろは': '环彩羽',
    '环伊吕波': '环彩羽',
    '常盤ななか': '常盘七香',
    '常盘七夏': '常盘七香',
    '万年桜のウワサ': '万年樱之谣',
    '万年樱的传闻': '万年樱之谣',
    '早乙女先生': '早乙女和子',
    '早乙女老师': '早乙女和子',
    'ナマエ': '名小姐',
    '名字': '名小姐',
    '水樹塁': '水树垒',
    '水树塁': '水树垒',
    '暁美ほむら(眼鏡ver)': '晓美焰-眼镜ver',
    '暁美ほむら(眼鏡ver.)': '晓美焰-眼镜ver',
    '晓美焰(眼镜ver)': '晓美焰-眼镜ver'
  });

  let catalogPromise = null;
  let catalogMapsPromise = null;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalize(value) {
    return String(value ?? '')
      .normalize('NFKC')
      .toLocaleLowerCase('ja-JP')
      .replace(/[\s　・･·.。,'"“”‘’()（）\[\]【】_\-－—]/g, '');
  }

  function canonicalDisplay(value) {
    const text = String(value ?? '').trim();
    return DISPLAY_ALIASES[text] || text;
  }

  function imageName(entryOrName) {
    if (entryOrName && typeof entryOrName === 'object') {
      return entryOrName.image || canonicalDisplay(entryOrName.zh || entryOrName.jp || '');
    }
    return canonicalDisplay(entryOrName);
  }

  function imageUrl(entryOrName) {
    return `./img/png/${encodeURIComponent(imageName(entryOrName))}.png`;
  }

  function attachImageFallback(img) {
    if (!img || img.dataset.suiteFallback === 'true') return;
    img.dataset.suiteFallback = 'true';
    img.addEventListener('error', () => {
      img.style.opacity = '0.18';
      img.removeAttribute('src');
      img.alt = img.alt ? `${img.alt}（暂无头像）` : '暂无头像';
    }, { once: true });
  }

  async function loadCatalog() {
    if (!catalogPromise) {
      catalogPromise = fetch(CATALOG_URL, { cache: 'no-cache' })
        .then((response) => {
          if (!response.ok) throw new Error(`角色目录加载失败：HTTP ${response.status}`);
          return response.json();
        })
        .then((data) => {
          if (!Array.isArray(data) || !data.length) throw new Error('角色目录为空。');
          return data.map((entry, index) => ({
            index,
            zh: canonicalDisplay(entry.zh || entry.jp || ''),
            jp: String(entry.jp || '').trim(),
            roman: String(entry.roman || '').trim(),
            kana: String(entry.kana || '').trim(),
            image: canonicalDisplay(entry.image || entry.zh || entry.jp || ''),
            star: Boolean(entry.star),
            classes: Array.isArray(entry.classes) ? entry.classes : [],
            aliases: Array.isArray(entry.aliases) ? entry.aliases : []
          }));
        });
    }
    return catalogPromise;
  }

  async function catalogMaps() {
    if (!catalogMapsPromise) {
      catalogMapsPromise = loadCatalog().then((catalog) => {
        const byJp = new Map();
        const byZh = new Map();
        const byAny = new Map();
        const add = (map, key, value) => {
          const normalized = normalize(key);
          if (normalized && !map.has(normalized)) map.set(normalized, value);
        };
        for (const entry of catalog) {
          add(byJp, entry.jp, entry);
          add(byZh, entry.zh, entry);
          for (const key of [entry.jp, entry.zh, entry.roman, entry.kana, entry.image, ...entry.aliases]) add(byAny, key, entry);
        }
        for (const [alias, display] of Object.entries(DISPLAY_ALIASES)) {
          const target = byZh.get(normalize(display)) || byAny.get(normalize(display));
          if (target) add(byAny, alias, target);
        }
        return { catalog, byJp, byZh, byAny };
      });
    }
    return catalogMapsPromise;
  }

  async function resolveCharacter(value) {
    const maps = await catalogMaps();
    const key = normalize(value);
    return maps.byAny.get(key) || maps.byJp.get(key) || maps.byZh.get(key) || null;
  }

  async function displayName(value) {
    const entry = await resolveCharacter(value);
    return entry ? entry.zh : canonicalDisplay(value);
  }

  function renderNav(active) {
    const existing = document.querySelector('[data-suite-nav]');
    const nav = existing || document.createElement('nav');
    nav.className = 'suite-nav';
    nav.dataset.suiteNav = '';
    nav.setAttribute('aria-label', '工具模式切换');
    nav.innerHTML = NAV_ITEMS.map((item) => {
      const current = item.id === active ? ' aria-current="page"' : '';
      return `<a href="${item.href}"${current}><span aria-hidden="true">${item.icon}</span><span>${item.label}</span></a>`;
    }).join('');
    if (!existing) {
      const anchor = document.querySelector('[data-suite-nav-anchor]') || document.body.firstElementChild;
      if (anchor) anchor.insertAdjacentElement('beforebegin', nav);
      else document.body.prepend(nav);
    }
    return nav;
  }

  function setStatus(target, message, kind = 'info') {
    const node = typeof target === 'string' ? document.querySelector(target) : target;
    if (!node) return;
    node.dataset.kind = kind;
    node.innerHTML = message;
  }

  function loadingMarkup(message = '处理中…') {
    return `<span class="suite-loading"><span class="suite-spinner" aria-hidden="true"></span>${escapeHtml(message)}</span>`;
  }

  async function fetchJson(url, options = {}, timeout = 30000) {
    const controller = new AbortController();
    const timer = global.setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      global.clearTimeout(timer);
    }
  }

  function createCharacterCard(entry, options = {}) {
    const card = document.createElement(options.tag || 'button');
    if (card.tagName === 'BUTTON') card.type = 'button';
    card.className = 'suite-character-card';
    card.dataset.jp = entry.jp;
    card.dataset.zh = entry.zh;
    card.dataset.search = normalize([entry.zh, entry.jp, entry.roman, entry.kana, ...(entry.aliases || [])].join(' '));
    card.setAttribute('aria-pressed', 'false');
    card.title = `${entry.zh}\n${entry.jp}${entry.roman ? `\n${entry.roman}` : ''}`;
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = imageUrl(entry);
    img.alt = entry.zh;
    attachImageFallback(img);
    const name = document.createElement('strong');
    name.textContent = entry.zh;
    const sub = document.createElement('small');
    sub.textContent = entry.jp;
    card.append(img, name, sub);
    if (entry.star) {
      const star = document.createElement('span');
      star.className = 'suite-star';
      star.textContent = '★';
      star.setAttribute('aria-label', '包含基础角色版本');
      card.appendChild(star);
    }
    return card;
  }

  function filterCharacterCards(container, query) {
    const terms = String(query || '').replace(/　/g, ' ').trim().split(/\s+/).filter(Boolean).map(normalize);
    let visible = 0;
    for (const card of container.querySelectorAll('.suite-character-card')) {
      const haystack = card.dataset.search || '';
      const show = !terms.length || terms.some((term) => haystack.includes(term));
      card.hidden = !show;
      if (show) visible += 1;
    }
    return visible;
  }

  function selectedEntries(container, catalog) {
    const selectedJp = new Set([...container.querySelectorAll('.suite-character-card[aria-pressed="true"]')].map((card) => card.dataset.jp));
    return catalog.filter((entry) => selectedJp.has(entry.jp));
  }

  function toggleCharacterCard(card, force) {
    const next = force == null ? card.getAttribute('aria-pressed') !== 'true' : Boolean(force);
    card.setAttribute('aria-pressed', String(next));
    return next;
  }

  function smoothScrollTo(target, offset = 8) {
    const node = typeof target === 'string' ? document.querySelector(target) : target;
    if (!node) return;
    const top = Math.max(0, global.scrollY + node.getBoundingClientRect().top - offset);
    global.scrollTo({ top, behavior: 'smooth' });
    global.setTimeout(() => {
      if (!node.isConnected) return;
      const current = node.getBoundingClientRect().top;
      if (current < -20 || current > 110) {
        global.scrollTo({ top: Math.max(0, global.scrollY + current - offset), behavior: 'auto' });
      }
    }, 760);
  }

  function storyLabel(value) {
    return ({
      'メイン【第1部】': '主线【第一部】',
      'メイン【第2部】': '主线【第二部】',
      'アナザー【第1部】': '支线【第一部】',
      'アナザー【第2部】': '支线【第二部】',
      '魔法少女': '魔法少女个人故事',
      '衣装': '服装故事',
      'ミラーズ': '镜层故事',
      'イベント': '活动故事',
      'バトルミュージアム': '战斗博物馆',
      'スペシャル': '特别故事',
      'EDムービー': '片尾动画',
      'アニメ【1st】': '动画【第一季】',
      'アニメ【2nd】': '动画【第二季】',
      'アニメ【Final】': '动画【最终季】'
    })[value] || value;
  }

  global.MagiTools = Object.freeze({
    CATALOG_URL,
    NAV_ITEMS,
    DISPLAY_ALIASES,
    escapeHtml,
    normalize,
    canonicalDisplay,
    imageName,
    imageUrl,
    attachImageFallback,
    loadCatalog,
    catalogMaps,
    resolveCharacter,
    displayName,
    renderNav,
    setStatus,
    loadingMarkup,
    fetchJson,
    createCharacterCard,
    filterCharacterCards,
    selectedEntries,
    toggleCharacterCard,
    smoothScrollTo,
    storyLabel
  });
})(window);
