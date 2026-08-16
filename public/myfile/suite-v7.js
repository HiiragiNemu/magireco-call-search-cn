/* V7 shared behavior: localized character resolver, attribute filters and quick rail. */
(function (global) {
  'use strict';

  const Tools = global.MagiTools;
  if (!Tools) return;

  const LOCALIZATION_URL = './data/story-v7/localization.json';
  let localizationPromise = null;
  const controllers = new WeakMap();

  const ATTRIBUTE_LABELS = new Map(Object.entries({
    'まどマギ': '魔法少女小圆', 'マギレコ': '魔法纪录', 'まどドラ': 'Magia Exedra',
    'マギレポ': '魔法报告', '外伝': '外传', 'ヒストリア': '历史篇', 'コラボ': '联动',
    'アニメ': '动画版', 'scene0': 'scene0', '水着': '泳装', '着物': '和服', '冬服': '冬装',
    'クリスマス': '圣诞装', 'ハロウィン': '万圣装', 'メイド服': '女仆装', 'パジャマ': '睡衣',
    'その他衣装': '其他服装', '正月': '新年装', '周年': '周年', 'ペア': '双人', '限定': '限定',
    'フレイム': '火', 'アクア': '水', 'フォレスト': '木', 'ライト': '光', 'ダーク': '暗', '無': '无属性',
    'アタック': '攻击', 'ディフェンス': '防御', 'サポート': '辅助', 'ヒール': '治疗',
    'マギア': '魔法', 'バランス': '均衡', 'ミスティック': '秘仪', 'エクシード': '超越',
    '配布': '活动赠送', '歴史篇': '历史篇',
    '神浜市立大附属': '神滨市立大学附属学校', '水名女学園': '水名女子学园',
    '参京院教育学園': '参京院教育学园', '中央学園': '中央学园', '栄総合学園': '荣综合学园',
    '南凪自由学園': '南凪自由学园', '工匠学舎': '工匠学舍', '大東学院': '大东学院',
    '聖リリアンナ学園': '圣莉莉安娜学园', '神浜未来アカデミー': '神滨未来学院',
    '春方此花学園': '春方此花学园', '虎屋町学園': '虎屋町学园', '竜ヶ崎学院': '龙崎学院',
    '蛇の宮中学・高等学校': '蛇之宫中学・高等学校', '松宮市立第一中学校': '松宫市立第一中学',
    '霧峰村立霧峰中学校': '雾峰村立雾峰中学', '湯国市立岩切山高等学校': '汤国市立岩切山高中',
    '湯国市立湯国学園': '汤国市立汤国学园', '湯の花国際中学・高等学校': '汤之花国际中学・高中',
    '湯国青波学園': '汤国青波学园', '宝崎順心学園': '宝崎顺心学园',
    '宝崎市立光塚中等教育学校': '宝崎市立光塚中等教育学校', '見滝原中学校': '见泷原中学',
    '白羽女学院': '白羽女子学院', '茜咲中学': '茜咲中学', '聖乙女学園': '圣乙女学园',
    '神浜魔法連盟': '神滨魔法联盟', '時女一族': '时女一族', 'PROMISED BLOOD': 'PROMISED BLOOD',
    'Neo-Magius': 'Neo-Magius', 'Folklore of 0': 'Folklore of 0', 'Puella Care': 'Puella Care'
  }));

  const WORK_VALUES = new Set(['まどマギ','マギレコ','まどドラ','マギレポ','外伝','ヒストリア','コラボ','アニメ','scene0']);
  const COSTUME_VALUES = new Set(['水着','着物','冬服','クリスマス','ハロウィン','メイド服','パジャマ','その他衣装','正月','周年','ペア','限定','配布']);
  const BATTLE_VALUES = new Set(['フレイム','アクア','フォレスト','ライト','ダーク','無','アタック','ディフェンス','サポート','ヒール','マギア','バランス','ミスティック','エクシード']);
  const ORG_VALUES = new Set(['神浜魔法連盟','時女一族','PROMISED BLOOD','Neo-Magius','Folklore of 0','Puella Care']);
  const SCHOOL_RE = /(学園|学院|学校|中学|高校|高等|学舎|アカデミー|大附属)$/u;

  function normalize(value) {
    return String(value || '').normalize('NFKC').replace(/[\s　]+/g, '').replace(/[‐‑‒–—―]/g, '-').trim();
  }

  function loadLocalization() {
    if (!localizationPromise) {
      localizationPromise = Tools.fetchJson(LOCALIZATION_URL, { cache: 'no-cache' }, 30000)
        .catch((error) => {
          console.error('V7 localization unavailable', error);
          return { characters: {}, titleExact: {}, titlePrefixes: [], categoryOrder: [], categoryLabels: {} };
        });
    }
    return localizationPromise;
  }

  function variantSuffix(raw) {
    const match = String(raw || '').match(/[（(]([^）)]+)[）)]$/u);
    if (!match) return '';
    let suffix = match[1]
      .replace(/水着/gu, '泳装').replace(/眼鏡/gu, '眼镜').replace(/晴着/gu, '新年和服')
      .replace(/クリスマス/gu, '圣诞').replace(/ハロウィン/gu, '万圣节').replace(/アニメ/gu, '动画')
      .replace(/おとぎ話/gu, '童话').replace(/バレンタイン/gu, '情人节').replace(/常闇/gu, '常暗')
      .replace(/始まり/gu, '初始').replace(/新春龍神/gu, '新春龙神').replace(/ver\.?/giu, 'ver.');
    return `（${suffix}）`;
  }

  function baseName(raw) {
    return String(raw || '').normalize('NFKC').replace(/[（(][^）)]*[）)]$/u, '').trim();
  }

  async function resolveCharacterV7(raw) {
    const value = String(raw || '').trim();
    const data = await loadLocalization();
    const characters = data.characters || {};
    const byNormalized = data.charactersNormalized || {};
    let mapped = characters[value] || byNormalized[normalize(value)] || null;
    if (mapped) return { ...mapped, raw: value };

    const base = baseName(value);
    mapped = characters[base] || byNormalized[normalize(base)] || null;
    if (mapped) {
      const suffix = variantSuffix(value);
      return { ...mapped, zh: `${mapped.zh}${suffix}`, raw: value, variantOf: base };
    }

    const fallback = await Tools.resolveCharacter(value);
    if (fallback) return { ...fallback, raw: value };
    return { jp: value, zh: value, image: '', raw: value, unresolved: true };
  }

  function imageForResolved(resolved) {
    if (!resolved?.image) return '';
    return Tools.imageUrl({ image: resolved.image, zh: resolved.zh });
  }

  function createCastChipV7(resolved) {
    const chip = document.createElement('span');
    chip.className = 'story-cast-chip-v7';
    chip.title = resolved.jp && resolved.jp !== resolved.zh ? `${resolved.zh}（${resolved.jp}）` : resolved.zh;
    const src = imageForResolved(resolved);
    if (src) {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.src = src;
      img.alt = resolved.zh;
      img.addEventListener('error', () => {
        const fallback = document.createElement('span');
        fallback.className = 'story-cast-fallback-v7';
        fallback.textContent = resolved.zh?.slice(0, 1) || '?';
        img.replaceWith(fallback);
      }, { once: true });
      chip.appendChild(img);
    } else {
      const fallback = document.createElement('span');
      fallback.className = 'story-cast-fallback-v7';
      fallback.textContent = resolved.zh?.slice(0, 1) || '?';
      chip.appendChild(fallback);
    }
    const text = document.createElement('span');
    text.textContent = resolved.zh || resolved.jp || '未知角色';
    chip.appendChild(text);
    return chip;
  }

  function attributeMap() {
    try {
      if (typeof charaAttribute !== 'undefined' && charaAttribute instanceof Map) return charaAttribute;
    } catch { /* lexical binding absent */ }
    return new Map();
  }

  function attributesFor(jp) {
    const map = attributeMap();
    if (!map.size) return new Set();
    if (map.has(jp)) return map.get(jp);
    const normalized = normalize(jp);
    for (const [key, values] of map) if (normalize(key) === normalized) return values;
    const base = baseName(jp);
    if (map.has(base)) return map.get(base);
    for (const [key, values] of map) if (normalize(key) === normalize(base)) return values;
    return new Set();
  }

  function attributeLabel(value) {
    return ATTRIBUTE_LABELS.get(value) || String(value)
      .replace(/学園/gu, '学园').replace(/學園/gu, '学园').replace(/學院/gu, '学院')
      .replace(/浜/gu, '滨').replace(/國/gu, '国').replace(/總/gu, '总');
  }

  function attributeGroup(value) {
    if (WORK_VALUES.has(value)) return '作品与版本';
    if (COSTUME_VALUES.has(value)) return '服装与获取';
    if (BATTLE_VALUES.has(value) || /^[ABC]{5}$/u.test(value) || /^☆/u.test(value)) return '战斗属性';
    if (ORG_VALUES.has(value)) return '组织';
    if (SCHOOL_RE.test(value)) return '学校';
    return '其他';
  }

  function collectAttributes(catalog) {
    const counts = new Map();
    for (const entry of catalog) {
      for (const value of attributesFor(entry.jp)) counts.set(value, (counts.get(value) || 0) + 1);
    }
    const groups = new Map();
    for (const [value, count] of counts) {
      if (count < 1) continue;
      const group = attributeGroup(value);
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push({ value, count, label: attributeLabel(value) });
    }
    const order = ['作品与版本','服装与获取','学校','组织','战斗属性','其他'];
    for (const list of groups.values()) list.sort((a,b) => a.label.localeCompare(b.label, 'zh-CN'));
    return order.filter((name) => groups.has(name)).map((name) => [name, groups.get(name)]);
  }

  function installAttributeFilterV7({ grid, catalog, anchor, textInput, prefix = 'suite' }) {
    if (!grid || !anchor || !catalog?.length) return null;
    const existing = anchor.querySelector(`.suite-attribute-v7[data-prefix="${prefix}"]`);
    if (existing) return controllers.get(grid) || null;

    const details = document.createElement('details');
    details.className = 'suite-attribute-v7';
    details.dataset.prefix = prefix;
    const summary = document.createElement('summary');
    summary.textContent = '按属性选择魔法少女';
    details.appendChild(summary);
    const body = document.createElement('div');
    body.className = 'suite-attribute-body-v7';
    const toolbar = document.createElement('div');
    toolbar.className = 'suite-attribute-toolbar-v7';
    toolbar.innerHTML = `
      <label><input type="radio" name="${prefix}-attribute-logic" value="AND" checked>AND</label>
      <label><input type="radio" name="${prefix}-attribute-logic" value="OR">OR</label>
      <button type="button" class="suite-button secondary" data-attribute-reset>属性重置</button>
      <span class="suite-attribute-count-v7" data-attribute-count>未选择属性</span>`;
    body.appendChild(toolbar);
    const groupsHost = document.createElement('div');
    groupsHost.className = 'suite-attribute-groups-v7';
    for (const [groupName, values] of collectAttributes(catalog)) {
      const group = document.createElement('div');
      group.className = 'suite-attribute-group-v7';
      const title = document.createElement('strong');
      title.textContent = groupName;
      const options = document.createElement('div');
      options.className = 'suite-attribute-options-v7';
      for (const item of values) {
        const label = document.createElement('label');
        label.title = `${item.label}：${item.count} 名`;
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.value = item.value;
        input.dataset.attributeV7 = '';
        label.append(input, document.createTextNode(item.label));
        options.appendChild(label);
      }
      group.append(title, options);
      groupsHost.appendChild(group);
    }
    body.appendChild(groupsHost);
    details.appendChild(body);
    anchor.appendChild(details);

    const originalByCard = new Map();
    for (const card of grid.querySelectorAll('.suite-character-card')) {
      const entry = catalog.find((item) => item.jp === card.dataset.jp);
      originalByCard.set(card, entry || { jp: card.dataset.jp || '' });
    }

    const controller = {
      details,
      apply() {
        const selected = [...details.querySelectorAll('input[data-attribute-v7]:checked')].map((input) => input.value);
        const logic = details.querySelector(`input[name="${prefix}-attribute-logic"]:checked`)?.value || 'AND';
        const terms = String(textInput?.value || '').normalize('NFKC').toLocaleLowerCase('ja-JP')
          .replace(/　/g, ' ').trim().split(/\s+/).filter(Boolean);
        let shown = 0;
        for (const [card, entry] of originalByCard) {
          const haystack = [entry.zh, entry.jp, entry.kana, entry.roman, ...(entry.aliases || [])]
            .filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase('ja-JP');
          const textMatch = !terms.length || terms.some((term) => haystack.includes(term));
          const attrs = attributesFor(entry.jp);
          const attributeMatch = !selected.length || (logic === 'AND'
            ? selected.every((value) => attrs.has(value))
            : selected.some((value) => attrs.has(value)));
          card.hidden = !(textMatch && attributeMatch);
          if (!card.hidden) shown += 1;
        }
        const count = details.querySelector('[data-attribute-count]');
        if (count) count.textContent = selected.length
          ? `已选 ${selected.length} 项；显示 ${shown}/${originalByCard.size} 名`
          : `未选择属性；显示 ${shown}/${originalByCard.size} 名`;
        grid.dispatchEvent(new CustomEvent('suite-v7-filtered', { bubbles: true, detail: { shown, total: originalByCard.size } }));
        return shown;
      },
      reset() {
        details.querySelectorAll('input[data-attribute-v7]').forEach((input) => { input.checked = false; });
        const and = details.querySelector(`input[name="${prefix}-attribute-logic"][value="AND"]`);
        if (and) and.checked = true;
        return this.apply();
      }
    };
    details.addEventListener('change', () => controller.apply());
    details.querySelector('[data-attribute-reset]')?.addEventListener('click', () => controller.reset());
    textInput?.addEventListener('input', () => controller.apply());
    controllers.set(grid, controller);
    controller.apply();
    return controller;
  }

  function scrollToTarget(target) {
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (!element) return;
    const nav = document.querySelector('.suite-nav');
    const offset = (nav?.getBoundingClientRect().height || 0) + 6;
    const top = Math.max(0, global.scrollY + element.getBoundingClientRect().top - offset);
    global.scrollTo({ top, behavior: 'smooth' });
  }

  function installQuickRailV7() {
    if (document.body?.dataset.suiteTool === 'runes' || document.querySelector('.suite-quick-rail-v7')) return;
    const tool = document.body?.dataset.suiteTool || 'call';
    const definitions = tool === 'story'
      ? [
          ['↑','顶部',() => global.scrollTo({top:0,behavior:'smooth'})],
          ['筛','搜索条件',() => scrollToTarget('#story-options-title')],
          ['人','角色列表',() => scrollToTarget('#story-character-title')],
          ['搜','执行搜索',() => document.getElementById('storySearchButton')?.click()],
          ['表','搜索结果',() => scrollToTarget('#storyResults')],
          ['↓','页面底部',() => global.scrollTo({top:document.documentElement.scrollHeight,behavior:'smooth'})]
        ]
      : tool === 'attendance'
        ? [
            ['↑','顶部',() => global.scrollTo({top:0,behavior:'smooth'})],
            ['筛','筛选角色',() => scrollToTarget('#attendance-character-title')],
            ['人','角色列表',() => scrollToTarget('#attendanceGrid')],
            ['表','排行结果',() => scrollToTarget('#attendanceResults')],
            ['↓','页面底部',() => global.scrollTo({top:document.documentElement.scrollHeight,behavior:'smooth'})]
          ]
        : [
            ['↑','顶部',() => global.scrollTo({top:0,behavior:'smooth'})],
            ['人','角色列表',() => scrollToTarget('#girltop')],
            ['搜','称呼搜索',() => typeof global.drawAndJump === 'function' && global.drawAndJump()],
            ['表','称呼结果',() => scrollToTarget('#callResultSection')],
            ['↓','页面底部',() => global.scrollTo({top:document.documentElement.scrollHeight,behavior:'smooth'})]
          ];
    const rail = document.createElement('aside');
    rail.className = 'suite-quick-rail-v7';
    rail.setAttribute('aria-label', '页面快捷操作');
    for (const [glyph, label, action] of definitions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = glyph;
      button.title = label;
      button.setAttribute('aria-label', label);
      button.addEventListener('click', action);
      rail.appendChild(button);
    }
    document.body.appendChild(rail);
  }

  function measureNav() {
    const nav = document.querySelector('.suite-nav');
    document.documentElement.style.setProperty('--suite-nav-height-v7', `${Math.ceil(nav?.getBoundingClientRect().height || 0) + 6}px`);
  }

  global.MagiToolsV7 = Object.freeze({
    ...Tools,
    loadLocalizationV7: loadLocalization,
    resolveCharacterV7,
    createCastChipV7,
    installAttributeFilterV7,
    installQuickRailV7,
    scrollToTargetV7: scrollToTarget,
    attributesForV7: attributesFor,
    attributeLabelV7: attributeLabel
  });

  function init() {
    installQuickRailV7();
    measureNav();
    global.addEventListener('resize', measureNav, { passive: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})(window);
