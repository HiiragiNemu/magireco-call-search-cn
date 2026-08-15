// Responsive production renderer and interaction corrections.
(function (global) {
    'use strict';

    const U = global.MagirecoNameUtils;
    if (!U) {
        console.error('MagirecoNameUtils was not loaded.');
        return;
    }

    const META_KEYS = U.META_KEYS;
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
        ['その他学校', '其他学校']
    ];

    const ORGANIZATION_DEFINITIONS = [
        ['マギアユニオン', '神滨魔法联盟'],
        ['時女一族', '时女一族'],
        ['プロミストブラッド', 'PROMISED BLOOD'],
        ['ネオマギウス', 'Neo-Magius'],
        ['フォークロア', 'Folklore of 0'],
        ['ピュエラケア', 'Puella Care'],
        ['ヒストリア', '历史篇']
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

    const heightState = {
        dataSource: 'global',
        xMode: 'age',
        viewMode: 'scatter',
        zoom: window.matchMedia('(max-width: 640px)').matches ? 0.7 : 1
    };

    function getDisplayOptions() {
        if (typeof global.getCallDisplayOptions === 'function') {
            return global.getCallDisplayOptions();
        }
        return { japanese: true, romaji: true, chinese: true };
    }

    function formatName(value, fallback, options) {
        if (typeof global.formatNameText === 'function') {
            return global.formatNameText(value, options) || fallback;
        }
        return value || fallback || '';
    }

    function formatCall(value, options) {
        if (typeof global.formatCallText === 'function') {
            return global.formatCallText(value || '', options);
        }
        return String(value || '');
    }

    function nodeLabel(value, fallback, options) {
        if (typeof global.formatNodeLabel === 'function') {
            return global.formatNodeLabel(value, fallback, options);
        }
        return formatName(value, fallback, options).replace(/\s*\(/u, '\n(');
    }

    function secondPersonLabel(options) {
        if (typeof global.getSecondPersonNodeLabel === 'function') {
            return global.getSecondPersonNodeLabel(options);
        }
        return options.romaji && !options.chinese && !options.japanese ? 'second person' : '二人称';
    }

    function imageNameFor(canonical, checkbox) {
        if (checkbox) return U.getDisplayShortName(checkbox.value);
        if (canonical === '晓美焰(眼镜ver)') return '晓美焰-眼镜ver';
        if (canonical === '名字') return '名小姐';
        if (canonical === '水树塁') return '水树垒';
        return canonical;
    }

    const selectionOrderTracker = {
        order: [],
        bound: false,
        key(checkbox) {
            return checkbox.id || checkbox.value;
        },
        bind() {
            if (this.bound) return;
            this.bound = true;
            document.addEventListener('change', (event) => {
                const checkbox = event.target;
                if (!checkbox || typeof checkbox.matches !== 'function'
                    || !checkbox.matches('input.MagicalChk[name="chara"]')) return;
                const key = this.key(checkbox);
                const existing = this.order.indexOf(key);
                if (existing !== -1) this.order.splice(existing, 1);
                if (checkbox.checked) this.order.push(key);
            }, true);
        },
        orderedChecked() {
            const checked = U.getCharacterCheckboxes().filter((checkbox) => checkbox.checked);
            const active = new Set(checked.map((checkbox) => this.key(checkbox)));
            this.order = this.order.filter((key) => active.has(key));
            for (const checkbox of checked) {
                const key = this.key(checkbox);
                if (!this.order.includes(key)) this.order.push(key);
            }
            const rank = new Map(this.order.map((key, index) => [key, index]));
            return checked
                .map((checkbox, domIndex) => ({
                    checkbox,
                    domIndex,
                    rank: rank.get(this.key(checkbox)) ?? Number.MAX_SAFE_INTEGER
                }))
                .sort((left, right) => left.rank - right.rank || left.domIndex - right.domIndex)
                .map((entry) => entry.checkbox);
        }
    };
    selectionOrderTracker.bind();
    global.getSelectedCharacterCheckboxesInOrder = function getSelectedCharacterCheckboxesInOrder() {
        selectionOrderTracker.bind();
        return selectionOrderTracker.orderedChecked();
    };

    function getSelectedEntries() {
        const keyIndex = U.buildCallTableKeyIndex();
        return global.getSelectedCharacterCheckboxesInOrder()
            .map((checkbox) => {
                const canonical = U.canonicalFromCheckbox(checkbox);
                return {
                    checkbox,
                    canonical,
                    htmlValue: checkbox.value,
                    callKey: keyIndex.get(canonical) || null,
                    imageName: imageNameFor(canonical, checkbox)
                };
            })
            .filter((entry, index, entries) =>
                entries.findIndex((candidate) => candidate.canonical === entry.canonical) === index
            );
    }

    function buildCanonicalRelations(details) {
        const relations = new Map();
        if (!(details instanceof Map)) return relations;
        for (const [key, value] of details) {
            if (META_KEYS.has(key)) continue;
            relations.set(U.normalizeShortName(key), value);
        }
        return relations;
    }

    function setResetButtonsDisabled(disabled) {
        for (const id of ['mgreset', 'mgreset2']) {
            const button = document.getElementById(id);
            if (button) button.disabled = disabled;
        }
    }

    function addCell(row, tag, text, className) {
        const cell = document.createElement(tag);
        if (className) cell.className = className;
        cell.textContent = text || '';
        row.appendChild(cell);
        return cell;
    }

    function renderRelationshipTable(entries, options) {
        const host = document.getElementById('mytable');
        if (!host) return;
        host.replaceChildren();

        const hint = document.createElement('div');
        hint.className = 'relationship-scroll-hint';
        hint.textContent = '← 左右滑动查看全部角色 →';
        host.appendChild(hint);

        const table = document.createElement('table');
        table.id = 'girltable';

        const thead = document.createElement('thead');
        const header = document.createElement('tr');
        addCell(header, 'th', '↓ 称呼者　被称呼者 →');
        addCell(header, 'th', '第一人称');
        addCell(header, 'th', '第二人称');
        for (const entry of entries) {
            addCell(header, 'th', formatName(entry.htmlValue, entry.canonical, options));
        }
        thead.appendChild(header);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        for (const caller of entries) {
            const row = document.createElement('tr');
            addCell(row, 'th', formatName(caller.htmlValue, caller.canonical, options));
            const details = caller.callKey && typeof callTable !== 'undefined'
                ? callTable.get(caller.callKey)
                : null;
            addCell(row, 'td', formatCall(details instanceof Map ? details.get('第一人称') : '', options));
            addCell(row, 'td', formatCall(details instanceof Map ? details.get('二人称') : '', options));

            const relations = buildCanonicalRelations(details);
            for (const callee of entries) {
                const text = caller.canonical === callee.canonical
                    ? '—'
                    : formatCall(relations.get(callee.canonical) || '', options);
                addCell(row, 'td', text);
            }
            tbody.appendChild(row);
        }
        table.appendChild(tbody);
        host.appendChild(table);
        host.scrollLeft = 0;
    }

    function makeSafeImageFilename() {
        const shortNames = getSelectedEntries().map((entry) => entry.canonical);
        const stem = shortNames.length
            ? `称呼关系_${shortNames.slice(0, 8).join('_')}${shortNames.length > 8 ? `_等${shortNames.length}人` : ''}`
            : '称呼关系';
        return stem.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 110) + '.jpg';
    }

    global.makeImageName = function makeImageName() {
        const link = document.getElementById('canvasImgLink');
        if (link) link.download = makeSafeImageFilename();
    };

    global.drawNet_Table = function drawNetTableResponsive() {
        const entries = getSelectedEntries();
        const options = getDisplayOptions();

        if (global.network && typeof global.network.destroy === 'function') {
            global.network.destroy();
        }
        global.network = null;
        global.nodes = [];
        global.edges = [];

        if (entries.length === 0) {
            setResetButtonsDisabled(true);
            const table = document.getElementById('mytable');
            if (table) table.replaceChildren();
            global.draw();
            return;
        }

        setResetButtonsDisabled(false);
        renderRelationshipTable(entries, options);

        const count = entries.length;
        const radius = count <= 2 ? 150 : Math.min(430, 170 + count * 24);
        entries.forEach((entry, index) => {
            const angle = count > 1 ? (2 * Math.PI * index) / count : 0;
            global.nodes.push({
                id: entry.canonical,
                shape: 'circularImage',
                image: `./img/png/${entry.imageName}.png`,
                label: nodeLabel(entry.htmlValue, entry.canonical, options),
                x: count > 1 ? radius * Math.cos(angle) : 0,
                y: count > 1 ? radius * Math.sin(angle) : 0
            });
        });

        for (const caller of entries) {
            const details = caller.callKey && typeof callTable !== 'undefined'
                ? callTable.get(caller.callKey)
                : null;
            const relations = buildCanonicalRelations(details);
            for (const callee of entries) {
                if (caller.canonical === callee.canonical) continue;
                const raw = relations.get(callee.canonical);
                if (!raw) continue;
                global.edges.push({
                    from: caller.canonical,
                    to: callee.canonical,
                    label: formatCall(raw, options)
                });
            }
            if (details instanceof Map && details.get('第一人称')) {
                global.edges.push({
                    from: caller.canonical,
                    to: caller.canonical,
                    label: formatCall(details.get('第一人称'), options)
                });
            }
        }

        const secondId = '__second_person__';
        global.nodes.push({
            id: secondId,
            shape: 'circularImage',
            image: './img/png/二人称.png',
            label: secondPersonLabel(options),
            x: radius + 170,
            y: radius + 90
        });
        for (const entry of entries) {
            const details = entry.callKey && typeof callTable !== 'undefined'
                ? callTable.get(entry.callKey)
                : null;
            if (details instanceof Map && details.get('二人称')) {
                global.edges.push({
                    from: entry.canonical,
                    to: secondId,
                    label: formatCall(details.get('二人称'), options)
                });
            }
        }

        global.draw();
    };

    global.draw = function drawResponsiveNetwork() {
        const container = document.getElementById('mynetwork');
        if (!container || typeof vis === 'undefined') return;

        if (global.network && typeof global.network.destroy === 'function') {
            global.network.destroy();
        }

        const compact = window.matchMedia('(max-width: 640px)').matches;
        const data = { nodes: global.nodes || [], edges: global.edges || [] };
        const options = {
            autoResize: true,
            physics: false,
            layout: { improvedLayout: false },
            interaction: {
                dragNodes: true,
                dragView: true,
                zoomView: true,
                hover: true,
                tooltipDelay: 180,
                multiselect: false
            },
            nodes: {
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
                    strokeWidth: compact ? 3 : 4,
                    multi: false
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
                smooth: {
                    enabled: true,
                    type: 'dynamic',
                    roundness: 0.25
                },
                selfReference: { size: compact ? 22 : 30 }
            }
        };

        global.network = new vis.Network(container, data, options);

        global.network.on('afterDrawing', function afterDrawing(context) {
            try {
                const link = document.getElementById('canvasImgLink');
                if (link) link.href = context.canvas.toDataURL('image/jpeg', 0.92);
            } catch (error) {
                console.warn('关系图图片生成失败：', error);
            }
        });

        global.network.on('doubleClick', function centerNode(params) {
            const chosen = params.nodes && params.nodes[0];
            if (!chosen) return;

            const secondId = '__second_person__';
            const otherNodes = (global.nodes || []).filter((node) => node.id !== chosen && node.id !== secondId);
            const radius = Math.min(380, 150 + otherNodes.length * 24);
            global.network.moveNode(chosen, 0, 0);

            otherNodes.forEach((node, index) => {
                const angle = otherNodes.length > 0 ? (2 * Math.PI * index) / otherNodes.length : 0;
                global.network.moveNode(node.id, radius * Math.cos(angle), radius * Math.sin(angle));
            });

            if ((global.nodes || []).some((node) => node.id === secondId)) {
                global.network.moveNode(secondId, radius + 150, radius + 70);
            }
            global.network.selectNodes([chosen]);
            global.network.fit({ animation: { duration: 280, easingFunction: 'easeInOutQuad' } });
        });

        requestAnimationFrame(() => {
            if (global.network && (global.nodes || []).length) {
                global.network.fit({ animation: false });
            }
        });
        global.makeImageName();
    };

    global.girlReset = function girlResetResponsive() {
        for (const checkbox of U.getCharacterCheckboxes()) checkbox.checked = false;
        global.nodes = [];
        global.edges = [];
        const table = document.getElementById('mytable');
        if (table) table.replaceChildren();
        setResetButtonsDisabled(true);
        global.draw();
    };

    global.canvasSet = function canvasSetResponsive() {
        const networkElement = document.getElementById('mynetwork');
        const widthInput = document.getElementById('canvasWidth');
        const unitInput = document.getElementById('widthUnit');
        const heightInput = document.getElementById('canvasHeight');
        if (!networkElement || !widthInput || !unitInput || !heightInput) return;

        const width = Math.max(20, Number(widthInput.value) || 90);
        const height = Math.min(3000, Math.max(260, Number(heightInput.value) || 400));
        networkElement.style.width = `${width}${unitInput.value}`;
        networkElement.style.height = `${height}px`;
        if (global.network) global.network.fit({ animation: false });
    };

    global.drawAndJump = function drawAndJumpResponsive() {
        global.toggleHeightView(false);
        global.drawNet_Table();
        const target = document.getElementById('mynetwork');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return false;
    };

    function detailsForEntry(entry) {
        return entry.callKey && typeof callTable !== 'undefined'
            ? callTable.get(entry.callKey)
            : null;
    }

    function getAllHeightEntries(dataSource) {
        if (dataSource === 'selected') return getSelectedEntries();

        const checkIndex = U.buildCheckboxIndex().byCanonical;
        if (typeof callTable === 'undefined') return [];
        return Array.from(callTable.keys()).map((key) => {
            const canonical = U.normalizeShortName(key);
            const checkbox = checkIndex.get(canonical) || null;
            return {
                checkbox,
                canonical,
                htmlValue: checkbox ? checkbox.value : key,
                callKey: key,
                imageName: imageNameFor(canonical, checkbox)
            };
        });
    }

    function attributesForEntry(entry) {
        const result = new Set();
        if (typeof charaAttribute === 'undefined') return result;
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
        if (direct) direct.forEach((grade) => result.add(grade));
        else if (raw.startsWith('小')) result.add('小学生');
        else if (raw && raw !== '-' && raw !== '?') {
            if (['大1', '浪人生', '专门生', '成人?'].includes(raw)) result.add('その他');
        }

        const japaneseName = U.getJapaneseNameFromValue(entry.callKey || entry.htmlValue);
        const explicit = global.EXPLICIT_GRADE_ATTRIBUTES instanceof Map
            ? global.EXPLICIT_GRADE_ATTRIBUTES.get(japaneseName)
            : null;
        if (explicit) explicit.forEach((grade) => result.add(grade));

        if (result.size === 0) result.add('学年不明');
        return result;
    }

    function parseNumber(value) {
        const match = String(value || '').match(/\d+(?:\.\d+)?/);
        return match ? Number(match[0]) : NaN;
    }

    function selectedAttributeDefinitions() {
        const form = document.getElementById('at_form');
        if (!form) return [];
        return Array.from(form.querySelectorAll('[name="at_attribute"]:checked')).map((checkbox) => {
            const labelText = checkbox.closest('label') ? checkbox.closest('label').textContent.trim() : checkbox.value;
            return [checkbox.value, labelText || checkbox.value];
        });
    }

    function categoryDefinitions(mode) {
        if (mode === 'age') {
            return Array.from({ length: 11 }, (_, index) => {
                const age = String(index + 10);
                return [age, `${age}岁`];
            }).concat([['其他', '其他']]);
        }
        if (mode === 'grade') return GRADE_DEFINITIONS.slice();
        if (mode === 'school') return SCHOOL_DEFINITIONS.slice();
        if (mode === 'organization') return ORGANIZATION_DEFINITIONS.slice();
        return selectedAttributeDefinitions();
    }

    function matchingCategories(entry, details, attributes, mode, categoryKeys) {
        const matches = new Set();
        if (mode === 'age') {
            const age = parseNumber(details instanceof Map ? details.get('年龄') || details.get('年齢') : '');
            const key = Number.isFinite(age) && age >= 10 && age <= 20 && Number.isInteger(age)
                ? String(age)
                : '其他';
            if (categoryKeys.has(key)) matches.add(key);
            return matches;
        }

        if (mode === 'grade') {
            for (const grade of gradeAttributesForEntry(entry, details)) {
                if (categoryKeys.has(grade)) matches.add(grade);
            }
            return matches;
        }

        if (mode === 'school') {
            for (const [key] of SCHOOL_DEFINITIONS) {
                if (key !== 'その他学校' && attributes.has(key) && categoryKeys.has(key)) matches.add(key);
            }
            if (matches.size === 0 && categoryKeys.has('その他学校')) matches.add('その他学校');
            return matches;
        }

        for (const key of categoryKeys) {
            if (attributes.has(key)) matches.add(key);
        }
        return matches;
    }

    function createRadio(name, value, label, checked, onChange) {
        const wrapper = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = name;
        input.value = value;
        input.checked = checked;
        input.addEventListener('change', onChange);
        wrapper.append(input, document.createTextNode(` ${label}`));
        return wrapper;
    }

    function setHeightZoom(scale) {
        heightState.zoom = Math.max(0.3, Math.min(1.6, Number(scale) || 1));
        const surface = document.querySelector('.height-chart-surface');
        if (surface) surface.style.zoom = String(heightState.zoom);

        const readout = document.querySelector('[data-height-zoom-readout]');
        if (readout) readout.textContent = `${Math.round(heightState.zoom * 100)}%`;
        const range = document.querySelector('[data-height-zoom-range]');
        if (range) range.value = String(Math.round(heightState.zoom * 100));
    }

    function fitHeightChart() {
        const viewport = document.querySelector('.height-chart-viewport');
        const surface = document.querySelector('.height-chart-surface');
        if (!viewport || !surface) return;
        const naturalWidth = Number(surface.dataset.naturalWidth) || surface.scrollWidth || 1;
        setHeightZoom(Math.max(0.3, Math.min(1, (viewport.clientWidth - 8) / naturalWidth)));
        viewport.scrollLeft = 0;
    }

    function buildHeightControls(shell, dataSource, mode, viewMode) {
        const controls = document.createElement('div');
        controls.className = 'height-chart-controls';

        const viewGroup = document.createElement('div');
        viewGroup.className = 'height-control-group';
        const viewTitle = document.createElement('strong');
        viewTitle.textContent = '显示模式：';
        viewGroup.appendChild(viewTitle);
        viewGroup.appendChild(createRadio('viewMode', 'scatter', '散点图', viewMode === 'scatter', () => {
            heightState.viewMode = 'scatter';
            global.displayHeightChart(dataSource, mode);
        }));
        viewGroup.appendChild(createRadio('viewMode', 'bar', '条形图（平均身高）', viewMode === 'bar', () => {
            heightState.viewMode = 'bar';
            global.displayHeightChart(dataSource, mode);
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
            axisGroup.appendChild(createRadio('xAxisMode', value, label, mode === value, () => {
                global.syncAndDrawHeightChart(value, dataSource);
            }));
        });

        controls.append(viewGroup, axisGroup);
        shell.appendChild(controls);
    }

    function buildZoomControls(shell) {
        const controls = document.createElement('div');
        controls.className = 'height-zoom-controls';

        const fit = document.createElement('button');
        fit.type = 'button';
        fit.textContent = '适应屏幕';
        fit.addEventListener('click', fitHeightChart);

        const minus = document.createElement('button');
        minus.type = 'button';
        minus.textContent = '−';
        minus.setAttribute('aria-label', '缩小身高图');
        minus.addEventListener('click', () => setHeightZoom(heightState.zoom - 0.1));

        const plus = document.createElement('button');
        plus.type = 'button';
        plus.textContent = '＋';
        plus.setAttribute('aria-label', '放大身高图');
        plus.addEventListener('click', () => setHeightZoom(heightState.zoom + 0.1));

        const reset = document.createElement('button');
        reset.type = 'button';
        reset.textContent = '100%';
        reset.addEventListener('click', () => setHeightZoom(1));

        const range = document.createElement('input');
        range.type = 'range';
        range.min = '30';
        range.max = '160';
        range.step = '5';
        range.value = String(Math.round(heightState.zoom * 100));
        range.dataset.heightZoomRange = '';
        range.setAttribute('aria-label', '身高图缩放比例');
        range.addEventListener('input', () => setHeightZoom(Number(range.value) / 100));

        const readout = document.createElement('span');
        readout.dataset.heightZoomReadout = '';
        readout.textContent = `${Math.round(heightState.zoom * 100)}%`;

        controls.append(fit, minus, range, plus, reset, readout);
        shell.appendChild(controls);
    }

    function createTooltip(shell) {
        const tooltip = document.createElement('div');
        tooltip.className = 'height-chart-tooltip';
        tooltip.setAttribute('role', 'status');
        shell.appendChild(tooltip);
        return tooltip;
    }

    function showHeightTooltip(tooltip, point, text) {
        tooltip.textContent = text;
        const rect = point.getBoundingClientRect();
        tooltip.style.display = 'block';
        const left = Math.min(window.innerWidth - tooltip.offsetWidth - 10, Math.max(10, rect.left));
        const top = Math.min(window.innerHeight - tooltip.offsetHeight - 10, rect.bottom + 8);
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${Math.max(10, top)}px`;
    }

    function createHeightSurface(categories, grouped, viewMode, tooltip) {
        const categoryWidth = 140;
        const plotWidth = Math.max(280, categories.length * categoryWidth);
        const plotHeight = 720;
        const minHeight = 120;
        const maxHeight = 180;

        const viewport = document.createElement('div');
        viewport.className = 'height-chart-viewport';

        const surface = document.createElement('div');
        surface.className = 'height-chart-surface';
        surface.dataset.naturalWidth = String(plotWidth + 80);
        surface.style.zoom = String(heightState.zoom);

        const yAxis = document.createElement('div');
        yAxis.className = 'height-y-axis';
        for (let height = minHeight; height <= maxHeight; height += 5) {
            const label = document.createElement('span');
            label.className = 'height-y-label';
            label.textContent = `${height}cm`;
            label.style.top = `${((maxHeight - height) / (maxHeight - minHeight)) * 100}%`;
            yAxis.appendChild(label);
        }

        const plot = document.createElement('div');
        plot.className = 'height-plot';
        plot.style.width = `${plotWidth}px`;

        for (let height = minHeight; height <= maxHeight; height += 5) {
            const line = document.createElement('div');
            line.className = 'height-major-line';
            line.style.top = `${((maxHeight - height) / (maxHeight - minHeight)) * 100}%`;
            plot.appendChild(line);
        }

        categories.forEach((category, index) => {
            const column = document.createElement('div');
            column.className = 'height-category-column';
            column.style.left = `${index * categoryWidth}px`;
            plot.appendChild(column);

            const items = grouped.get(category[0]) || [];
            if (viewMode === 'bar') {
                const heights = items.map((item) => item.height).filter(Number.isFinite);
                if (!heights.length) return;
                const average = heights.reduce((sum, value) => sum + value, 0) / heights.length;
                const bar = document.createElement('div');
                bar.className = 'height-bar';
                bar.style.left = `${index * categoryWidth + categoryWidth / 2}px`;
                bar.style.height = `${Math.max(0, Math.min(100, ((average - minHeight) / (maxHeight - minHeight)) * 100))}%`;

                const label = document.createElement('span');
                label.className = 'height-bar-label';
                label.textContent = `${average.toFixed(1)}cm / ${heights.length}人`;
                bar.appendChild(label);
                plot.appendChild(bar);
                return;
            }

            const heightCounters = new Map();
            items.forEach((item) => {
                const rounded = Math.round(item.height * 2) / 2;
                const indexAtHeight = heightCounters.get(rounded) || 0;
                heightCounters.set(rounded, indexAtHeight + 1);
                const jitterSlots = [-38, 0, 38, -19, 19, -52, 52];
                const jitter = jitterSlots[indexAtHeight % jitterSlots.length];

                const point = document.createElement('button');
                point.type = 'button';
                point.className = 'height-point';
                point.style.left = `${index * categoryWidth + categoryWidth / 2 + jitter}px`;
                point.style.top = `${((maxHeight - item.height) / (maxHeight - minHeight)) * plotHeight}px`;

                const image = document.createElement('img');
                image.src = `./img/png/${item.entry.imageName}.png`;
                image.alt = item.entry.canonical;
                image.loading = 'lazy';
                image.addEventListener('error', () => {
                    image.src = './img/png/二人称.png';
                });
                point.appendChild(image);

                const detailsText = [
                    item.entry.canonical,
                    `身高：${item.height}cm`,
                    `年龄：${item.ageText || '不详'}`,
                    `学年：${item.gradeText || '不详'}`,
                    `学校：${item.schoolText || '不详'}`
                ].join('\n');
                point.setAttribute('aria-label', detailsText.replace(/\n/g, '，'));
                point.addEventListener('click', (event) => {
                    event.stopPropagation();
                    showHeightTooltip(tooltip, point, detailsText);
                });
                plot.appendChild(point);
            });
        });

        const spacer = document.createElement('div');
        spacer.className = 'height-x-axis-spacer';

        const xAxis = document.createElement('div');
        xAxis.className = 'height-x-axis';
        xAxis.style.width = `${plotWidth}px`;
        for (const [, labelText] of categories) {
            const label = document.createElement('div');
            label.className = 'height-x-label';
            label.textContent = labelText;
            xAxis.appendChild(label);
        }

        surface.append(yAxis, plot, spacer, xAxis);
        viewport.appendChild(surface);
        viewport.addEventListener('click', (event) => {
            if (!event.target.closest('.height-point')) tooltip.style.display = 'none';
        });
        return viewport;
    }

    global.toggleHeightView = function toggleHeightViewResponsive(show) {
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

    global.syncAndDrawHeightChart = function syncAndDrawHeightChartResponsive(mode, dataSource) {
        heightState.xMode = mode || heightState.xMode;
        heightState.dataSource = dataSource || heightState.dataSource;
        global.displayHeightChart(heightState.dataSource, heightState.xMode);
    };

    global.displayHeightChart = function displayHeightChartResponsive(dataSource, mode) {
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
        buildHeightControls(shell, heightState.dataSource, heightState.xMode, heightState.viewMode);

        const entries = getAllHeightEntries(heightState.dataSource);
        if (heightState.dataSource === 'selected' && entries.length === 0) {
            const message = document.createElement('div');
            message.className = 'height-chart-message';
            message.textContent = '请先在上方勾选角色，再进行“身高搜索（选中）”。';
            shell.appendChild(message);
            container.appendChild(shell);
            return;
        }

        const categories = categoryDefinitions(heightState.xMode);
        if (heightState.xMode === 'attribute' && categories.length === 0) {
            const message = document.createElement('div');
            message.className = 'height-chart-message';
            message.textContent = '自定义属性模式需要先在上方至少勾选一个属性。现有角色选择不会被重置。';
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
            const matches = matchingCategories(
                entry,
                details,
                attributes,
                heightState.xMode,
                categoryKeys
            );
            const schoolKey = SCHOOL_DEFINITIONS.find(([key]) => key !== 'その他学校' && attributes.has(key));
            const item = {
                entry,
                height,
                ageText: String(details.get('年龄') || details.get('年齢') || ''),
                gradeText: String(details.get('学年') || ''),
                schoolText: schoolKey ? schoolLabels.get(schoolKey[0]) : ''
            };
            for (const category of matches) {
                if (grouped.has(category)) grouped.get(category).push(item);
            }
        }

        if (validHeightCount === 0) {
            const message = document.createElement('div');
            message.className = 'height-chart-message';
            message.textContent = '当前范围内没有可用的身高数据。';
            shell.appendChild(message);
            container.appendChild(shell);
            return;
        }

        buildZoomControls(shell);
        const tooltip = createTooltip(shell);
        shell.appendChild(createHeightSurface(categories, grouped, heightState.viewMode, tooltip));
        container.appendChild(shell);

        if (window.matchMedia('(max-width: 640px)').matches) {
            requestAnimationFrame(() => {
                setHeightZoom(heightState.zoom);
            });
        }
    };

    global.saveHeightChart = function saveHeightChartResponsive() {
        const button = document.getElementById('saveHeightChartBtn');
        const surface = document.querySelector('.height-chart-surface');
        if (!surface || typeof html2canvas === 'undefined') return;

        const originalText = button ? button.textContent : '';
        const originalZoom = heightState.zoom;
        if (button) {
            button.disabled = true;
            button.textContent = '正在生成…';
        }
        setHeightZoom(1);

        requestAnimationFrame(() => {
            html2canvas(surface, {
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
                setHeightZoom(originalZoom);
                if (button) {
                    button.disabled = false;
                    button.textContent = originalText;
                }
            });
        });
    };

    function installStaticCorrections() {
        const teacher = document.getElementById('早乙女和子');
        const teacherLabel = teacher ? teacher.closest('label.girlbox') : null;
        if (teacherLabel) teacherLabel.dataset.kana = 'さおとめ かずこ';

        for (const anchor of document.querySelectorAll('a[target="_blank"]')) {
            const tokens = new Set(String(anchor.rel || '').split(/\s+/).filter(Boolean));
            tokens.add('noopener');
            tokens.add('noreferrer');
            anchor.rel = Array.from(tokens).join(' ');
        }

        const form = document.getElementById('callFilterForm');
        if (form && !form.getAttribute('aria-label')) form.setAttribute('aria-label', '双击角色筛选方式');

        let resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                if (global.network && !global.isHeightView) global.network.fit({ animation: false });
            }, 160);
        }, { passive: true });
    }

    installStaticCorrections();
})(window);
