// ==UserScript==
// @name         Torn RR Odds
// @namespace    https://github.com/vexiumlabs/torn-scripts
// @version      1.0.0
// @description  Show single, double, and triple shot risks from the odds displayed in Torn Russian Roulette.
// @author       DarrylPhilbin
// @license      GPL-3.0-only
// @copyright    2026 DarrylPhilbin
// @updateURL    https://raw.githubusercontent.com/VexiumLabs/torn-scripts/main/rr-odds/torn-rr-odds.user.js
// @downloadURL  https://raw.githubusercontent.com/VexiumLabs/torn-scripts/main/rr-odds/torn-rr-odds.user.js
// @match        https://www.torn.com/page.php?sid=russianRoulette*
// @match        https://torn.com/page.php?sid=russianRoulette*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==
// Copyright (C) 2026 DarrylPhilbin. SPDX-License-Identifier: GPL-3.0-only
// Distributed under GNU GPL version 3, WITHOUT ANY WARRANTY. See ../LICENSE.

(() => {
  'use strict';
  function readChambers(text) {
    if (/\bBANG!|waiting for (?:a participant|player)/i.test(text)) return null;
    const matches = [...text.matchAll(/Your odds of getting the bullet:\s*1 in ([1-6])\b/gi)];
    const values = new Set(matches.map(match => Number(match[1])));
    if (values.size === 1) return [...values][0];
    if (values.size > 1) return null;
    if (/You slowly aim at your foot, preparing to take the first go\./i.test(text)) return 6;
    return null;
  }
  function shotOdds(remaining, shots) {
    if (!Number.isInteger(remaining) || remaining < 1 || remaining > 6 ||
        !Number.isInteger(shots) || shots < 1 || shots > Math.min(3, remaining)) return null;
    return { hit: shots / remaining, safe: (remaining - shots) / remaining };
  }
  if (typeof module === 'object' && module.exports) {
    module.exports = { readChambers, shotOdds };
    return;
  }
  const ID = 'torn-rr-odds';
  if (window.top !== window.self || document.getElementById(ID) || new URL(location.href).searchParams.get('sid') !== 'russianRoulette') return;
  const panel = document.createElement('section');
  panel.id = ID;
  panel.setAttribute('aria-label', 'Russian Roulette shot odds');
  panel.setAttribute('aria-live', 'polite');
  const style = document.createElement('style');
  style.textContent = `#${ID}{box-sizing:border-box;margin:8px 0;padding:10px 12px;border:1px solid #666;border-radius:5px;background:#252525;color:#eee;font:13px/1.5 Arial,sans-serif;width:100%}#${ID}[hidden]{display:none!important}#${ID} strong{color:#f0c66b}#${ID} .rr-rows{display:flex;flex-wrap:wrap;gap:6px 18px}#${ID} small{display:block;color:#bbb;font-size:11px;margin-top:4px}`;
  document.head.append(style);
  const visible = node => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
  const percent = value => (value * 100).toFixed(1).replace(/\.0$/, '') + '%';
  let previous = '';
  function render() {
    if (document.visibilityState !== 'visible') return;
    const host = document.getElementById('react-root');
    const inGame = /^#\/game(?:[/?]|$)/.test(location.hash);
    if (!host || !inGame || !visible(host)) { panel.hidden = true; previous = ''; return; }
    // Keep the helper outside React's managed subtree and outside its text scan.
    if (panel.previousElementSibling !== host) host.after(panel);
    panel.hidden = false;
    const text = host.innerText;
    const controls = [...host.querySelectorAll('button')].filter(visible);
    const shoot = controls.find(button => /^SHOOT$/i.test(button.textContent.trim()));
    const ended = /\bBANG!/i.test(text);
    const remaining = shoot && !shoot.disabled && shoot.getAttribute('aria-disabled') !== 'true' ? readChambers(text) : null;
    const rows = [];
    if (remaining !== null) {
      for (let shots = 1; shots <= 3; shots++) {
        const available = shots === 1 || controls.some(button => new RegExp('^[X×]\\s*' + shots + '$', 'i').test(button.textContent.trim()) && !button.disabled && button.getAttribute('aria-disabled') !== 'true');
        const odds = shotOdds(remaining, shots);
        if (available && odds) rows.push(`${shots === 1 ? 'Single' : shots === 2 ? 'Double' : 'Triple'}: ${percent(odds.hit)} hit / ${percent(odds.safe)} safe`);
      }
    }
    const title = remaining === null ? (ended ? 'Round finished' : 'Waiting for your next shot odds…') : `${remaining} chamber${remaining === 1 ? '' : 's'} remaining`;
    const state = JSON.stringify([title, rows]);
    if (state === previous) return;
    previous = state;
    panel.replaceChildren();
    const heading = document.createElement('strong'); heading.textContent = title; panel.append(heading);
    if (rows.length) {
      const list = document.createElement('div'); list.className = 'rr-rows';
      for (const row of rows) { const item = document.createElement('span'); item.textContent = row; list.append(item); }
      const note = document.createElement('small');
      note.textContent = 'Risk across the selected consecutive shots, not overall match win odds.';
      panel.append(list, note);
    }
  }
  let queued = false;
  function schedule() {
    if (queued || document.visibilityState !== 'visible') return;
    queued = true;
    requestAnimationFrame(() => { queued = false; render(); });
  }
  new MutationObserver(records => {
    if (records.some(record => !panel.contains(record.target))) schedule();
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'aria-disabled', 'class', 'style'] });
  window.addEventListener('hashchange', schedule);
  document.addEventListener('visibilitychange', schedule);
  setInterval(schedule, 1000);
  render();
})();
