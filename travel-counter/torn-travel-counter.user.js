// ==UserScript==
// @name         Torn Travel Counter
// @namespace    https://github.com/vexiumlabs/torn-scripts
// @author       DarrylPhilbin
// @version      1.2.0
// @description  Display the API key owner's lifetime visits to all eleven Torn travel destinations.
// @match        https://www.torn.com/travelagency.php*
// @match        https://torn.com/travelagency.php*
// @match        https://www.torn.com/page.php*
// @match        https://torn.com/page.php*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// @connect      api.torn.com
// @run-at       document-end
// @noframes
// ==/UserScript==

(() => {
  'use strict';
  const PREFIX = 'travelcounter.v1.';
  const COUNTRIES = [
    ['mexico', 'Mexico'], ['cayman_islands', 'Cayman Islands'], ['canada', 'Canada'],
    ['hawaii', 'Hawaii'], ['united_kingdom', 'United Kingdom'], ['argentina', 'Argentina'],
    ['switzerland', 'Switzerland'], ['japan', 'Japan'], ['china', 'China'],
    ['united_arab_emirates', 'UAE'], ['south_africa', 'South Africa'],
  ];
  function countsFrom(data) {
    const travel = data?.personalstats?.travel;
    return Object.fromEntries(COUNTRIES.map(([key]) => [key,
      Number.isSafeInteger(travel?.[key]) && travel[key] >= 0 ? travel[key] : null]));
  }
  function waitFor(last, now) {
    return Number.isFinite(last) && last > 0 ? Math.max(0, last + 60001 - now) : 0;
  }
  if (typeof module === 'object' && module.exports) {
    module.exports = { COUNTRIES, countsFrom, waitFor };
    return;
  }
  // Match page.php broadly so query parameter order does not matter.
  // Only initialize the panel and API polling on the travel route.
  if (location.pathname !== '/travelagency.php' &&
      !(location.pathname === '/page.php' && new URLSearchParams(location.search).get('sid') === 'travel')) return;
  const isPDA = typeof PDA_httpGet === 'function';
  const useGMStorage = !isPDA && typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
  const read = (name, fallback) => {
    if (useGMStorage) return GM_getValue(PREFIX + name, fallback);
    const value = localStorage.getItem(PREFIX + name);
    try { return value === null ? fallback : JSON.parse(value); } catch { return fallback; }
  };
  const write = (name, value) => {
    if (useGMStorage) GM_setValue(PREFIX + name, value);
    else localStorage.setItem(PREFIX + name, JSON.stringify(value));
  };
  const active = () => !document.hidden && (isPDA || document.hasFocus());
  const revisionId = () => Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16)).join('-');
  // Native Web Locks where available; older mobile WebViews use an atomic
  // IndexedDB reservation shared by tabs. No racy localStorage lock fallback.
  async function withBudgetLock(callback) {
    if (navigator.locks) return navigator.locks.request('torn-travel-counter-api-v1', { ifAvailable: true }, callback);
    const admitted = await new Promise((resolve, reject) => {
      const open = indexedDB.open('torn-travel-counter-budget', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('budget');
      open.onerror = () => reject(new Error('Budget storage unavailable.'));
      open.onblocked = () => reject(new Error('Budget storage blocked.'));
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('budget', 'readwrite');
        const store = tx.objectStore('budget');
        const get = store.get('lastAttempt');
        let allowed = false;
        get.onsuccess = () => {
          const now = Date.now();
          if (!waitFor(get.result || 0, now)) {
            store.put(now, 'lastAttempt'); allowed = true;
          }
        };
        tx.oncomplete = () => { db.close(); resolve(allowed); };
        tx.onabort = tx.onerror = () => { db.close(); reject(new Error('Budget storage failed.')); };
      };
    });
    return callback(admitted ? {} : null);
  }
  function httpGet(options) {
    if (!isPDA) return GM_xmlhttpRequest(options);
    // Ignore late native responses after the timeout, including after key changes.
    let settled = false;
    const finish = (handler, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); handler(value);
    };
    const timer = setTimeout(() => finish(options.ontimeout), options.timeout);
    Promise.resolve().then(() => PDA_httpGet(options.url, options.headers)).then(
      response => finish(options.onload, response),
      () => finish(options.onerror),
    );
  }
  let busy = false;
  const host = document.createElement('section');
  host.id = 'torn-travel-counter';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      :host{display:block;clear:both;margin:12px 0;font:13px/1.5 Arial,sans-serif;color:#e8e8eb}
      section{background:#25272c;border:1px solid #50535c;border-radius:7px;padding:12px}
      header{display:flex;justify-content:space-between;align-items:center;gap:12px}
      h2{font-size:15px;margin:0}button{cursor:pointer;background:#414651;color:white;border:1px solid #757b87;border-radius:4px;padding:5px 9px}
      dl{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:4px 18px;margin:10px 0}
      dl div{display:flex;justify-content:space-between;border-bottom:1px solid #41444b;padding:3px 0;gap:10px}
      dt,dd{margin:0}dd{font-weight:bold;font-variant-numeric:tabular-nums}
      .ttc-milestone{color:#6ddd8a!important}
      p{font-size:12px;color:#c2c6cf;margin:8px 0 0}form{margin-top:12px}
      label{display:block}input{box-sizing:border-box;max-width:100%;width:240px;padding:6px;margin:6px 4px 6px 0}
      [hidden]{display:none!important}
    </style>
    <section aria-label="Travel visit counts"><header><h2>My country visits</h2><button type="button" id="settings" aria-expanded="false">API key</button></header>
      <dl></dl><p id="status" role="status"></p>
      <form hidden><label for="key">Your Limited-access Torn API key</label>
        <input id="key" type="password" autocomplete="off" spellcheck="false" placeholder="Paste key here" required>
        <button type="submit">Save</button> <button type="button" id="forget">Forget key</button>
        <p>Stored locally on this device; sent only to api.torn.com. Counts belong to the key owner.</p>
      </form></section>`;
  const $ = selector => shadow.querySelector(selector);
  const cells = new Map();
  const mobile = window.matchMedia('(max-width: 768px)');
  const countryNames = new Map(COUNTRIES.map(([key, name]) => [name.toLowerCase(), key]));
  countryNames.set('uk', 'united_kingdom');
  countryNames.set('united arab emirates', 'united_arab_emirates');
  const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const inlineStyle = document.createElement('style');
  inlineStyle.textContent = `
    .ttc-mobile-content{display:none!important}
    .ttc-inline-count.ttc-milestone{color:#6ddd8a!important}
    @media(max-width:768px){
      .ttc-country-label{font-size:0!important;min-width:0!important}
      .ttc-country-label > :not(.ttc-mobile-content){display:none!important}
      .ttc-country-label > .ttc-mobile-content{display:flex!important;align-items:center!important;
        gap:7px;width:100%;min-width:0;box-sizing:border-box;font-size:12px;line-height:normal;pointer-events:none}
      .ttc-mobile-content > img{display:block!important;flex:0 0 auto;width:20px;height:20px;object-fit:contain}
      .ttc-mobile-country{font-size:12px!important;font-weight:700;min-width:0;white-space:normal}
      .ttc-inline-count{display:block!important;flex:0 0 auto!important;margin-left:auto!important;
        padding-left:5px;padding-right:6px!important;text-align:right!important;white-space:nowrap!important;font-size:11px!important;
        font-weight:600!important;font-variant-numeric:tabular-nums;pointer-events:none}
    }`;
  document.head.append(inlineStyle);
  function renderInline(cache) {
    if (!mobile.matches) { $('dl').hidden = false; return; }
    const matched = new Set();
    for (const label of document.querySelectorAll('[class*="flagAndName"]')) {
      const row = label.parentElement;
      // Do not treat a container holding several destinations as one country row.
      if (!row || row.querySelectorAll('[class*="flagAndName"]').length !== 1) continue;
      const texts = [label, ...label.querySelectorAll('span, div, p')].map(node => normalize(node.textContent));
      // Some rows place the country directly beside a nested city span.
      for (const node of label.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) texts.push(normalize(node.textContent));
      }
      const key = texts.map(text => countryNames.get(text)).find(Boolean);
      if (!key) continue;
      matched.add(key);
      label.classList.add('ttc-country-label');
      // Keep Torn's row/time/price layout intact. Render a mobile-only view INSIDE
      // the destination cell; CSS hides its original city text, including bare text
      // nodes and separators. Original DOM remains intact for desktop and React.
      let content = label.querySelector(':scope > .ttc-mobile-content');
      if (!content) {
        const flag = label.querySelector('img');
        content = document.createElement('span'); content.className = 'ttc-mobile-content';
        if (flag) {
          const icon = document.createElement('img');
          icon.src = flag.currentSrc || flag.src; icon.alt = '';
          content.append(icon);
        }
        const name = document.createElement('span'); name.className = 'ttc-mobile-country';
        content.append(name);
        const badge = document.createElement('span'); badge.className = 'ttc-inline-count';
        content.append(badge); label.append(content);
      }
      const name = content.querySelector('.ttc-mobile-country');
      const country = COUNTRIES.find(([id]) => id === key)[1];
      if (name.textContent !== country) name.textContent = country;
      const badge = content.querySelector('.ttc-inline-count');
      const count = cache?.counts?.[key];
      const known = Number.isSafeInteger(count) && count >= 0;
      badge.classList.toggle('ttc-milestone', known && count >= 50);
      const text = known ? `${count.toLocaleString()} ${count === 1 ? 'visit' : 'visits'}` : '— visits';
      if (badge.textContent !== text) badge.textContent = text;
      badge.title = cache ? `Lifetime visits · updated ${new Date(cache.at).toLocaleTimeString()}` : 'Waiting for API data';
    }
    // Keep settings/status accessible; suppress the duplicate list only when all destinations matched.
    $('dl').hidden = matched.size === COUNTRIES.length;
  }
  for (const [key, name] of COUNTRIES) {
    const row = document.createElement('div');
    const label = document.createElement('dt'); label.textContent = name;
    const count = document.createElement('dd'); count.textContent = '—';
    row.append(label, count); $('dl').append(row); cells.set(key, count);
  }
  function mount() {
    // Query each selector separately: a combined selector chooses document order,
    // which picked the outer layout ahead of its actual content area.
    const target = ['#mainContainer .content-wrapper', '.content-wrapper', 'main', '#mainContainer']
      .map(selector => document.querySelector(selector))
      .find(node => node && node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden');
    if (target && host.parentNode !== target) target.prepend(host);
    else if (!host.isConnected) document.body.prepend(host);
  }
  function render() {
    const cache = read('cache', null);
    renderInline(cache);
    for (const [key, cell] of cells) {
      const value = cache?.counts?.[key];
      cell.textContent = Number.isSafeInteger(value) && value >= 0 ? value.toLocaleString() : '—';
      cell.classList.toggle('ttc-milestone', Number.isSafeInteger(value) && value >= 50);
    }
    const age = cache ? Math.max(0, Math.floor((Date.now() - cache.at) / 60000)) : 0;
    const updated = cache ? ` ${age >= 2 ? 'Cached · ' : ''}Updated ${new Date(cache.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : '';
    const wait = Math.ceil(waitFor(read('lastAttempt', 0), Date.now()) / 1000);
    const message = !read('key', '') ? 'Add your API key to load visits.'
      : !navigator.locks && typeof indexedDB === 'undefined' ? 'API paused: request coordination is unavailable.'
      : read('error', '') || (busy ? 'Updating…' : cache ? 'Lifetime visits · refreshes once per minute while this tab is active.'
        : wait ? `Waiting for the one-minute request limit (${wait}s).` : 'Waiting to update…');
    $('#status').textContent = message + updated;
  }
  function showSettings() {
    $('form').hidden = !$('form').hidden;
    $('#settings').setAttribute('aria-expanded', String(!$('form').hidden));
    if (!$('form').hidden) $('#key').focus();
  }
  $('#settings').addEventListener('click', showSettings);
  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('Travel Counter API key', () => {
    mount();
    if ($('form').hidden) showSettings();
    host.scrollIntoView({ block: 'center' });
  });
  $('form').addEventListener('submit', event => {
    event.preventDefault();
    const key = $('#key').value.trim();
    if (!/^[a-zA-Z0-9]{16}$/.test(key)) { $('#key').setCustomValidity('Enter a 16-character Torn API key.'); $('#key').reportValidity(); return; }
    // Invalidate old responses even if the same key is saved again.
    write('revision', revisionId());
    write('cache', null); write('error', ''); write('stopped', false); write('key', key);
    $('#key').value = ''; showSettings(); render(); void refresh();
  });
  $('#key').addEventListener('input', () => $('#key').setCustomValidity(''));
  $('#forget').addEventListener('click', () => {
    write('revision', revisionId()); write('key', ''); write('cache', null);
    write('error', ''); write('stopped', false); $('#key').value = ''; render();
  });
  function request(key) {
    return new Promise((resolve, reject) => httpGet({
      method: 'GET', url: 'https://api.torn.com/v2/user/personalstats?cat=travel&comment=TravelCounter',
      headers: { Authorization: `ApiKey ${key}` }, anonymous: true, timeout: 20000,
      onload(response) {
        try {
          const data = JSON.parse(response.responseText);
          if (data.error) {
            const code = Number(data.error.code);
            const error = new Error(`Torn API error ${code}.`);
            error.stop = [1, 2, 7, 10, 13, 16, 18].includes(code);
            throw error;
          }
          if (response.status !== 200) throw new Error(`Torn API HTTP ${response.status}.`);
          resolve(data);
        } catch (error) { reject(error instanceof SyntaxError ? new Error('Unreadable API response.') : error); }
      },
      onerror: () => reject(new Error('Could not reach Torn API.')),
      ontimeout: () => reject(new Error('Torn API timed out.')),
      onabort: () => reject(new Error('API request cancelled.')),
    }));
  }
  async function refresh() {
    if (busy || !active() || !read('key', '') || read('stopped', false)) return;
    busy = true;
    try {
      await withBudgetLock(async lock => {
        if (!lock || !active() || read('stopped', false) || waitFor(read('lastAttempt', 0), Date.now())) return;
        const key = read('key', '');
        if (!key) return;
        const revision = read('revision', '');
        const current = () => revision === read('revision', '') && key === read('key', '');
        write('lastAttempt', Date.now()); render();
        try {
          const counts = countsFrom(await request(key));
          if (!current()) return;
          if (Object.values(counts).every(value => value === null)) {
            write('stopped', true);
            write('error', 'Country stats unavailable. Save a Limited-access key to retry.');
            return;
          }
          write('cache', { at: Date.now(), counts });
          write('error', Object.values(counts).some(value => value === null) ? 'Some country stats were missing (—). Retrying next minute.' : '');
        } catch (error) {
          if (!current()) return;
          write('stopped', !!error.stop);
          write('error', error.message + (error.stop ? ' Check your key and save it again.' : ' Retrying next minute.'));
        }
      });
    } catch { write('error', 'Could not coordinate API access. Will retry.'); }
    finally { busy = false; render(); }
  }
  for (const name of ['cache', 'key', 'error', 'stopped']) {
    if (useGMStorage && typeof GM_addValueChangeListener === 'function') {
      GM_addValueChangeListener(PREFIX + name, () => render());
    }
  }
  if (!useGMStorage) window.addEventListener('storage', event => {
    if (event.key?.startsWith(PREFIX)) render();
  });
  mount(); render();
  if (!read('key', '')) showSettings();
  void refresh();
  // A small local tick handles focus, cached display, and Torn replacing its page container.
  setInterval(() => { if (!document.hidden) { mount(); render(); void refresh(); } }, 5000);
  document.addEventListener('visibilitychange', () => { if (active()) { render(); void refresh(); } });
  window.addEventListener('focus', () => { render(); void refresh(); });
  mobile.addEventListener('change', render);
})();
