// Exact grade classification. School names are never used to infer a grade.
(function (global) {
    'use strict';

    const U = global.MagirecoNameUtils;
    if (!U || typeof callTable === 'undefined' || typeof charaAttribute === 'undefined') return;

    const exact = new Map([
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

    function classify(rawValue) {
        const raw = String(rawValue || '').trim();
        const result = new Set();

        if (exact.has(raw)) {
            exact.get(raw).forEach((value) => result.add(value));
            return result;
        }

        if (/^小/u.test(raw)) {
            result.add('小学生');
        } else if (/^(?:初|中)[一1]/u.test(raw)) {
            result.add('中1');
            result.add('中学生');
        } else if (/^(?:初|中)[二2]/u.test(raw)) {
            result.add('中2');
            result.add('中学生');
        } else if (/^(?:初|中)[三3]/u.test(raw)) {
            result.add('中3');
            result.add('中学生');
        } else if (/^高[一1]/u.test(raw)) {
            result.add('高1');
            result.add('高校生');
        } else if (/^高[二2]/u.test(raw)) {
            result.add('高2');
            result.add('高校生');
        } else if (/^高[三3]/u.test(raw)) {
            result.add('高3');
            result.add('高校生');
        } else if (['大1', '浪人生', '专门生', '成人?'].includes(raw)) {
            result.add('その他');
        }

        if (result.size === 0) result.add('学年不明');
        return result;
    }

    function addAttributes(japaneseName, attributes) {
        for (const [versionedName, target] of charaAttribute) {
            if (!U.variantBelongsTo(versionedName, japaneseName)) continue;
            attributes.forEach((attribute) => target.add(attribute));
        }
    }

    for (const [longKey, details] of callTable) {
        const japaneseName = U.getJapaneseNameFromValue(longKey);
        if (!japaneseName || !(details instanceof Map)) continue;

        const attributes = classify(details.get('学年'));
        const override = global.EXPLICIT_GRADE_ATTRIBUTES instanceof Map
            ? global.EXPLICIT_GRADE_ATTRIBUTES.get(japaneseName)
            : null;

        if (override) {
            attributes.delete('学年不明');
            override.forEach((attribute) => attributes.add(attribute));
        }

        addAttributes(japaneseName, attributes);
    }
})(window);
