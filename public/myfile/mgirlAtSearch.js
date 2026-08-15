/**
 * Attribute filtering for the character selector.
 * Character variants are matched only at explicit variant boundaries, never by an
 * unrestricted prefix that can merge unrelated names.
 */
(function (global) {
    'use strict';

    function magicalGirlAttributeSearch() {
        const form = document.getElementById('at_form');
        if (!form || typeof charaAttribute === 'undefined') return;

        const selectedAttributes = Array.from(form.querySelectorAll('[name="at_attribute"]:checked'))
            .map((element) => element.value);
        for (const id of ['ndownword1', 'ndownword2']) {
            const input = document.getElementById(id);
            if (input) input.value = '';
        }

        if (selectedAttributes.length === 0) {
            if (typeof global.allShow === 'function') global.allShow();
            if (typeof ndownResetButternReset === 'function') ndownResetButternReset();
            return;
        }

        const checkboxes = global.MagirecoNameUtils.getCharacterCheckboxes();
        const idsToShow = new Set();
        const modeInput = form.querySelector('input[name="at_and_or"]:checked');
        const mode = modeInput ? modeInput.value : 'AND';

        for (const [versionedName, attributes] of charaAttribute) {
            const matches = selectedAttributes.filter((attribute) => attributes.has(attribute)).length;
            const accepted = mode === 'OR' ? matches > 0 : matches === selectedAttributes.length;
            if (!accepted) continue;

            for (const checkbox of checkboxes) {
                if (global.MagirecoNameUtils.variantBelongsTo(versionedName, checkbox.id)) {
                    idsToShow.add(checkbox.id);
                    break;
                }
            }
        }

        if (typeof global.allHidden === 'function') global.allHidden();
        for (const id of idsToShow) {
            const checkbox = document.getElementById(id);
            const label = checkbox ? checkbox.closest('label.girlbox') : null;
            if (label) label.style.display = '';
        }
        if (typeof ndownResetButternCaution === 'function') ndownResetButternCaution();
    }

    function mgirlShReset() {
        if (typeof global.allShow === 'function') global.allShow();
        const form = document.getElementById('at_form');
        if (form) form.reset();
        if (typeof ndownResetButternReset === 'function') ndownResetButternReset();
    }

    global.magicalGirlAttributeSearch = magicalGirlAttributeSearch;
    global.mgirlShReset = mgirlShReset;
})(window);
