// Text filtering for the character selector.
(function (global) {
    'use strict';

    function katakanaToHiragana(value) {
        return String(value || '')
            .replace(/[ァ-ヶ]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0x60))
            .replace(/ヷ/g, 'わ゙')
            .replace(/ヸ/g, 'ゐ゙')
            .replace(/ヹ/g, 'ゑ゙')
            .replace(/ヺ/g, 'を゙')
            .replace(/ヽ/g, 'ゝ')
            .replace(/ヾ/g, 'ゞ');
    }

    function normalizeSearchText(value) {
        return katakanaToHiragana(String(value || '')
            .normalize('NFKC')
            .replace(/\u3000/g, ' ')
            .toLocaleLowerCase())
            .normalize('NFKC')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getLabel(checkbox) {
        return checkbox ? checkbox.closest('label.girlbox') : null;
    }

    function allShow() {
        for (const checkbox of global.MagirecoNameUtils.getCharacterCheckboxes()) {
            const label = getLabel(checkbox);
            if (label) label.style.display = '';
        }
    }

    function allHidden() {
        for (const checkbox of global.MagirecoNameUtils.getCharacterCheckboxes()) {
            const label = getLabel(checkbox);
            if (label) label.style.display = 'none';
        }
    }

    function mgirlNarrow(htmlName, inputId) {
        const input = document.getElementById(inputId);
        if (!input) return;

        const keywordText = normalizeSearchText(input.value);
        if (htmlName === 'index' && document.forms.at_form) {
            document.forms.at_form.reset();
            const result = document.getElementById('at_result');
            if (result) {
                result.style.border = '';
                result.textContent = '';
            }
        }

        if (!keywordText) {
            allShow();
            if (typeof ndownResetButternReset === 'function') ndownResetButternReset();
            return;
        }

        const terms = keywordText.split(' ').filter(Boolean);
        for (const checkbox of global.MagirecoNameUtils.getCharacterCheckboxes()) {
            const label = getLabel(checkbox);
            if (!label) continue;

            const searchable = normalizeSearchText([
                checkbox.value,
                checkbox.id,
                label.dataset.kana,
                label.textContent,
                global.MagirecoNameUtils.normalizeShortName(checkbox.value)
            ].filter(Boolean).join(' '));

            label.style.display = terms.some((term) => searchable.includes(term)) ? '' : 'none';
        }

        if (typeof ndownResetButternCaution === 'function') ndownResetButternCaution();
    }

    function girlResetBtnInable() {
        for (const id of ['mgreset', 'mgreset2']) {
            const button = document.getElementById(id);
            if (button) button.disabled = true;
        }
    }

    global.mgirlNarrow = mgirlNarrow;
    global.allShow = allShow;
    global.allHidden = allHidden;
    global.girlResetBtnInable = girlResetBtnInable;
})(window);