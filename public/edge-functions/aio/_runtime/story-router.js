export const STORY_ROUTER_REVISION = 1;
export const STORY_ROUTE_MANIFEST_VERSION = 1;
export const STORY_SPRITE_QUERY_KEYS = [
    'characterId',
    'story',
    'scenario',
    'variant',
    'renderer',
    'animation',
    'character',
];
export const STORY_SPRITE_MESSAGES = Object.freeze({
    open: 'magireco.sprite.open',
    legacyOpen: 'magireco.viewer.open',
    ready: 'magireco.sprite.ready',
    change: 'magireco.sprite.change',
    searchOutbound: 'magireco.story.open-sprite',
});
const CATALOG_REVISION_RE = /^\d{8}t\d{6}z$/;
const SOURCE_KEY_RE = /^story-v6:\d{8}t\d{6}z:[a-z0-9-]{1,64}:[0-9]{1,8}$/;
const STORY_ID_RE = /^[A-Za-z0-9_.:-]{1,256}$/;
const ISO_INSTANT_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/;
const CONTROL_RE = /[\u0000-\u001f\u007f]/;
const TARGET_NAME_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const REPOSITORY_RE = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const REVISION_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const INDEX_PATH_RE = /^[A-Za-z0-9._/-]{1,256}$/;
const STORY_SPRITE_ALIASES = Object.freeze({
    characterId: Object.freeze(['characterId', 'character_id', 'unitId', 'unit']),
    story: Object.freeze(['story', 'storyId', 'groupId']),
    scenario: Object.freeze(['scenario', 'storyTitle', 'title']),
    variant: Object.freeze(['variant', 'skin']),
    renderer: Object.freeze(['renderer', 'render']),
    animation: Object.freeze(['animation', 'motion']),
    character: Object.freeze(['character', 'characterName', 'chara', 'gname']),
});
const STORY_SPRITE_MESSAGE_TYPES = Object.freeze([
    STORY_SPRITE_MESSAGES.open,
    STORY_SPRITE_MESSAGES.legacyOpen,
    STORY_SPRITE_MESSAGES.ready,
    STORY_SPRITE_MESSAGES.change,
    STORY_SPRITE_MESSAGES.searchOutbound,
]);
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function requireString(value, label, pattern, maxLength) {
    if (typeof value !== 'string' || value.length === 0 || value.length > maxLength || !pattern.test(value)) {
        throw new Error(`${label} 无效`);
    }
    return value;
}
function optionalNfcText(value, label, maxLength) {
    if (value === undefined || value === null)
        return undefined;
    const normalized = String(value).normalize('NFC').trim();
    if (normalized === '')
        return undefined;
    if (normalized.length > maxLength || CONTROL_RE.test(normalized)) {
        throw new Error(`${label} 无效`);
    }
    return normalized;
}
function parseTranslationStatus(value, label) {
    if (!isRecord(value))
        throw new Error(`${label} 必须是对象`);
    const code = value['code'];
    if (code !== 'human-baseline' && code !== 'ai-unreviewed' && code !== 'ai-human-reviewed') {
        throw new Error(`${label}.code 无效`);
    }
    const statusLabel = optionalNfcText(value['label'], `${label}.label`, 64);
    if (statusLabel === undefined)
        throw new Error(`${label}.label 无效`);
    return { code, label: statusLabel };
}
function parseStoryRouteVariant(value, routeIndex, variantIndex) {
    const context = `routes[${routeIndex}].variants[${variantIndex}]`;
    if (!isRecord(value))
        throw new Error(`${context} 必须是对象`);
    const label = optionalNfcText(value['label'], `${context}.label`, 64);
    if (label === undefined)
        throw new Error(`${context}.label 无效`);
    const edition = value['edition'];
    if (edition !== 'initial' && edition !== 'rerun')
        throw new Error(`${context}.edition 无效`);
    const precision = value['precision'];
    if (precision !== 'exact-section' && precision !== 'story-parent') {
        throw new Error(`${context}.precision 无效`);
    }
    const translationStatus = parseTranslationStatus(value['translationStatus'], `${context}.translationStatus`);
    if (!isRecord(value['reader']))
        throw new Error(`${context}.reader 必须是对象`);
    const storyId = requireString(value['reader']['storyId'], `${context}.reader.storyId`, STORY_ID_RE, 256);
    const readerSectionValue = value['reader']['section'];
    let readerSection;
    if (readerSectionValue !== undefined) {
        if (typeof readerSectionValue !== 'string'
            || readerSectionValue.length === 0
            || readerSectionValue.length > 512
            || CONTROL_RE.test(readerSectionValue)) {
            throw new Error(`${context}.reader.section 无效`);
        }
        readerSection = readerSectionValue;
    }
    let adv = null;
    if (value['adv'] !== null) {
        if (!isRecord(value['adv']))
            throw new Error(`${context}.adv 必须是对象或 null`);
        const chapterId = requireString(value['adv']['chapterId'], `${context}.adv.chapterId`, STORY_ID_RE, 256);
        const section = optionalNfcText(value['adv']['section'], `${context}.adv.section`, 512);
        if (section === undefined)
            throw new Error(`${context}.adv.section 无效`);
        const advPrecision = value['adv']['precision'];
        if (advPrecision !== 'exact-section' && advPrecision !== 'story-parent') {
            throw new Error(`${context}.adv.precision 无效`);
        }
        const readerRawIdValue = value['adv']['readerRawId'];
        const readerRawId = readerRawIdValue === undefined
            ? undefined
            : requireString(readerRawIdValue, `${context}.adv.readerRawId`, STORY_ID_RE, 256);
        if (chapterId !== storyId && readerRawId !== chapterId) {
            throw new Error(`${context} 的 Reader 与 ADV 没有使用同一剧情身份`);
        }
        if (chapterId === storyId && readerRawId !== undefined) {
            throw new Error(`${context}.adv.readerRawId 仅可用于跨 Reader 版本身份桥接`);
        }
        if (readerSection !== undefined && section !== readerSection && advPrecision !== 'story-parent') {
            throw new Error(`${context} 的 Reader 与 ADV 没有使用同一章节`);
        }
        if (advPrecision !== precision)
            throw new Error(`${context} 的路由精度与 ADV 精度不一致`);
        adv = readerRawId === undefined
            ? { chapterId, section, precision: advPrecision }
            : { chapterId, section, precision: advPrecision, readerRawId };
    }
    return {
        label,
        edition,
        precision,
        translationStatus,
        reader: readerSection === undefined ? { storyId } : { storyId, section: readerSection },
        adv,
    };
}
function firstStorySpriteValue(input, key) {
    for (const alias of STORY_SPRITE_ALIASES[key]) {
        const value = input[alias];
        if (value !== undefined && value !== null && String(value).trim() !== '')
            return value;
    }
    return undefined;
}
export function normalizeStorySpriteContext(input) {
    if (!isRecord(input))
        throw new Error('Story Sprite 上下文必须是对象');
    const context = { renderer: 'cocos2d' };
    const rawCharacterId = optionalNfcText(firstStorySpriteValue(input, 'characterId'), 'characterId', 8);
    if (rawCharacterId !== undefined) {
        if (!/^\d{1,8}$/.test(rawCharacterId))
            throw new Error('characterId 必须是十进制 unit ID');
        context.characterId = String(Number(rawCharacterId));
    }
    const renderer = optionalNfcText(firstStorySpriteValue(input, 'renderer'), 'renderer', 32);
    if (renderer !== undefined && renderer !== 'cocos2d') {
        throw new Error('renderer 只接受 cocos2d');
    }
    const fields = [
        ['story', 256],
        ['scenario', 512],
        ['variant', 128],
        ['animation', 256],
        ['character', 256],
    ];
    for (const [key, maxLength] of fields) {
        const value = optionalNfcText(firstStorySpriteValue(input, key), key, maxLength);
        if (value !== undefined)
            context[key] = value;
    }
    if (context.characterId === undefined && context.character === undefined) {
        throw new Error('Story Sprite 至少需要 characterId 或 character');
    }
    return Object.freeze(context);
}
function parseRoute(value, index) {
    if (!isRecord(value))
        throw new Error(`routes[${index}] 必须是对象`);
    const sourceKey = requireString(value['sourceKey'], `routes[${index}].sourceKey`, SOURCE_KEY_RE, 128);
    const canonicalStoryId = requireString(value['canonicalStoryId'], `routes[${index}].canonicalStoryId`, /^magireco:[A-Za-z0-9_.:-]{1,256}$/, 272);
    const match = value['match'];
    if (match !== 'exact-character-episode'
        && match !== 'exact-main-episode'
        && match !== 'exact-reader-group'
        && match !== 'exact-title-evidence'
        && match !== 'explicit-title'
        && match !== 'manual') {
        throw new Error(`routes[${index}].match 无效`);
    }
    if (!isRecord(value['reader']))
        throw new Error(`routes[${index}].reader 必须是对象`);
    const storyId = requireString(value['reader']['storyId'], `routes[${index}].reader.storyId`, STORY_ID_RE, 256);
    const readerSectionValue = value['reader']['section'];
    let readerSection;
    if (readerSectionValue !== undefined) {
        if (typeof readerSectionValue !== 'string'
            || readerSectionValue.length === 0
            || readerSectionValue.length > 512
            || CONTROL_RE.test(readerSectionValue)) {
            throw new Error(`routes[${index}].reader.section 无效`);
        }
        readerSection = readerSectionValue;
    }
    const precisionValue = value['precision'];
    let precision;
    if (precisionValue === undefined) {
        precision = readerSection === undefined ? 'story-parent' : 'exact-section';
    }
    else if (precisionValue === 'exact-section' || precisionValue === 'story-parent') {
        precision = precisionValue;
    }
    else {
        throw new Error(`routes[${index}].precision 无效`);
    }
    let adv = null;
    if (value['adv'] !== null) {
        if (!isRecord(value['adv']))
            throw new Error(`routes[${index}].adv 必须是对象或 null`);
        const chapterId = requireString(value['adv']['chapterId'], `routes[${index}].adv.chapterId`, STORY_ID_RE, 256);
        const section = value['adv']['section'];
        if (typeof section !== 'string' ||
            section.length === 0 ||
            section.length > 512 ||
            CONTROL_RE.test(section)) {
            throw new Error(`routes[${index}].adv.section 无效`);
        }
        const advPrecisionValue = value['adv']['precision'];
        let advPrecision;
        if (advPrecisionValue === undefined) {
            advPrecision = precision;
        }
        else if (advPrecisionValue === 'exact-section' || advPrecisionValue === 'story-parent') {
            advPrecision = advPrecisionValue;
        }
        else {
            throw new Error(`routes[${index}].adv.precision 无效`);
        }
        const readerRawIdValue = value['adv']['readerRawId'];
        let readerRawId;
        if (readerRawIdValue !== undefined) {
            readerRawId = requireString(readerRawIdValue, `routes[${index}].adv.readerRawId`, STORY_ID_RE, 256);
        }
        if (chapterId !== storyId && readerRawId !== chapterId) {
            throw new Error(`routes[${index}] 的 Reader 与 ADV 没有使用同一剧情编号`);
        }
        if (chapterId === storyId && readerRawId !== undefined) {
            throw new Error(`routes[${index}].adv.readerRawId 仅可用于跨 Reader 版本身份桥接`);
        }
        if (readerSection !== undefined && section !== readerSection && advPrecision !== 'story-parent') {
            throw new Error(`routes[${index}] 的 Reader 与 ADV 没有使用同一章节`);
        }
        if (advPrecision !== precision) {
            throw new Error(`routes[${index}] 的路由精度与 ADV 精度不一致`);
        }
        adv = readerRawId === undefined
            ? { chapterId, section, precision: advPrecision }
            : { chapterId, section, precision: advPrecision, readerRawId };
    }
    const editionValue = value['edition'];
    let edition;
    if (editionValue !== undefined) {
        if (editionValue !== 'initial' && editionValue !== 'rerun') {
            throw new Error(`routes[${index}].edition 无效`);
        }
        edition = editionValue;
    }
    const translationStatus = value['translationStatus'] === undefined
        ? undefined
        : parseTranslationStatus(value['translationStatus'], `routes[${index}].translationStatus`);
    const variantsValue = value['variants'];
    let variants;
    if (variantsValue !== undefined) {
        if (!Array.isArray(variantsValue) || variantsValue.length !== 2) {
            throw new Error(`routes[${index}].variants 必须包含初回版与复刻版`);
        }
        const parsed = variantsValue.map((variant, variantIndex) => (parseStoryRouteVariant(variant, index, variantIndex)));
        if (new Set(parsed.map((variant) => variant.edition)).size !== 2) {
            throw new Error(`routes[${index}].variants 版本重复`);
        }
        if (edition === undefined || translationStatus === undefined) {
            throw new Error(`routes[${index}] 的版本变体缺少主版本元数据`);
        }
        const primary = parsed.find((variant) => variant.edition === edition);
        if (primary === undefined
            || primary.reader.storyId !== storyId
            || primary.reader.section !== readerSection
            || primary.precision !== precision
            || primary.translationStatus.code !== translationStatus.code
            || primary.translationStatus.label !== translationStatus.label
            || primary.adv?.chapterId !== adv?.chapterId
            || primary.adv?.section !== adv?.section
            || primary.adv?.precision !== adv?.precision
            || primary.adv?.readerRawId !== adv?.readerRawId) {
            throw new Error(`routes[${index}] 的主版本与版本变体不一致`);
        }
        variants = parsed;
    }
    if (canonicalStoryId !== `magireco:${storyId}`) {
        throw new Error(`routes[${index}].canonicalStoryId 与 Reader 编号不一致`);
    }
    return {
        sourceKey,
        canonicalStoryId,
        match,
        precision,
        ...(edition === undefined ? {} : { edition }),
        ...(translationStatus === undefined ? {} : { translationStatus }),
        ...(variants === undefined ? {} : { variants }),
        reader: readerSection === undefined ? { storyId } : { storyId, section: readerSection },
        adv,
    };
}
function parseTargets(value) {
    if (!isRecord(value) || !isRecord(value['reader']) || !isRecord(value['adv'])) {
        throw new Error('targets 无效');
    }
    const indexEntries = value['reader']['indexEntries'];
    const advIndexEntries = value['adv']['readerIndexEntries'];
    if (!Number.isSafeInteger(indexEntries) || Number(indexEntries) < 1) {
        throw new Error('targets.reader.indexEntries 无效');
    }
    if (!Number.isSafeInteger(advIndexEntries) || Number(advIndexEntries) < 1) {
        throw new Error('targets.adv.readerIndexEntries 无效');
    }
    const target = requireString(value['adv']['target'], 'targets.adv.target', TARGET_NAME_RE, 128);
    const readerRepository = requireString(value['adv']['readerRepository'], 'targets.adv.readerRepository', REPOSITORY_RE, 201);
    const readerRevision = requireString(value['adv']['readerRevision'], 'targets.adv.readerRevision', REVISION_RE, 128);
    const readerIndexPath = requireString(value['adv']['readerIndexPath'], 'targets.adv.readerIndexPath', INDEX_PATH_RE, 256);
    if (readerIndexPath.startsWith('/')
        || readerIndexPath.split('/').some(part => part === '' || part === '.' || part === '..')) {
        throw new Error('targets.adv.readerIndexPath 无效');
    }
    if (typeof value['adv']['handoffReady'] !== 'boolean') {
        throw new Error('targets.adv.handoffReady 无效');
    }
    const readerMetadataValues = [
        value['reader']['target'],
        value['reader']['readerRepository'],
        value['reader']['readerRevision'],
        value['reader']['readerIndexPath'],
    ];
    const hasReaderMetadata = readerMetadataValues.some(item => item !== undefined);
    let reader = { indexEntries: Number(indexEntries) };
    if (hasReaderMetadata) {
        const readerTarget = requireString(value['reader']['target'], 'targets.reader.target', TARGET_NAME_RE, 128);
        const readerRepository = requireString(value['reader']['readerRepository'], 'targets.reader.readerRepository', REPOSITORY_RE, 201);
        const readerRevision = requireString(value['reader']['readerRevision'], 'targets.reader.readerRevision', REVISION_RE, 128);
        const readerIndexPath = requireString(value['reader']['readerIndexPath'], 'targets.reader.readerIndexPath', INDEX_PATH_RE, 256);
        if (readerIndexPath.startsWith('/')
            || readerIndexPath.split('/').some(part => part === '' || part === '.' || part === '..')) {
            throw new Error('targets.reader.readerIndexPath 无效');
        }
        reader = {
            indexEntries: Number(indexEntries),
            target: readerTarget,
            readerRepository,
            readerRevision,
            readerIndexPath,
        };
    }
    return {
        reader,
        adv: {
            target,
            handoffReady: value['adv']['handoffReady'],
            readerRepository,
            readerRevision,
            readerIndexPath,
            readerIndexEntries: Number(advIndexEntries),
        },
    };
}
export function parseStoryRouteManifest(input) {
    if (!isRecord(input))
        throw new Error('剧情路由清单必须是对象');
    if (input['version'] !== STORY_ROUTE_MANIFEST_VERSION)
        throw new Error('剧情路由清单版本不支持');
    if (input['bridgeRevision'] !== STORY_ROUTER_REVISION)
        throw new Error('剧情桥接 revision 不支持');
    if (input['sourceCatalog'] !== 'story-v6')
        throw new Error('剧情路由清单来源不支持');
    const catalogRevision = input['catalogRevision'];
    if (typeof catalogRevision !== 'string' || !CATALOG_REVISION_RE.test(catalogRevision)) {
        throw new Error('catalogRevision 无效');
    }
    const catalogGeneratedAt = input['catalogGeneratedAt'];
    if (typeof catalogGeneratedAt !== 'string' || !ISO_INSTANT_RE.test(catalogGeneratedAt)) {
        throw new Error('catalogGeneratedAt 必须是 UTC 时间');
    }
    if (catalogRevisionFromGeneratedAt(catalogGeneratedAt) !== catalogRevision) {
        throw new Error('catalogGeneratedAt 与 catalogRevision 不一致');
    }
    const readerIndexEntries = input['readerIndexEntries'];
    if (!Number.isSafeInteger(readerIndexEntries) || readerIndexEntries < 1) {
        throw new Error('readerIndexEntries 无效');
    }
    if (!Array.isArray(input['routes']))
        throw new Error('routes 必须是数组');
    const targets = parseTargets(input['targets']);
    if (targets.reader.indexEntries !== readerIndexEntries) {
        throw new Error('targets.reader.indexEntries 与 readerIndexEntries 不一致');
    }
    const routes = input['routes'].map(parseRoute);
    const seen = new Set();
    for (const route of routes) {
        if (route.sourceKey.split(':')[1] !== catalogRevision) {
            throw new Error(`剧情路由键与 catalogRevision 不一致：${route.sourceKey}`);
        }
        if (seen.has(route.sourceKey))
            throw new Error(`剧情路由键重复：${route.sourceKey}`);
        seen.add(route.sourceKey);
    }
    return {
        version: STORY_ROUTE_MANIFEST_VERSION,
        bridgeRevision: STORY_ROUTER_REVISION,
        sourceCatalog: 'story-v6',
        catalogRevision,
        catalogGeneratedAt,
        readerIndexEntries: readerIndexEntries,
        targets,
        routes,
    };
}
export function catalogRevisionFromGeneratedAt(catalogGeneratedAt) {
    const match = ISO_INSTANT_RE.exec(catalogGeneratedAt);
    if (match === null)
        throw new Error('catalogGeneratedAt 必须是 UTC 时间');
    const [, year, month, day, hour, minute, second] = match;
    return `${year}${month}${day}t${hour}${minute}${second}z`;
}
export function createStoryRouteIndex(manifest) {
    const result = Object.create(null);
    for (const route of manifest.routes)
        result[route.sourceKey] = route;
    return Object.freeze(result);
}
export function buildStorySourceKey(catalogRevision, categorySlug, rowIndex) {
    if (!CATALOG_REVISION_RE.test(catalogRevision))
        throw new Error('catalogRevision 无效');
    if (!/^[a-z0-9-]{1,64}$/.test(categorySlug))
        throw new Error('categorySlug 无效');
    if (!Number.isSafeInteger(rowIndex) || rowIndex < 0 || rowIndex > 99_999_999) {
        throw new Error('rowIndex 无效');
    }
    return `story-v6:${catalogRevision}:${categorySlug}:${rowIndex}`;
}
export function resolveStoryRoute(index, sourceKey) {
    if (!SOURCE_KEY_RE.test(sourceKey))
        return null;
    return index[sourceKey] ?? null;
}
function parseBaseUrl(value, label) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new Error(`${label} 不是绝对 URL`);
    }
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') ||
        url.username !== '' ||
        url.password !== '' ||
        url.search !== '' ||
        url.hash !== '') {
        throw new Error(`${label} 必须是无认证、无查询参数的 http(s) URL`);
    }
    return url;
}
function stableHash(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}
function safeAnchorToken(value) {
    const trimmed = value.trim();
    const cleaned = trimmed.replace(/[^A-Za-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
    if (cleaned && cleaned === trimmed)
        return cleaned;
    return `${cleaned || 'source'}-${stableHash(trimmed)}`;
}
export function readerSectionAnchorId(sectionDescriptor) {
    if (sectionDescriptor.length === 0
        || sectionDescriptor.length > 512
        || CONTROL_RE.test(sectionDescriptor)) {
        throw new Error('Reader section 无效');
    }
    const descriptor = /^(.*?)\s+Section\s*(\d+)\b/i.exec(sectionDescriptor);
    if (descriptor === null)
        throw new Error('Reader section 格式无效');
    const source = safeAnchorToken(descriptor[1]?.trim() || 'story');
    const section = safeAnchorToken(descriptor[2] ?? 'unknown');
    const branch = /(?:Branch|分支|group)\s*_?\s*(\d+)/i.exec(sectionDescriptor)?.[1];
    return `sec-${source}-${section}${branch ? `-branch-${safeAnchorToken(branch)}` : ''}`;
}
export function advScenarioSectionId(sectionDescriptor) {
    if (sectionDescriptor.length === 0
        || sectionDescriptor.length > 512
        || CONTROL_RE.test(sectionDescriptor)) {
        throw new Error('ADV section 无效');
    }
    const descriptor = /^(.*?)\s+Section\s*\d+\b/i.exec(sectionDescriptor);
    if (descriptor === null)
        throw new Error('ADV section 格式无效');
    return requireString(descriptor[1]?.trim(), 'ADV scenario section id', STORY_ID_RE, 256);
}
export function isAdvHandoffEnabled(manifestReady, environmentValue) {
    return manifestReady && environmentValue === '1';
}
export function buildReaderTargetUrl(baseUrl, storyId, section) {
    requireString(storyId, 'Reader storyId', STORY_ID_RE, 256);
    const base = parseBaseUrl(baseUrl, 'Reader base URL');
    if (!base.pathname.endsWith('/'))
        base.pathname += '/';
    const url = new URL(`reader/${encodeURIComponent(storyId)}`, base);
    if (section !== undefined) {
        const anchor = readerSectionAnchorId(section);
        url.searchParams.set('section', anchor);
        url.hash = anchor;
    }
    return url.toString();
}
export function buildAdvTargetUrl(baseUrl, chapterId, section, readerRevision, renderer = 'pixi-v2') {
    requireString(chapterId, 'ADV chapterId', STORY_ID_RE, 256);
    requireString(readerRevision, 'ADV Reader revision', REVISION_RE, 128);
    requireString(renderer, 'ADV renderer', TARGET_NAME_RE, 128);
    const scenarioSectionId = advScenarioSectionId(section);
    const url = parseBaseUrl(baseUrl, 'ADV base URL');
    url.searchParams.set('advRenderer', renderer);
    url.searchParams.set('bridge', String(STORY_ROUTER_REVISION));
    url.searchParams.set('story', chapterId);
    url.searchParams.set('section', scenarioSectionId);
    url.searchParams.set('readerRevision', readerRevision);
    return url.toString();
}
export function resolveStoryTargetUrl(route, target, origins) {
    if (target === 'reader') {
        return buildReaderTargetUrl(origins.readerBaseUrl, route.reader.storyId, route.reader.section);
    }
    if (route.adv === null) {
        throw new Error('该剧情没有与 ADV 数据版本兼容的章节');
    }
    return buildAdvTargetUrl(origins.advBaseUrl, route.adv.chapterId, route.adv.section, origins.advReaderRevision, origins.advRenderer);
}
export function buildRouterUrl(endpoint, sourceKey, target, edition) {
    if (!SOURCE_KEY_RE.test(sourceKey))
        throw new Error('sourceKey 无效');
    const url = parseBaseUrl(endpoint, 'Story Router endpoint');
    url.searchParams.set('source', sourceKey);
    url.searchParams.set('target', target);
    if (edition !== undefined)
        url.searchParams.set('edition', edition);
    return url.toString();
}
function storySpriteParameterValue(parameters, key) {
    let found;
    for (const alias of STORY_SPRITE_ALIASES[key]) {
        const values = parameters.getAll(alias);
        if (values.length > 1 || (values.length === 1 && found !== undefined)) {
            throw new Error(`${key} 出现了重复参数`);
        }
        if (values.length === 1)
            found = values[0];
    }
    return found;
}
function storySpriteParameterBag(raw) {
    return new URLSearchParams(raw.replace(/^[?#]+/, ''));
}
export function parseStorySpriteLocation(search, hash = '') {
    const query = storySpriteParameterBag(search);
    const fallback = storySpriteParameterBag(hash);
    const input = Object.create(null);
    for (const key of STORY_SPRITE_QUERY_KEYS) {
        const queryValue = storySpriteParameterValue(query, key);
        input[key] = queryValue !== undefined && queryValue.normalize('NFC').trim() !== ''
            ? queryValue
            : storySpriteParameterValue(fallback, key);
    }
    return normalizeStorySpriteContext(input);
}
function parseFlexibleWebUrl(value, label, referenceUrl) {
    const trimmed = value.trim();
    if (trimmed === '')
        throw new Error(`${label} 为空`);
    let url;
    try {
        url = referenceUrl === undefined ? new URL(trimmed) : new URL(trimmed, referenceUrl);
    }
    catch {
        throw new Error(`${label} 无效`);
    }
    if ((url.protocol !== 'https:' && url.protocol !== 'http:')
        || url.username !== ''
        || url.password !== '') {
        throw new Error(`${label} 必须解析为无认证的 http(s) URL`);
    }
    return url;
}
function writeStorySpriteContext(url, context) {
    for (const aliases of Object.values(STORY_SPRITE_ALIASES)) {
        for (const alias of aliases)
            url.searchParams.delete(alias);
    }
    for (const key of STORY_SPRITE_QUERY_KEYS) {
        const value = context[key];
        if (value !== undefined && value !== '')
            url.searchParams.append(key, value);
    }
    url.hash = '';
    return url;
}
export function buildStorySpriteViewerUrl(viewerBaseUrl, input, referenceUrl) {
    const context = normalizeStorySpriteContext(input);
    const url = parseFlexibleWebUrl(viewerBaseUrl, 'Sprite Viewer base URL', referenceUrl);
    return writeStorySpriteContext(url, context).toString();
}
export function buildStorySpriteRouterUrl(endpoint, input) {
    const url = parseBaseUrl(endpoint, 'Story Router endpoint');
    url.searchParams.set('target', 'sprite');
    return writeStorySpriteContext(url, normalizeStorySpriteContext(input)).toString();
}
function isStorySpriteMessageType(value) {
    return typeof value === 'string'
        && STORY_SPRITE_MESSAGE_TYPES.includes(value);
}
export function buildStorySpriteMessage(type, input) {
    if (!isStorySpriteMessageType(type))
        throw new Error('Story Sprite 消息类型无效');
    const context = normalizeStorySpriteContext(input);
    const message = {
        type,
        bridgeRevision: STORY_ROUTER_REVISION,
        ...context,
    };
    return type === STORY_SPRITE_MESSAGES.searchOutbound
        ? Object.freeze({ ...message, target: 'sprite' })
        : Object.freeze(message);
}
function storySpriteMessageContext(input) {
    const payload = input['payload'];
    if (payload !== undefined) {
        if (!isRecord(payload))
            throw new Error('Story Sprite payload 必须是对象');
        return payload;
    }
    const context = input['context'];
    if (context !== undefined) {
        if (!isRecord(context))
            throw new Error('Story Sprite context 必须是对象');
        return context;
    }
    return input;
}
export function parseStorySpriteMessage(input, allowedTypes = STORY_SPRITE_MESSAGE_TYPES) {
    if (!isRecord(input))
        throw new Error('Story Sprite 消息必须是对象');
    if (input['bridgeRevision'] !== STORY_ROUTER_REVISION) {
        throw new Error('Story Sprite bridgeRevision 不受支持');
    }
    const type = input['type'];
    if (!isStorySpriteMessageType(type) || !allowedTypes.includes(type)) {
        throw new Error('Story Sprite 消息类型无效');
    }
    if (input['target'] !== undefined && input['target'] !== 'sprite') {
        throw new Error('Story Sprite 消息目标无效');
    }
    const message = buildStorySpriteMessage(type, storySpriteMessageContext(input));
    return input['target'] === 'sprite' && message.target === undefined
        ? Object.freeze({ ...message, target: 'sprite' })
        : message;
}
export function readTrustedStorySpriteMessage(event, expectation) {
    let expectedOrigin;
    try {
        expectedOrigin = parseFlexibleWebUrl(expectation.origin, 'expected origin').origin;
    }
    catch {
        return null;
    }
    if (event.source !== expectation.source || event.origin !== expectedOrigin)
        return null;
    try {
        return parseStorySpriteMessage(event.data, expectation.types ?? STORY_SPRITE_MESSAGE_TYPES);
    }
    catch {
        return null;
    }
}
function errorResponse(status, code, message, head, additionalHeaders = {}) {
    const body = JSON.stringify({ ok: false, code, message });
    return new Response(head ? null : body, {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            ...additionalHeaders,
        },
    });
}
export function handleStoryRouterRequest(request, index, origins) {
    const head = request.method === 'HEAD';
    if (request.method !== 'GET' && !head) {
        return errorResponse(405, 'method_not_allowed', '仅接受 GET 或 HEAD', false, { Allow: 'GET, HEAD' });
    }
    const url = new URL(request.url);
    const sources = url.searchParams.getAll('source');
    const targets = url.searchParams.getAll('target');
    const editions = url.searchParams.getAll('edition');
    if (targets.length !== 1) {
        return errorResponse(400, 'bad_request', 'target 必须出现一次', head);
    }
    const target = targets[0];
    if (target === 'sprite') {
        if (sources.length !== 0 || editions.length !== 0) {
            return errorResponse(400, 'bad_request', 'Sprite 路由不接受 source 或 edition', head);
        }
        let context;
        try {
            context = parseStorySpriteLocation(url.search);
        }
        catch (error) {
            return errorResponse(400, 'bad_request', error instanceof Error ? error.message : 'Story Sprite 参数错误', head);
        }
        let location;
        try {
            location = buildStorySpriteViewerUrl(origins.spriteBaseUrl ?? '/sprite-viewer/', context, request.url);
        }
        catch (error) {
            return errorResponse(500, 'router_misconfigured', error instanceof Error ? error.message : 'Sprite Viewer 配置错误', head);
        }
        return new Response(null, {
            status: 302,
            headers: {
                Location: location,
                'Cache-Control': 'public, max-age=300',
            },
        });
    }
    if (sources.length !== 1) {
        return errorResponse(400, 'bad_request', 'source 必须出现一次', head);
    }
    const sourceKey = sources[0] ?? '';
    if (editions.length > 1 || (editions.length === 1 && editions[0] !== 'initial' && editions[0] !== 'rerun')) {
        return errorResponse(400, 'bad_request', 'edition 只接受 initial 或 rerun', head);
    }
    if (!SOURCE_KEY_RE.test(sourceKey) || (target !== 'reader' && target !== 'adv')) {
        return errorResponse(400, 'bad_request', 'source 或 target 格式错误', head);
    }
    const routeRecord = resolveStoryRoute(index, sourceKey);
    if (routeRecord === null) {
        return errorResponse(404, 'route_not_found', '该搜索结果尚未登记剧情路由', head);
    }
    const requestedEdition = editions[0];
    const route = requestedEdition === undefined
        ? routeRecord
        : routeRecord.variants?.find((variant) => variant.edition === requestedEdition) ?? null;
    if (route === null) {
        return errorResponse(404, 'edition_not_available', '该搜索结果没有所选初回/复刻版本', head);
    }
    if (target === 'adv' && route.adv === null) {
        return errorResponse(404, 'target_not_available', '该搜索行尚无经过验证的 ADV 精确章节', head);
    }
    if (target === 'adv' && !origins.advHandoffEnabled) {
        return errorResponse(409, 'target_not_ready', 'ADV 启动接收器尚未启用', head);
    }
    let location;
    try {
        location = resolveStoryTargetUrl(route, target, origins);
    }
    catch (error) {
        return errorResponse(500, 'router_misconfigured', error instanceof Error ? error.message : 'Story Router 配置错误', head);
    }
    return new Response(null, {
        status: 302,
        headers: {
            Location: location,
            'Cache-Control': 'public, max-age=300',
        },
    });
}
