// ==UserScript==
// @name         Torn Halloween Helper
// @namespace    https://github.com/vexiumlabs/torn-scripts
// @version      1.1.3
// @updateURL    https://raw.githubusercontent.com/VexiumLabs/torn-scripts/main/halloween-helper/torn-halloween-helper.user.js
// @downloadURL  https://raw.githubusercontent.com/VexiumLabs/torn-scripts/main/halloween-helper/torn-halloween-helper.user.js
// @description  Yearly treat receipts, pinned basket upgrades, and a movable Halloween target list.
// @author       DarrylPhilbin
// @license      GPL-3.0-only
// @copyright    2026 DarrylPhilbin
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @connect      api.torn.com
// @run-at       document-end
// @noframes
// ==/UserScript==
// Copyright (C) 2026 DarrylPhilbin. SPDX-License-Identifier: GPL-3.0-only
// Distributed under GNU GPL version 3, WITHOUT ANY WARRANTY. See ../LICENSE.

(async () => {
  'use strict';
  const ID = 'torn-halloween-helper';
  const UPGRADES = [
    ['I See Dead People', 3, 1], ["Here's Johnny!", 5, 1], ['Doubler', 25, 1],
    ['Tripler', 50, 1], ['Quadrupler', 75, 1], ['Quintupler', 100, 1],
    ['Candyman', 5, 2], ['Sweet Release', 10, 2], ['Bloody Mary', 15, 2],
    ['Nice Chianti', 30, 2], ['Nightcrawler', 45, 2], ["It's Alive", 90, 2],
    ['Cat in Hell', 13, 3], ['Save Your Tears', 95, 3], ['Freebie', 120, 3],
    ['Cold Sweat', 170, 3], ['Cashback', 230, 3], ['Dark Power', 285, 3],
    ['Multipack', 180, 4], ['Deal with the Devil', 320, 4], ['Mortal Coil', 500, 4],
    ['Inflation', 777, 4], ['Shadow of Doubt', 1000, 4], ['Summon Him', 9999, 4]
  ].map(([name, cost, tier]) => ({ name, cost, tier }));
  const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const yearOf = ms => new Date(ms).getUTCFullYear();
  const yearStart = year => Date.UTC(year, 0, 1) / 1000;
  const number = value => /^\d[\d,]*$/.test(String(value)) ? Number(String(value).replace(/,/g, '')) : null;
  function freshYear(data, now) {
    const year = yearOf(now);
    if (data.year === year) return data;
    // Only the event ledger resets. Targets, position and upgrade selection survive.
    return { ...data, year, receipts: {}, unknown: {}, lastSync: 0, job: null, basket: null, notified: null };
  }
  function receipt(log) {
    const title = String(log.details?.title || '');
    const amount = number(log.data?.treats);
    if (!log.id || !Number.isSafeInteger(log.timestamp) || !Number.isSafeInteger(amount) || amount < 1) return null;
    if (Number(log.details?.id) !== 2536 && (!/receiv|gain|collect|inflation|mortal coil/i.test(title) || /exchange|spend|purchase|upgrade/i.test(title))) return null;
    return { id: String(log.id), timestamp: log.timestamp, amount, title: title || 'Treats received' };
  }
  function mergeLogs(data, logs) {
    const receipts = { ...data.receipts }, unknown = { ...data.unknown };
    for (const log of logs) {
      if (yearOf(log.timestamp * 1000) !== data.year) continue;
      const item = receipt(log);
      if (item) receipts[item.id] = item;
      else if (!/exchange|spend|purchase|upgrade|level|basket.*(?:obtain|buy)/i.test(log.details?.title || '')) {
        unknown[String(log.id)] = String(log.details?.title || 'Unrecognized Halloween log');
      }
    }
    return { ...data, receipts, unknown };
  }
  function adjustBasket(basket, logs, syncedAt) {
    if (!basket) return null;
    const next = { ...basket, applied: { ...basket.applied } };
    for (const log of logs) {
      if (log.timestamp * 1000 <= basket.at || next.applied[log.id]) continue;
      const gain = receipt(log), title = log.details?.title || '';
      if (Number(log.details?.id) === 2535 || /exchange/i.test(title)) return null;
      if (gain) next.balance += gain.amount;
      else if (Number(log.details?.id) === 2540 || /purchase|upgrade/i.test(title)) {
        const cost = number(log.data?.cost);
        if (cost === null) return null;
        next.balance -= cost;
      } else if (!/level|basket.*(?:obtain|buy)/i.test(title)) return null;
      next.applied[log.id] = true;
    }
    if (next.balance < 0) return null;
    next.checked = syncedAt;
    return next;
  }
  function nextSavedTarget(data) {
    const targets = data.targets || [];
    if (!targets.length) return null;
    const index = (Number.isSafeInteger(data.cursor) && data.cursor >= 0 ? data.cursor : 0) % targets.length;
    return { target: targets[index], cursor: (index + 1) % targets.length };
  }
  function basketTier(name) {
    const levels = ['Spooky', 'Creepy', 'Freaky', 'Frightful', 'Haunting', 'Shocking', 'Terrifying', 'Horrifying', 'Petrifying', 'Nightmarish', 'Apocalyptic'];
    const index = levels.findIndex(level => new RegExp('\\b' + level + '\\b', 'i').test(name));
    return index < 0 ? 0 : index >= 7 ? 4 : index >= 5 ? 3 : index >= 3 ? 2 : 1;
  }
  function pinStatus(pin, basket, now) {
    if (!pin) return 'No upgrade pinned';
    if (!basket) return `${pin.name}: open your basket to refresh`;
    if (now - (basket.checked || basket.at) > 120000) return `${pin.name}: sync needed to update progress`;
    if (basket.tier < pin.tier) return `${pin.name}: tier ${pin.tier} is locked`;
    return basket.balance >= pin.cost ? `${pin.name}: enough treats!` : `${pin.name}: ${pin.cost - basket.balance} treats to go`;
  }
  // Only follow pagination within the documented log endpoint. Never forward keys to a supplied host.
  function olderPage(metadata, currentURL, oldest) {
    const current = new URL(currentURL);
    const candidates = Object.values(metadata?.links || {}).filter(Boolean).map(value => {
      const url = new URL(value, 'https://api.torn.com');
      if (url.origin !== 'https://api.torn.com' || url.pathname !== '/v2/user/log') throw new Error('Unexpected log pagination URL.');
      url.searchParams.delete('key');
      const to = Number(url.searchParams.get('to'));
      const nano = url.searchParams.get('nanostamp');
      const before = current.searchParams.get('nanostamp');
      if ((to > 0 && to <= oldest && to < Number(current.searchParams.get('to') || Infinity)) ||
          (nano && /^\d+$/.test(nano) && (!before || BigInt(nano) < BigInt(before)))) return url;
      return null;
    }).filter(Boolean);
    return candidates[0]?.href || null;
  }
  if (typeof module === 'object' && module.exports) {
    module.exports = { freshYear, receipt, mergeLogs, adjustBasket, nextSavedTarget, basketTier, pinStatus, olderPage, UPGRADES };
    return;
  }
  if (!document.body || document.getElementById(ID)) return;
  const isPDA = typeof PDA_httpGet === 'function';
  const nativeStorage = isPDA && typeof PDA_storage !== 'undefined' ? PDA_storage : null;
  let cache = nativeStorage ? await nativeStorage.loadAll() : null;
  function getValue(key, fallback) {
    if (nativeStorage) return cache[key] ?? fallback;
    if (!isPDA) return GM_getValue(key, fallback);
    const raw = localStorage.getItem(ID + ':' + key);
    return raw === null ? fallback : JSON.parse(raw);
  }
  async function setValue(key, value) {
    if (nativeStorage) { await nativeStorage.set(key, value); cache[key] = value; }
    else if (isPDA) localStorage.setItem(ID + ':' + key, JSON.stringify(value));
    else GM_setValue(key, value);
  }
  async function deleteValue(key) {
    if (nativeStorage) { await nativeStorage.delete(key); delete cache[key]; }
    else if (isPDA) localStorage.removeItem(ID + ':' + key);
    else GM_deleteValue(key);
  }
  const active = () => document.visibilityState === 'visible' && (isPDA || document.hasFocus());
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
  let account = getValue('hh-account', null), busy = false, scanning = false, lastScan = 0;
  const accountKey = () => 'hh-data-' + account.id;
  function load() { return account ? freshYear(getValue(accountKey(), { targets: [], receipts: {}, unknown: {}, cursor: 0 }), Date.now()) : null; }
  const localLocks = new Map();
  async function locked(name, fn) {
    const run = async () => {
      if (nativeStorage) cache = await nativeStorage.loadAll();
      return fn();
    };
    if (navigator.locks) return navigator.locks.request('hh-' + name, run);
    // Older PDA WebViews: serialize this tab's operations. Use one helper tab.
    const previous = localLocks.get(name) || Promise.resolve();
    const next = previous.catch(() => {}).then(run);
    localLocks.set(name, next);
    try { return await next; } finally { if (localLocks.get(name) === next) localLocks.delete(name); }
  }
  async function update(fn) {
    if (!account) throw new Error('Save your Torn API key first.');
    return locked('data-' + account.id, async () => {
      const data = fn(load()); await setValue(accountKey(), data); return data;
    });
  }
  function sendRequest(options) {
    if (!isPDA) return GM_xmlhttpRequest(options);
    let finished = false;
    const timer = setTimeout(() => { finished = true; options.ontimeout(); }, options.timeout);
    Promise.resolve().then(() => PDA_httpGet(options.url, options.headers)).then(response => {
      if (finished) return;
      finished = true; clearTimeout(timer); return options.onload(response);
    }).catch(() => {
      if (finished) return;
      finished = true; clearTimeout(timer); options.onerror();
    });
  }
  function request(url, key) {
    if (!key) return Promise.reject(new Error('Save your Torn API key first.'));
    const parsed = new URL(url);
    if (parsed.origin !== 'https://api.torn.com' || !parsed.pathname.startsWith('/v2/')) throw new Error('Invalid API destination.');
    return locked('api', async () => {
      const wait = Number(getValue('hh-next-request', 0)) - Date.now();
      if (wait > 0) await delay(Math.min(wait, 60000));
      await setValue('hh-next-request', Date.now() + 1800);
      return new Promise((resolve, reject) => sendRequest({
        method: 'GET', url: parsed.href, headers: { Authorization: 'ApiKey ' + key }, anonymous: true, timeout: 20000,
        async onload(response) {
          try {
            if (response.status !== 200) throw new Error('Torn API HTTP ' + response.status + '. Try again later.');
            const json = JSON.parse(response.responseText);
            if (json.error) {
              await setValue('hh-next-request', Date.now() + 30000);
              throw new Error('Torn API error ' + json.error.code + '. Check key access or try again later.');
            }
            resolve(json);
          } catch (error) { reject(error); }
        }, onerror: () => reject(new Error('Unable to reach Torn API.')), ontimeout: () => reject(new Error('Torn API request timed out.'))
      }));
    });
  }
  const api = path => request('https://api.torn.com/v2/' + path, getValue('hh-key', ''));
  const el = (tag, text, props = {}) => Object.assign(document.createElement(tag), { textContent: text, ...props });
  const button = (label, action) => { const b = el('button', label, { type: 'button' }); b.onclick = () => Promise.resolve().then(action).catch(showError); return b; };
  const root = el('section', '', { id: ID });
  root.innerHTML = '<button type="button" data-pumpkin aria-label="Halloween Helper" title="Click to open; drag to move">🎃</button><div data-panel hidden><header><strong>Halloween Helper</strong><button type="button" data-close aria-label="Close">×</button></header><p data-status role="status"></p><div data-summary></div><div data-goal></div><div data-actions></div><details><summary>Recent treat receipts</summary><ol data-receipts></ol></details><details><summary>Halloween targets</summary><div data-targets></div></details><details><summary>Settings</summary><p>Full Access Torn API key for receipt history. Stored on this device; sent only to api.torn.com.</p><input data-key type="password" autocomplete="off" placeholder="Torn API key" aria-label="Torn API key"><div data-settings></div></details></div>';
  const style = el('style', `#${ID}{position:fixed;z-index:2147483646;font:13px/1.45 Arial,sans-serif;color:#eee}#${ID} *{box-sizing:border-box}#${ID} button,.hh-pin{cursor:pointer;border:1px solid #986131;border-radius:5px;background:#34302c;color:#fff;padding:6px 9px}#${ID} [data-pumpkin]{width:42px;height:42px;font-size:25px;touch-action:none;padding:0;border-radius:50%;background:#292521;box-shadow:0 2px 8px #0007}#${ID} [data-panel]{position:fixed;width:330px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;padding:14px;border:1px solid #c17a35;border-radius:9px;background:#242526;box-shadow:0 5px 24px #0009}#${ID} [hidden]{display:none!important}#${ID} header{display:flex;justify-content:space-between;align-items:center;color:#ffb65e;font-size:16px}#${ID} p{margin:8px 0}#${ID} details{margin-top:12px;border-top:1px solid #555;padding-top:8px}#${ID} summary{cursor:pointer}#${ID} input{width:100%;padding:7px;background:#171819;color:white;border:1px solid #777}#${ID} [data-actions],#${ID} [data-settings]{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}#${ID} [data-summary]{font-size:20px;color:#ffb65e}#${ID} [data-goal]{margin-top:9px}#${ID} li{margin:5px 0}#${ID} a{color:#ffbf75}#${ID} [data-targets]>div{display:flex;gap:5px;align-items:center;margin-top:5px}#${ID} [data-targets] a{flex:1}.hh-pin{font:11px Arial,sans-serif;margin:2px}.hh-basket-pins{padding:8px;border:1px solid #986131;background:#282623;color:white}.hh-sidebar{display:block;width:100%;padding:5px 3px;text-align:left;font:11px/1.4 Arial,sans-serif;color:#ffb65e;background:transparent;border:0;cursor:pointer}`);
  document.head.append(style); document.body.append(root);
  const $ = selector => root.querySelector(selector);
  const popup = $('[data-panel]'), pumpkin = $('[data-pumpkin]');
  // Only explicit target navigation carries the panel to the next page.
  function setPanelOpen(open) {
    popup.hidden = !open;
    if (!open) { try { sessionStorage.removeItem(ID + '-next-panel'); } catch (_) {} }
    if (open) placePopup();
  }
  function message(text) { $('[data-status]').textContent = text; }
  function reportError(error) { message(error.message || 'Something went wrong.'); }
  function showError(error) { reportError(error); setPanelOpen(true); }
  function placePopup() {
    const r = pumpkin.getBoundingClientRect();
    popup.style.left = Math.max(8, Math.min(r.left, innerWidth - popup.offsetWidth - 8)) + 'px';
    popup.style.top = Math.max(8, Math.min(r.bottom + 6, innerHeight - popup.offsetHeight - 8)) + 'px';
  }
  function setPosition(pos) {
    root.style.left = Math.max(8, Math.min(Number(pos?.x) || innerWidth - 64, innerWidth - 50)) + 'px';
    root.style.top = Math.max(8, Math.min(Number(pos?.y) || 180, innerHeight - 50)) + 'px';
    if (!popup.hidden) placePopup();
  }
  let drag = null, moved = false;
  pumpkin.onpointerdown = event => { if (event.button !== 0) return; const r = root.getBoundingClientRect(); drag = { x: event.clientX, y: event.clientY, left: r.left, top: r.top }; moved = false; pumpkin.setPointerCapture(event.pointerId); };
  pumpkin.onpointermove = event => {
    if (!drag) return;
    if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 5) moved = true;
    if (moved) setPosition({ x: drag.left + event.clientX - drag.x, y: drag.top + event.clientY - drag.y });
  };
  pumpkin.onpointerup = () => { if (drag && moved && account) void update(d => ({ ...d, position: { x: parseFloat(root.style.left), y: parseFloat(root.style.top) } })).catch(showError); drag = null; };
  pumpkin.onpointercancel = () => { drag = null; moved = false; };
  pumpkin.onclick = () => { if (moved) { moved = false; return; } render(); setPanelOpen(popup.hidden); };
  $('[data-close]').onclick = () => { setPanelOpen(false); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') setPanelOpen(false); });
  document.addEventListener('pointerdown', e => { if (!root.contains(e.target)) setPanelOpen(false); });
  window.addEventListener('resize', () => setPosition({ x: parseFloat(root.style.left), y: parseFloat(root.style.top) }));

  let sidebar = null;
  const liveCounterEnabled = () => getValue('hh-live-counter', true) !== false;
  const liveCounterToggle = el('input', '', { type: 'checkbox', checked: liveCounterEnabled() });
  liveCounterToggle.style.width = 'auto';
  const liveCounterLabel = el('label', '');
  liveCounterLabel.append(liveCounterToggle, document.createTextNode(' Live treat counter and automatic sync'));
  $('[data-settings]').before(liveCounterLabel);
  style.textContent += '.hh-sidebar[hidden]{display:none!important}';
  liveCounterToggle.onchange = async () => {
    liveCounterToggle.disabled = true;
    try {
      await setValue('hh-live-counter', liveCounterToggle.checked);
      render();
      if (liveCounterEnabled()) autoSyncIfDue();
    } catch (error) { render(); showError(error); }
    finally { liveCounterToggle.disabled = false; }
  };
  function render() {
    const data = load();
    const total = Object.values(data?.receipts || {}).reduce((sum, r) => sum + r.amount, 0);
    $('[data-summary]').textContent = data ? `${total.toLocaleString()} treats · ${data.year}` : 'Connect your Torn account';
    const status = pinStatus(data?.pin, data?.basket, Date.now());
    $('[data-goal]').textContent = status;
    pumpkin.title = `${status}\nClick for controls; drag to move`;
    if (sidebar) sidebar.textContent = `${isPDA ? '🎃 ' + total.toLocaleString() : '🎃 ' + total.toLocaleString() + ' earned'}${data?.pin ? ' · ' + status : ''}`;
    if (sidebar) sidebar.hidden = !liveCounterEnabled();
    liveCounterToggle.checked = liveCounterEnabled();
    if (profileButton) {
      const saved = data?.targets?.some(t => t.id === pageProfileID());
      profileButton.dataset.saved = String(!!saved);
      profileButton.title = targetSaving ? 'Saving Halloween target…' : saved ? 'Saved to Halloween targets — click to remove' : 'Add to Halloween targets';
      profileButton.setAttribute('aria-label', profileButton.title);
      profileButton.setAttribute('aria-pressed', String(!!saved));
      profileButton.disabled = targetSaving;
    }
    for (const {pin, upgrade} of upgradePins.values()) {
      const selected = data?.pin?.name === upgrade.name;
      pin.dataset.selected = String(selected);
      pin.setAttribute('aria-pressed', String(selected));
      pin.title = (selected ? 'Unpin ' : 'Pin ') + upgrade.name;
      pin.setAttribute('aria-label', pin.title);
    }
    const list = $('[data-receipts]'); list.replaceChildren();
    for (const r of Object.values(data?.receipts || {}).sort((a, b) => b.timestamp - a.timestamp).slice(0, 20)) {
      list.append(el('li', `+${r.amount} · ${new Date(r.timestamp * 1000).toLocaleString()} · ${r.title}`));
    }
    if (data && !data.lastSync) list.prepend(el('li', 'History not fully synced yet; total is partial.'));
    if (Object.keys(data?.unknown || {}).length) list.prepend(el('li', 'Some event logs could not be classified; total may be incomplete.'));
    const targets = $('[data-targets]'); targets.replaceChildren();
    for (const target of data?.targets || []) {
      const row = el('div', ''); row.append(el('a', `${target.name} [${target.id}]`, { href: 'https://www.torn.com/profiles.php?XID=' + target.id }), button('Remove', async () => { await update(d => ({ ...d, targets: d.targets.filter(t => t.id !== target.id) })); render(); })); targets.append(row);
    }
    if (!data?.targets?.length) targets.append(el('p', 'Visit a profile and use its pumpkin to save a target.'));
  }
  async function connect() {
    if (busy) return;
    const key = $('[data-key]').value.trim();
    if (!/^[a-zA-Z0-9]{16}$/.test(key)) throw new Error('Enter a valid 16-character Torn API key.');
    busy = true;
    try {
      const result = await request('https://api.torn.com/v2/user/profile', key);
      if (!Number.isSafeInteger(result.profile?.id)) throw new Error('Unrecognized account response.');
      if (account && result.profile.id !== account.id) throw new Error('Use a key for the connected account. This installation keeps one account separate from others.');
      // Check log access before retaining the credential.
      await request('https://api.torn.com/v2/user/log?log=2536&limit=1', key);
      account = { id: result.profile.id, name: result.profile.name };
      await setValue('hh-key', key); await setValue('hh-account', account); $('[data-key]').value = '';
      await update(d => d); setPosition(load().position); render(); message('Connected as ' + account.name + '. Syncing event history…');
    } finally { busy = false; }
    await sync();
  }
  $('[data-settings]').append(button('Save key', connect), button('Forget key', async () => { await deleteValue('hh-key'); message('API key removed. Your saved targets and receipts remain on this device.'); }), button('Reset pumpkin position', async () => { await update(d => ({ ...d, position: null })); setPosition(null); }));

  async function sync() {
    if (busy) return;
    if (!account || !getValue('hh-key', '')) throw new Error('Save your Torn API key in Settings.');
    busy = true;
    try {
      await locked('sync-' + account.id, async () => {
        const owner = (await api('user/basic')).profile;
        if (owner?.id !== account.id) throw new Error('API key owner does not match this helper account.');
        let data = load();
        if (!data.job && Date.now() - (data.syncAttempt || 0) < 25000) { message('History was checked recently. Try again in a moment.'); return; }
        await update(d => ({ ...d, syncAttempt: Date.now() }));
        let category = getValue('hh-category', null);
        if (!category) {
          const result = await api('torn/logcategories');
          const match = result.logcategories?.find(c => /halloween.*basket/i.test(c.title));
          if (!match) throw new Error('Torn did not return the Halloween basket log category.');
          category = match.id; await setValue('hh-category', category);
        }
        const end = Math.floor(Date.now() / 1000), from = Math.max(yearStart(data.year), (data.lastSync || 0) - 300);
        let job = data.job || { from, end, url: `https://api.torn.com/v2/user/log?cat=${category}&limit=100&from=${from}&to=${end}` };
        // Bounded, resumable batches avoid a burst of requests for a large history.
        for (let page = 0; page < 5; page++) {
          message(`Syncing Halloween receipts — page ${page + 1}…`);
          const result = await request(job.url, getValue('hh-key', ''));
          if (!Array.isArray(result.log)) throw new Error('Unrecognized log response. Your saved total was not cleared.');
          const logs = result.log;
          const oldest = logs.length ? Math.min(...logs.map(l => l.timestamp)) : 0;
          const next = logs.length ? olderPage(result._metadata, job.url, oldest) : null;
          if (logs.length >= 100 && !next && oldest >= job.from) throw new Error('Pagination could not be verified. History is incomplete; retry later.');
          const complete = !next || oldest < job.from;
          const nextJob = complete ? null : { ...job, url: next };
          data = await update(d => {
            if (d.year !== yearOf(job.end * 1000)) return d;
            const basket = adjustBasket(d.basket, logs, complete ? job.end * 1000 : d.basket?.checked);
            return { ...mergeLogs(d, logs), basket, job: nextJob, lastSync: complete ? job.end : d.lastSync };
          });
          render();
          if (complete) { message('Receipts synced. ' + (Object.keys(data.unknown).length ? 'Unrecognized log types are flagged in receipts.' : 'Spending treats does not reduce your earned total.')); await notifyUpgrade(); break; }
          job = nextJob;
          if (page === 4) message('Partial history saved. Click Sync receipts again to continue.');
        }
      });
    } finally { busy = false; }
  }

  let navigatingTarget = false;
  async function nextTarget() {
    if (navigatingTarget || !active()) return;
    if (!account) throw new Error('Connect your account in Settings first.');
    navigatingTarget = true;
    try {
      let target;
      await update(data => {
        const next = nextSavedTarget(data);
        if (!next) throw new Error('Add some Halloween targets from their profiles first.');
        target = next.target;
        return { ...data, cursor: next.cursor };
      });
      message('Opening ' + target.name + '…');
      if (active()) {
        try { sessionStorage.setItem(ID + '-next-panel', JSON.stringify({ id: target.id, until: Date.now() + 60000 })); } catch (_) {}
        location.assign('https://www.torn.com/profiles.php?XID=' + target.id);
      }
    } finally { navigatingTarget = false; }
  }
  $('[data-actions]').append(button('Next target →', nextTarget), button('Sync receipts', sync), button('Unpin upgrade', async () => { await update(d => ({ ...d, pin: null, notified: null })); render(); }));
  function pageProfileID() {
    if (location.pathname !== '/profiles.php') return null;
    const value = new URL(location.href).searchParams.get('XID');
    return /^\d+$/.test(value || '') ? Number(value) : null;
  }
  async function saveTarget() {
    if (targetSaving || !active()) return;
    const id = pageProfileID();
    if (!id || !account) throw new Error('Open a player profile and connect your API key first.');
    if (id === account.id) throw new Error('You cannot add yourself as a Halloween target.');
    targetSaving = true; render();
    try {
    const existing = load().targets.some(t => t.id === id);
    if (existing) { await update(d => ({ ...d, targets: d.targets.filter(t => t.id !== id) })); message('Removed from Halloween targets.'); }
    else {
      // Torn includes the viewed player's name in the page title, e.g.
      // "Calicus' Profile | Torn" or "DarrylPhilbin's Profile | Torn".
      // Do not use sidebar names, which belong to the signed-in account.
      const name = document.title.trim().match(/^(.+?)(?:['’]s|['’]) Profile\s*\|\s*Torn$/i)?.[1]?.trim();
      if (!name) throw new Error('The profile name has not loaded yet. Wait for the profile to finish loading, then try again.');
      await update(d => ({ ...d, targets: d.targets.some(t => t.id === id) ? d.targets : [...d.targets, { id, name }] }));
      message('Added ' + name + ' to Halloween targets.');
    }
    } finally { targetSaving = false; render(); }
  }
  let profileButton = null, profileAnchor = null, targetSaving = false;
  const upgradePins = new Map();
  style.textContent += '.hh-upgrade-pin{position:fixed!important;z-index:10000;width:22px!important;height:22px!important;min-width:0!important;padding:0!important;margin:0!important;border:1px solid #777;border-radius:50%;background:#292929;color:#aaa;font:13px/20px Arial;cursor:pointer;filter:grayscale(1);box-sizing:border-box}.hh-upgrade-pin[data-selected="true"]{filter:none;background:#5c3818;border-color:#ffb65e;box-shadow:0 0 0 1px #ffb65e}.hh-upgrade-pin[hidden]{display:none!important}.hh-upgrade-pin:focus-visible{outline:2px solid #ffb65e;outline-offset:2px}';
  function clearUpgradePins() { for (const {pin} of upgradePins.values()) pin.remove(); upgradePins.clear(); }
  function positionUpgradePins() {
    for (const [native, {pin}] of upgradePins) {
      if (!native.isConnected) { pin.remove(); upgradePins.delete(native); continue; }
      if (!active()) { pin.hidden = true; continue; }
      const rect = native.getBoundingClientRect();
      pin.hidden = !native.getClientRects().length || rect.width === 0 || rect.height === 0 || rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth;
      if (pin.hidden) continue;
      pin.style.left = Math.max(2, Math.min(rect.right - 5, innerWidth - 24)) + 'px';
      pin.style.top = Math.max(2, rect.top - 6) + 'px';
    }
  }
  window.addEventListener('scroll', positionUpgradePins, true);
  window.addEventListener('resize', positionUpgradePins);
  window.addEventListener('blur', () => { for (const {pin} of upgradePins.values()) pin.hidden = true; });
  window.addEventListener('focus', positionUpgradePins);
  style.textContent += `.hh-profile-target{position:relative!important;box-sizing:border-box!important;display:inline-flex!important;align-items:center;justify-content:center;cursor:pointer;color:#888;padding:0!important;vertical-align:middle}.hh-profile-target svg{width:56%;height:56%;pointer-events:none;fill:currentColor}.hh-profile-target .hh-saved-mark{display:none;position:absolute;right:3px;bottom:3px;border-radius:50%;background:#254329;color:#baffb9;font:bold 13px/17px Arial;width:17px;height:17px;text-align:center;pointer-events:none}.hh-profile-target[data-saved="true"]{color:#ffad4d!important;border-color:#dc973e!important;box-shadow:inset 0 0 0 1px #dc973e!important}.hh-profile-target[data-saved="true"] .hh-saved-mark{display:block}.hh-profile-target:disabled{opacity:.6;cursor:wait}.hh-profile-target:focus-visible{outline:2px solid #ffbd72;outline-offset:2px}`;
  function matchActionSize() {
    if (!profileAnchor?.isConnected || !profileButton?.isConnected) return;
    const rect = profileAnchor.getBoundingClientRect(), css = getComputedStyle(profileAnchor);
    if (rect.width < 20 || rect.height < 20) return;
    for (const prop of ['background', 'border', 'borderRadius', 'boxShadow', 'margin', 'flexShrink']) profileButton.style[prop] = css[prop];
    profileButton.style.width = rect.width + 'px'; profileButton.style.height = rect.height + 'px';
  }
  function mountProfileButton() {
    if (profileButton?.isConnected) { matchActionSize(); return; }
    // Restrict matching to the profile's Actions section, never the sidebar target list.
    const direct = document.querySelector('#profileroot a[href*="sid=listData"][href*="type=targets"], #profileroot [id^="button8-profile-"]');
    const heading = [...document.querySelectorAll('h2,h3,h4,h5,h6,div,span')].find(e => e.textContent.trim() === 'Actions');
    let section = heading?.parentElement;
    for (let n = 0; section && n < 5; n++, section = section.parentElement) {
      if (section.querySelectorAll('a,button,[role="button"]').length >= 4) break;
    }
    if (!direct && (!section || section === document.body || section.contains(root))) return;
    const candidates = direct ? [] : [...section.querySelectorAll('a,button,[role="button"],[title],[aria-label]')].filter(e => e.getClientRects().length && !e.closest('.hh-profile-target'));
    const target = candidates.find(e => /target/i.test([e.textContent, e.title, e.getAttribute('aria-label')].join(' ')));
    const anchor = direct || target?.closest('a,button,[role="button"]') || target || candidates.find(e => ['A','BUTTON'].includes(e.tagName));
    if (!anchor) return;
    profileAnchor = anchor;
    profileButton = button('', saveTarget); profileButton.className = 'hh-profile-target';
    profileButton.innerHTML = '<svg aria-hidden="true" viewBox="0 0 40 40"><path d="M19 10c-1-5 2-8 7-8l1 4c-4-1-5 1-5 4z"/><path d="M20 11C8 4 0 15 3 27c2 9 10 12 17 9 7 3 15 0 17-9 3-12-5-23-17-16zm-8 7 5 7H9zm16 0 3 7h-8zM10 28l6 2 4-2 4 2 6-2c-3 8-17 8-20 0z" fill-rule="evenodd"/></svg><span class="hh-saved-mark" aria-hidden="true">✓</span>';
    const slot = anchor.parentElement;
    if (slot?.tagName === 'LI' && slot.querySelectorAll('a,button,[role="button"]').length <= 1) {
      const ownSlot = el('li', '', { className: 'hh-profile-slot' });
      const css = getComputedStyle(slot);
      for (const prop of ['display','margin','padding','float','width','height','flex','alignSelf']) ownSlot.style[prop] = css[prop];
      ownSlot.append(profileButton); slot.insertAdjacentElement('afterend', ownSlot);
    } else anchor.insertAdjacentElement('afterend', profileButton);
    matchActionSize(); render();
  }
  async function inspectPage() {
    if (!active() || scanning || Date.now() - lastScan < 1500) return;
    scanning = true; lastScan = Date.now();
    try {
      const data = load();
      const ownLink = document.querySelector('#sidebar a[href*="profiles.php?XID="], #sidebarroot a[href*="profiles.php?XID="]');
      const viewedAccount = ownLink ? Number(new URL(ownLink.href).searchParams.get('XID')) : null;
      if (account && viewedAccount && viewedAccount !== account.id) { message('This page belongs to a different account than your saved API key. Page integration is paused.'); return; }
      if (!sidebar?.isConnected) {
        const anchor = document.querySelector('#sidebar [href*="/war/chain"], #sidebarroot [href*="/war/chain"]');
        const host = document.querySelector('#sidebar, #sidebarroot');
        if (host) {
          sidebar = button('🎃 Halloween Helper', () => { render(); setPanelOpen(true); }); sidebar.className = 'hh-sidebar';
          if (anchor) anchor.insertAdjacentElement('afterend', sidebar); else host.prepend(sidebar);
        }
      }
      const id = pageProfileID();
      if (id) mountProfileButton();
      if (location.pathname !== '/item.php' || !data) { clearUpgradePins(); render(); return; }
      // Read only the basket the user has opened. Never click or fetch the basket.
      const exchange = [...document.querySelectorAll('button')].find(b => /EXCHANGE ALL TREATS/i.test(b.textContent));
      if (!exchange || !exchange.getClientRects().length) { clearUpgradePins(); render(); return; }
      let basketRoot = exchange.parentElement;
      for (let i = 0; i < 8 && basketRoot; i++, basketRoot = basketRoot.parentElement) {
        if (UPGRADES.filter(u => [...basketRoot.querySelectorAll('button')].some(b => norm(b.getAttribute('aria-label') || b.title || b.textContent) === norm(u.name))).length >= 4) break;
      }
      if (!basketRoot || basketRoot === document.body) return;
      const text = basketRoot.innerText;
      const balanceMatch = /(?:^|\n)\s*([\d,]+)\s+Treats\s*(?:\n|$)/i.exec(text);
      // The item label may be a sibling of the opened basket.
      const itemText = basketRoot.closest('li')?.innerText || basketRoot.parentElement?.innerText || text;
      const tier = basketTier(itemText);
      if (balanceMatch && tier) {
        const basket = { balance: number(balanceMatch[1]), tier, at: Date.now(), applied: {} };
        await update(d => ({ ...d, basket }));
      }
      for (const native of basketRoot.querySelectorAll('button')) {
        const upgrade = UPGRADES.find(u => norm(native.getAttribute('aria-label') || native.title || native.textContent) === norm(u.name));
        if (!upgrade || upgradePins.has(native)) continue;
        const pin = button('📌', async () => {
          await update(d => ({ ...d, pin: d.pin?.name === upgrade.name ? null : upgrade, notified: null }));
          render(); await notifyUpgrade();
        });
        pin.className = 'hh-upgrade-pin';
        // Keep pin controls outside purchase buttons and their delegated handlers.
        pin.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); });
        document.body.append(pin); upgradePins.set(native, {pin, upgrade});
      }
      positionUpgradePins();
      await notifyUpgrade(); render();
    } finally { scanning = false; }
  }
  async function notifyUpgrade() {
    if (!account || !liveCounterEnabled()) return;
    let notice = null;
    await update(d => {
      if (!d.pin || !d.basket || d.job || Date.now() - (d.basket.checked || d.basket.at) > 120000 || d.basket.tier < d.pin.tier || d.basket.balance < d.pin.cost || d.notified === d.pin.name) return d;
      notice = d.pin.name; return { ...d, notified: d.pin.name };
    });
    if (notice) {
      message(`${notice}: you have enough treats. Check ownership and any special requirements in your basket.`);
      if (isPDA || typeof GM_notification !== 'function') setPanelOpen(true);
      else GM_notification({ title: 'Halloween upgrade ready', text: `${notice}: enough treats and its tier is unlocked. Check your basket before purchasing.`, timeout: 12000, tag: ID + '-upgrade' });
    }
  }
  setPosition(load()?.position); render();
  try {
    sessionStorage.removeItem(ID + '-panel-open'); // Retire the old persistent flag.
    const next = JSON.parse(sessionStorage.getItem(ID + '-next-panel') || 'null');
    sessionStorage.removeItem(ID + '-next-panel');
    if (next && next.until > Date.now() && next.id === pageProfileID()) setPanelOpen(true);
  } catch (_) { /* Use the default closed state. */ }
  if (!account) { message('Welcome! Add your Torn API key in Settings to get started.'); root.querySelector('details:last-child').open = true; }
  // Torn renders Actions asynchronously. Retry after page changes instead of
  // waiting for the periodic refresh; ignore our own renders to avoid a loop.
  let pageScanTimer = null;
  function schedulePageScan() {
    if (!active() || pageScanTimer !== null) return;
    pageScanTimer = setTimeout(() => {
      pageScanTimer = null;
      if (!active()) return;
      if (scanning) { schedulePageScan(); return; }
      void inspectPage().catch(reportError);
    }, Math.max(50, 1500 - (Date.now() - lastScan) + 10));
  }
  const helperSelector = '#'+ID+',.hh-sidebar,.hh-profile-target,.hh-profile-slot,.hh-upgrade-pin';
  new MutationObserver(records => {
    if (!active()) return;
    if (records.some(record => {
      if (record.target instanceof Element && record.target.closest(helperSelector)) return false;
      return [...record.addedNodes, ...record.removedNodes].some(node =>
        !(node instanceof Element && node.matches(helperSelector)));
    })) schedulePageScan();
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('visibilitychange', schedulePageScan);
  // No hidden-page DOM reads. Only inspect the page while it is actively viewed.
  ['click', 'keyup', 'scroll'].forEach(name => document.addEventListener(name, () => { if (active()) void inspectPage().catch(reportError); }, { passive: true }));
  function autoSyncIfDue() {
    if (!active() || !liveCounterEnabled()) return;
    const data = load();
    if (data && getValue('hh-key', '') && !busy && Date.now() - (data.syncAttempt || 0) > 60000) void sync().catch(reportError);
  }
  window.addEventListener('focus', () => { void inspectPage().catch(reportError); render(); autoSyncIfDue(); });
  document.addEventListener('visibilitychange', autoSyncIfDue);
  setInterval(() => {
    if (!active()) return;
    render(); void inspectPage().catch(reportError);
    autoSyncIfDue();
  }, 10000);
  void inspectPage().catch(reportError);
  autoSyncIfDue();
})().catch(() => {
  if (typeof document === 'undefined') return;
  const warning = document.createElement('div');
  warning.textContent = 'Halloween Helper could not start. Check script storage permissions and use END injection in Torn PDA.';
  warning.style.cssText = 'position:fixed;bottom:10px;left:10px;right:10px;z-index:2147483647;background:#292521;color:#ffbf75;padding:12px';
  (document.body || document.documentElement).append(warning);
});
