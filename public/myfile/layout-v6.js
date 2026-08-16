/* V6: move legacy inline base-character stars into the top-right card corner. */
(function (global) {
  'use strict';

  function moveStars() {
    const labels = document.querySelectorAll('form[name="magicalgirl"] label.girlbox, div.magicalgirl label.girlbox');
    let moved = 0;
    for (const label of labels) {
      if (label.querySelector('.main-card-star-v6')) continue;
      let hasStar = false;
      const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT);
      const textNodes = [];
      while (walker.nextNode()) textNodes.push(walker.currentNode);
      for (const node of textNodes) {
        if (!node.nodeValue?.includes('★')) continue;
        hasStar = true;
        node.nodeValue = node.nodeValue.replace(/★/g, '');
      }
      if (!hasStar) continue;
      const star = document.createElement('span');
      star.className = 'main-card-star-v6';
      star.textContent = '★';
      star.setAttribute('aria-label', '包含基础角色版本');
      star.title = '包含基础角色版本';
      label.appendChild(star);
      moved += 1;
    }
    document.documentElement.dataset.mainStarsV6 = String(moved);
    return moved;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', moveStars, { once: true });
  else moveStars();
  global.__MAGIRECO_LAYOUT_V6__ = Object.freeze({ moveStars });
})(window);
