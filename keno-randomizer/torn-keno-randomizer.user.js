// ==UserScript==
// @name         Torn Keno Randomizer
// @namespace    https://github.com/vexiumlabs/torn-scripts
// @author       DarrylPhilbin
// @version      1.0.0
// @description  Randomly select one to ten numbers on Torn's Keno board.
// @match        https://www.torn.com/page.php*
// @match        https://torn.com/page.php*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==

(() => {
  'use strict';
  if (new URLSearchParams(location.search).get('sid') !== 'keno') return;
  const ID = 'tkr-panel';
  const KEY = 'torn-keno-randomizer-count';
  let busy = false;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  // Board selector and marked state corroborated by:
  // https://greasyfork.org/en/scripts/531078-torn-keno-random-selector/code
  function cells() {
    return [...document.querySelectorAll('#boardContainer span')].filter(el =>
      /^\d+$/.test(el.textContent.trim()) && el.getClientRects().length &&
      !el.querySelector('span'));
  }
  function selected(el) { return el.classList.contains('marked'); }
  function blocked(el) {
    return !!el.closest('[disabled], [aria-disabled="true"], .disabled');
  }
  function randomIndex(size) {
    const ceiling = Math.floor(4294967296 / size) * size;
    const buffer = new Uint32Array(1);
    do { crypto.getRandomValues(buffer); } while (buffer[0] >= ceiling);
    return buffer[0] % size;
  }
  async function toggle(number, desired) {
    const el = cells().find(cell => cell.textContent.trim() === number);
    if (!el || blocked(el)) throw new Error('Board unavailable. Try again when the round has finished.');
    if (selected(el) === desired) return;
    el.click();
    for (let attempt = 0; attempt < 20; attempt++) {
      await pause(30);
      const current = cells().find(cell => cell.textContent.trim() === number);
      if (current && selected(current) === desired) return;
    }
    throw new Error('Selection did not change. Wait until the board is ready and try again.');
  }
  function mount() {
    if (document.getElementById(ID)) return;
    const panel = document.createElement('section');
    panel.id = ID;
    panel.setAttribute('aria-label', 'Keno randomizer');
    panel.innerHTML = `<div class="tkr-row"><label for="tkr-count">Picks</label>
      <select id="tkr-count" aria-label="Number of selections">${Array.from({length: 10}, (_, i) => `<option>${i + 1}</option>`).join('')}</select>
      <button type="button">Randomize</button></div>
      <div class="tkr-status" role="status" aria-live="polite">Choose how many numbers to select.</div>`;
    const select = panel.querySelector('select');
    const button = panel.querySelector('button');
    const status = panel.querySelector('.tkr-status');
    let saved = 10;
    try { saved = Number(localStorage.getItem(KEY)) || 10; } catch {}
    select.value = String(Math.min(10, Math.max(1, Math.trunc(saved))));
    select.addEventListener('change', () => {
      try { localStorage.setItem(KEY, select.value); } catch {}
    });
    button.addEventListener('click', async () => {
      if (busy) return;
      const board = cells();
      const count = Number(select.value);
      const numbers = board.map(el => el.textContent.trim());
      if (board.length < 10 || new Set(numbers).size !== board.length) {
        status.textContent = 'Keno board not found. Wait for it to load.';
        return;
      }
      if (board.some(blocked)) {
        status.textContent = 'Wait until the round has finished.';
        return;
      }
      busy = true;
      button.disabled = select.disabled = true;
      status.textContent = 'Selecting…';
      try {
        const pool = [...numbers];
        const desired = new Set();
        for (let i = 0; i < count; i++) desired.add(pool.splice(randomIndex(pool.length), 1)[0]);
        // Remove old picks before adding new ones to respect the selection limit.
        for (const el of board) {
          const number = el.textContent.trim();
          if (selected(el) && !desired.has(number)) await toggle(number, false);
        }
        for (const number of desired) await toggle(number, true);
        const actual = cells().filter(selected).map(el => el.textContent.trim());
        if (actual.length !== count || actual.some(n => !desired.has(n))) {
          throw new Error('Selection changed during randomizing. Click Randomize to try again.');
        }
        status.textContent = `Selected: ${actual.map(Number).sort((a, b) => a - b).join(', ')}`;
      } catch (error) {
        status.textContent = error.message;
      } finally {
        busy = false;
        button.disabled = select.disabled = false;
      }
    });
    document.body.appendChild(panel);
  }
  const style = document.createElement('style');
  style.textContent = `
    #tkr-panel{position:fixed;bottom:18px;left:18px;z-index:10000;width:230px;max-width:calc(100vw - 36px);box-sizing:border-box;padding:10px 12px;background:#292929;color:#eee;border:1px solid #666;border-radius:7px;box-shadow:0 3px 14px #0006;font:12px/1.4 Arial,sans-serif}
    #tkr-panel .tkr-row{display:flex;gap:8px;align-items:center}
    #tkr-panel select{background:#161616;color:#fff;border:1px solid #777;border-radius:4px;padding:5px;font:inherit}
    #tkr-panel button{flex:1;background:#e5a13b;color:#191919;border:1px solid #f2b65e;border-radius:4px;padding:7px 10px;font:bold 12px Arial,sans-serif;cursor:pointer}
    #tkr-panel button:hover{background:#f4b552}
    #tkr-panel button:disabled{opacity:.55;cursor:wait}
    #tkr-panel .tkr-status{margin-top:7px;color:#ccc;font-size:11px;overflow-wrap:anywhere}
  `;
  document.head.appendChild(style);
  mount();
  // Restore the panel if Torn replaces the page content after loading.
  const observer = new MutationObserver(() => { if (!document.getElementById(ID)) mount(); });
  observer.observe(document.body, {childList: true, subtree: true});
})();
