/**
 * 属性による魔法少女の絞り込み検索（call.html用に改修版）
 * call.htmlのキャラクター選択ボックスの表示・非表示を切り替える。
 * charaAt.jsのキー（例：「七海やちよ(水着ver)」）とHTMLのID（例：「七海やちよ」）が
 * 不一致でも、前方一致で賢くマッピングする。
 */
function magicalGirlAttributeSearch(htmlName) {
    // 1. ユーザーが選択した属性（学校、学年など）を配列に取得
    const elFavorites = document.querySelectorAll('#at_form [name="at_attribute"]');
    const selectedAttributes = [...elFavorites]
        .filter((el) => el.checked)
        .map((el) => el.value);

    // 絞り込み検索テキストをリセット
    document.getElementById('ndownword1').value = '';
    document.getElementById('ndownword2').value = '';

    // 2. 属性が何も選択されていない場合は、全員表示して終了
    if (selectedAttributes.length === 0) {
        allShow();
        ndownResetButternReset();
        return;
    }

    // 3. HTMLに存在するすべてのキャラクターの「基礎ID」を取得する
    const baseCharaIDs = new Set();
    const checkboxes = document.getElementsByName("chara");
    Array.prototype.forEach.call(checkboxes, (checkbox) => {
        if (checkbox.id) {
            baseCharaIDs.add(checkbox.id);
        }
    });

    // 4. 表示すべき基礎IDを格納するSetを準備
    const idsToShow = new Set();
    const andOrMode = document.getElementById("at_form").at_and_or.value;

    // 5. charaAttribute.js の全データをループして、表示すべきキャラを決定
    for (let [versionedName, charaAttrs] of charaAttribute) {
        let matchCount = 0;
        selectedAttributes.forEach(selectedAttr => {
            if (charaAttrs.has(selectedAttr)) {
                matchCount++;
            }
        });

        const isMatch = (andOrMode === "AND" && matchCount === selectedAttributes.length) ||
                        (andOrMode === "OR" && matchCount > 0);

        if (isMatch) {
            // マッチした場合、このバージョン名（例：七海やちよ(水着ver)）が
            // どの基礎ID（例：七海やちよ）に属するかを探す
            for (const baseId of baseCharaIDs) {
                if (versionedName.startsWith(baseId)) {
                    idsToShow.add(baseId);
                    break; // 見つかったら次のバージョン名のチェックへ
                }
            }
        }
    }

    // 6. 最後に、HTML要素の表示・非表示をまとめて実行
    allHidden(); // まず全員を隠す
    for (const baseId of idsToShow) {
        const element = document.getElementById(baseId);
        if (element && element.parentNode) {
            element.parentNode.style.display = "inline"; // 表示すべきキャラだけ表示
        }
    }

    // 絞り込みリセットボタンを強調
    ndownResetButternCaution();
}

// 属性検索フォームのリセット（補助関数、既存のまま）
function mgirlShReset(htmlName) {
    allShow();
    document.forms["at_form"].reset();
    ndownResetButternReset();
}

// 全キャラクターを表示（補助関数、mgirlNarrow.jsにあるはずだが念のため定義）
function allShow() {
    const girlboxes = document.getElementsByClassName("girlbox");
    for (i = 0; i < girlboxes.length; i++) {
        girlboxes[i].style.display = "inline";
    }
}

// 全キャラクターを非表示（補助関数、mgirlNarrow.jsにあるはずだが念のため定義）
function allHidden() {
    const girlboxes = document.getElementsByClassName("girlbox");
    for (i = 0; i < girlboxes.length; i++) {
        girlboxes[i].style.display = "none";
    }
}

// リセットボタンのスタイル変更（補助関数、ndownReset.jsにあるはずだが念のため定義）
function ndownResetButternCaution(){
	const elements = document.getElementsByClassName("ndownReset");
    Array.prototype.forEach.call(elements, (el) => {
        el.classList.add("ndownReset_caution");
    });
}

function ndownResetButternReset(){
	const elements = document.getElementsByClassName("ndownReset");
    Array.prototype.forEach.call(elements, (el) => {
        el.classList.remove("ndownReset_caution");
    });
}

// 中国語版の表示名補正。
// 「まどドラ」は『魔法少女まどか☆マギカ Magia Exedra』の略称であり、
// 別キャラクター「まどか先輩」ではない。フィルターの内部値は従来どおり
// `まどドラ` のまま保持し、表示文字列だけを正しい名称へ統一する。
const attributeDisplayNameCorrections = new Map([
    ['まどドラ', 'Magia Exedra']
]);

function correctAttributeDisplayNames() {
    // 静的な属性チェックボックスの表示名を、valueを基準に補正する。
    // 文字列の並び順に依存しないため、今後属性が追加・並べ替えされてもずれない。
    document.querySelectorAll('#at_form input.at_attribute').forEach((input) => {
        const correctedName = attributeDisplayNameCorrections.get(input.value);
        if (!correctedName) return;

        const label = input.closest('label');
        if (!label) return;

        Array.from(label.childNodes).forEach((node) => {
            if (node.nodeType !== Node.TEXT_NODE) return;
            if (node.textContent.includes('小圆前辈')) {
                node.textContent = node.textContent.replace('小圆前辈', correctedName);
            }
        });
    });

    // 身高图的“自定义属性”轴由内联脚本动态生成，旧翻译也会生成「小圆前辈」。
    // 只修正精确匹配的属性轴标签，避免影响真正的角色「まどか先輩」。
    document.querySelectorAll('.x-axis-label').forEach((label) => {
        if (label.textContent.trim() === '小圆前辈') {
            label.textContent = attributeDisplayNameCorrections.get('まどドラ');
        }
    });
}

// 本脚本位于属性表单之后加载，因此先立即修正一次；随后监听身高图等动态DOM。
correctAttributeDisplayNames();

if (typeof MutationObserver !== 'undefined') {
    const attributeLabelObserver = new MutationObserver(() => {
        correctAttributeDisplayNames();
    });
    attributeLabelObserver.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
}
