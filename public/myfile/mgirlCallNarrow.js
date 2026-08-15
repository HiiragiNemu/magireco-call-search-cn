// Double-click filtering based on outgoing and incoming call relationships.
(function (global) {
    'use strict';

    function getMode() {
        const form = document.getElementById('callFilterForm') ||
            document.querySelector('form[name="callcate"], form.calloption');
        const checked = form ? form.querySelector('input[name="vector"]:checked') : null;
        return checked ? checked.value : 'OR';
    }

    function getOutgoing(canonical) {
        const key = global.MagirecoNameUtils.findCallTableKey(canonical);
        if (!key || typeof callTable === 'undefined') return new Set();
        return global.MagirecoNameUtils.relationTargets(callTable.get(key));
    }

    function showCanonical(canonical) {
        const checkbox = global.MagirecoNameUtils.findCheckboxByAnyName(canonical);
        if (!checkbox) return;
        const label = checkbox.closest('label.girlbox');
        if (label) label.style.display = '';
    }

    function mgirlCallNarrow(element) {
        const checkbox = element && element.matches && element.matches('input[name="chara"]')
            ? element
            : element && element.querySelector
                ? element.querySelector('input[name="chara"]')
                : null;
        if (!checkbox) return;

        const canonical = global.MagirecoNameUtils.canonicalFromCheckbox(checkbox);
        const outgoing = getOutgoing(canonical);
        const incomingMap = global.MagirecoNameUtils.buildCalledMap();
        const incoming = incomingMap.get(canonical) || new Set();
        const mode = getMode();
        const result = new Set([canonical]);

        if (mode === 'call') {
            outgoing.forEach((name) => result.add(name));
        } else if (mode === 'called') {
            incoming.forEach((name) => result.add(name));
        } else if (mode === 'mutual') {
            outgoing.forEach((name) => {
                if (incoming.has(name)) result.add(name);
            });
        } else if (mode === 'oneWay') {
            const union = new Set([...outgoing, ...incoming]);
            union.forEach((name) => {
                if (!(outgoing.has(name) && incoming.has(name))) result.add(name);
            });
        } else {
            outgoing.forEach((name) => result.add(name));
            incoming.forEach((name) => result.add(name));
        }

        if (typeof global.allHidden === 'function') global.allHidden();
        result.forEach(showCanonical);
        checkbox.checked = true;

        if (typeof ndownResetButternCaution === 'function') ndownResetButternCaution();
    }

    global.mgirlCallNarrow = mgirlCallNarrow;
})(window);
