// ==UserScript==
// @name         Torn Passive Income
// @namespace    https://github.com/vexiumlabs/torn-scripts
// @author       DarrylPhilbin
// @version      1.5.2
// @description  Estimate recurring daily income, compare stock benefit purchases, and budget training costs.
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_addValueChangeListener
// @connect      api.torn.com
// @run-at       document-end
// @noframes
// ==/UserScript==

(async () => {
  'use strict';
  const PREFIX = 'passiveincome.v1.';
  const DAY = 86400;
  const TTL = 15 * 60 * 1000;
  const DEFAULTS = { salary: '', companyCosts: '', caymanMinimum: '', excursion: false,
    oilBonus: false, hrgValue: '', saleFee: 0, custom: [] };
  // Item identities are resolved against Torn's live catalogue, never array positions.
  const STOCK_ITEMS = { ASS: 'Six Pack of Alcohol', EWM: 'Box of Grenades',
    FHG: 'Feathery Hotel Coupon', LAG: 'Lawyer Business Card', LSC: 'Lottery Voucher',
    MUN: 'Six Pack of Energy Drink', PRN: 'Erotic DVD', SYM: 'Drug Pack',
    TCC: 'Clothing Cache', THS: 'Box of Medical Supplies' };
  const NONCASH = new Set(['BAG', 'EVL', 'CBD', 'MCS']);
  const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const nonnegative = value => number(value) !== null && value >= 0;
  const optional = value => value === '' || value === null || value === undefined ? null :
    (Number.isFinite(Number(value)) ? Number(value) : null);
  const money = n => number(n) === null ? 'Unavailable' : new Intl.NumberFormat('en-US',
    { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  function budgetWait(history, now) {
    const recent = history.filter(t => Number.isFinite(t) && t > now - 60000).sort((a,b) => a-b);
    return recent.length < 5 ? 0 : Math.max(1, recent[recent.length - 5] + 60001 - now);
  }
  function itemPrice(items, idOrName) {
    const item = items?.find(i => typeof idOrName === 'number' ? i.id === idOrName : norm(i.name) === norm(idOrName));
    return item && item.is_tradable !== false && number(item.value?.market_price) > 0 ? item.value.market_price : null;
  }
  function salaryFrom(logs, job, now) {
    const expected = job?.type === 'company' ? 'company employee pay' : 'job pay';
    const log = [...(logs || [])].filter(l => String(l.details?.title).toLowerCase() === expected)
      .sort((a,b) => b.timestamp - a.timestamp)[0];
    if (!log || now - log.timestamp > 2 * DAY || log.timestamp > now || !nonnegative(log.data?.pay)) return null;
    // If a log exposes the employer, reject a previous employer's payment.
    const employer = log.data.company ?? log.data.company_id;
    if (job?.type === 'company' && employer != null && String(employer) !== String(job.id) && employer !== job.name) return null;
    if (job?.type === 'job' && log.data.job && log.data.job !== job.name) return null;
    return { pay: log.data.pay, timestamp: log.timestamp };
  }
  function calculate(data, settings = {}, now = Date.now() / 1000) {
    const cfg = { ...DEFAULTS, ...settings };
    const rows = [], notes = [];
    const add = (label, daily, detail, kind = 'cash') => rows.push({ label,
      daily: number(daily), detail, kind });
    const factor = 1 - Number(cfg.saleFee) / 100;
    if (!Array.isArray(data.holdings)) add('Stock dividends', null, 'Stock holdings unavailable.');
    else for (const held of data.holdings) {
      const stock = data.stocks?.find(s => s.id === held.id);
      if (!stock) { add(`Stock #${held.id}`, null, 'Stock catalogue unavailable.'); continue; }
      const bonus = stock.bonus;
      const label = `${stock.acronym} | ${stock.name}`;
      if (!bonus || !held.bonus) { add(label, null, 'Benefit information unavailable.'); continue; }
      if (bonus.passive) { notes.push(`${stock.acronym}: ${bonus.description} (non-cash perk; no extra income added).`); continue; }
      const blocks = held.bonus.increment;
      if (!Number.isInteger(blocks) || blocks < 0) { add(label, null, 'Benefit increments unavailable.'); continue; }
      if (blocks === 0) { notes.push(`${stock.acronym}: no earning benefit increments yet.`); continue; }
      const days = held.bonus.frequency > 0 ? held.bonus.frequency : bonus.frequency;
      if (!nonnegative(days) || days === 0) { add(label, null, 'Payout interval unavailable.'); continue; }
      const timing = `${blocks} increment${blocks === 1 ? '' : 's'} / ${days} days` +
        (held.bonus.available ? ' | ready to claim' : ` | ${Math.max(0, days - (held.bonus.progress || 0))} days remaining`);
      if (NONCASH.has(stock.acronym)) { notes.push(`${stock.acronym}: ${bonus.description} | ${timing} (not saleable income).`); continue; }
      let value = null, kind = 'cash', basis = bonus.description;
      if (STOCK_ITEMS[stock.acronym]) {
        const price = itemPrice(data.items, STOCK_ITEMS[stock.acronym]);
        value = price === null ? null : price * factor;
        kind = 'item'; basis = `1 x ${STOCK_ITEMS[stock.acronym]} at Torn market value`;
      } else if (stock.acronym === 'PTS') {
        const prices = (data.points || []).map(p => p.cost).filter(p => number(p) > 0);
        value = prices.length ? 100 * Math.min(...prices) * factor : null;
        kind = 'item'; basis = '100 points at lowest market asking price';
      } else if (stock.acronym === 'HRG') {
        value = optional(cfg.hrgValue); kind = 'estimate';
        basis = 'Random property: set expected resale value per reward in Settings';
      } else {
        const cash = /^\$([\d,]+)(?:\s|$)/.exec(String(bonus.description).trim());
        if (cash) value = Number(cash[1].replace(/,/g, ''));
      }
      add(label, value === null ? null : value * blocks / days, `${basis} | ${timing}`, kind);
    }
    if (!data.money) add('City bank', null, 'Money data unavailable.');
    else {
      const bank = data.money.city_bank;
      if (bank === null) add('City bank', 0, 'No current investment.');
      else if (!bank || !nonnegative(bank.profit) || !(number(bank.duration) > 0)) add('City bank', null, 'Investment details unavailable.');
      else add('City bank', bank.profit / bank.duration,
        `${money(bank.profit)} interest / ${bank.duration} initial days; principal excluded` +
        (bank.until <= now ? ' | matured: reinvest to maintain this rate' : ''));
    }
    const balance = data.money?.cayman_bank;
    if (!nonnegative(balance)) add('Cayman interest', null, 'Balance unavailable.');
    else {
      const supplied = optional(cfg.caymanMinimum);
      const eligible = supplied === null ? balance : Math.min(balance, Math.max(0, supplied));
      const date = new Date(now * 1000);
      const days = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
      const rate = .005 * (cfg.excursion ? 1.25 : 1) * (cfg.oilBonus ? 1.1 : 1);
      add('Cayman interest', Math.round(eligible * rate) / days,
        `${(rate * 100).toFixed(4)}% / ${days} days this UTC month | ` +
        (supplied === null ? 'projection using current balance; set the month\x27s lowest eligible balance' : `eligible balance ${money(eligible)}`), 'estimate');
    }
    if (!Array.isArray(data.properties)) add('Property rentals', null, 'Property data unavailable.');
    else {
      let rentals = 0;
      for (const property of data.properties) {
        if (property.owner?.id !== data.profile?.id) continue;
        if (property.status === undefined) { add(`Property #${property.id}`, null, 'Private rental details unavailable.'); continue; }
        if (property.status !== 'rented') continue;
        rentals++;
        add(`Rent | ${property.property?.name || 'Property'} #${property.id}`,
          nonnegative(property.cost_per_day) ? property.cost_per_day : null,
          `Contract daily rate | ${property.rental_period_remaining ?? '?'} days remaining; gross rent`);
      }
      if (!rentals) add('Property rentals', 0, 'No active rental contracts on owned properties.');
      if (data.propertiesIncomplete) add('More properties', null, 'Property pagination incomplete; refresh to retry.');
    }
    const director = data.job?.type === 'company' && /director/i.test(data.job.position || '');
    if (director) {
      const company = data.company;
      const costs = optional(cfg.companyCosts);
      const wages = Array.isArray(data.employees) && data.employees.every(e => nonnegative(e.wage))
        ? data.employees.reduce((sum,e) => sum + e.wage, 0) : null;
      const ad = number(company?.advertisement_budget);
      const gross = number(company?.income?.daily);
      const valid = company?.director?.id === data.profile?.id && gross !== null && wages !== null && ad !== null && costs !== null;
      add('Company profit', valid ? gross - wages - ad - costs : null,
        `Latest daily revenue ${money(gross)} - wages ${money(wages)} - advertising ${money(ad)} - other costs ` +
        (costs === null ? '(enter in Settings, including stock purchases; enter 0 if none)' : money(costs)), 'estimate');
    } else if (data.job === null) add('Salary', 0, 'Not employed.');
    else if (!data.job) add('Salary', null, 'Job information unavailable.');
    else {
      const override = optional(cfg.salary), salary = salaryFrom(data.logs, data.job, now);
      add('Salary', override ?? salary?.pay ?? null, override !== null ? 'Manual daily salary override' : salary ?
        `Latest pay log | ${new Date(salary.timestamp * 1000).toISOString().slice(0,10)}; verify after changing jobs` :
        'No recognized pay in the past 48 hours; enter daily salary in Settings', 'estimate');
    }
    for (const custom of cfg.custom || []) {
      let value = optional(custom.amount);
      if (custom.itemId) {
        const price = itemPrice(data.items, Number(custom.itemId));
        value = price === null || value === null ? null : value * price * factor;
      }
      const days = optional(custom.days);
      add(custom.name || 'Other recurring income', value === null || !(days > 0) ? null : value / days,
        custom.itemId ? `${custom.amount} x item #${custom.itemId} / ${custom.days} days | market estimate` :
          `${money(value)} / ${custom.days} days | manual estimate`, custom.itemId ? 'item' : 'estimate');
    }
    return { rows, notes, total: rows.reduce((sum,r) => sum + (r.daily ?? 0), 0),
      missing: rows.filter(r => r.daily === null).length };
  }
  function recommendStocks(data, settings = {}, budget = null, sort = 'daily') {
    const rows = [], excluded = [];
    if (!Array.isArray(data.holdings) || !Array.isArray(data.stocks))
      return { rows, excluded: ['Refresh to load both your holdings and the stock catalogue.'] };
    for (const stock of data.stocks) {
      if (stock.bonus?.passive || NONCASH.has(stock.acronym)) continue;
      const held = data.holdings.find(h => h.id === stock.id);
      const shares = held ? held.shares : 0;
      const base = stock.bonus?.requirement, price = stock.market?.price;
      if (!Number.isSafeInteger(shares) || shares < 0 || !Number.isSafeInteger(base) || base <= 0 || !(number(price) > 0)) {
        excluded.push(`${stock.acronym}: missing share counts, requirement or price.`); continue;
      }
      // Derive funded increments from shares, including newly bought increments still maturing.
      let funded = 0, target = base;
      while (target <= shares && Number.isSafeInteger(target)) { funded++; target = base * (2 ** (funded + 1) - 1); }
      if (!Number.isSafeInteger(target)) { excluded.push(`${stock.acronym}: share threshold is too large.`); continue; }
      const sharesNeeded = target - shares, cost = sharesNeeded * price;
      const reward = calculate({ ...data, stocks:[stock], holdings:[{id:stock.id,bonus:{increment:1,frequency:stock.bonus.frequency}}] }, settings).rows[0];
      if (!(reward?.daily > 0) || !Number.isFinite(cost) || cost <= 0) {
        excluded.push(`${stock.acronym}: reward value or payout interval unavailable.`); continue;
      }
      rows.push({ id:stock.id, acronym:stock.acronym, name:stock.name, increment:funded + 1,
        sharesNeeded, cost, daily:reward.daily, efficiency:reward.daily / cost,
        days:stock.bonus.frequency, affordable:budget === null || cost <= budget });
    }
    rows.sort((a,b) => (sort === 'efficiency' ? b.efficiency - a.efficiency : b.daily - a.daily) || a.cost - b.cost || a.id - b.id);
    return { rows, excluded };
  }
  function trainingBudget(income, plan = {}, data = {}) {
    const value = key => { const n = optional(plan[key]); return n !== null && n >= 0 ? n : 0; };
    let daily = value('rehab') / 7;
    const missing = [], costs = [];
    const add = (name,quantity,price) => {
      if (!(quantity > 0)) return;
      if (price === null || price < 0) { missing.push(name); return; }
      const cost = quantity * price; daily += cost; costs.push({name,quantity,price,cost});
    };
    add('Xanax',value('xanaxCount'),itemPrice(data.items,'Xanax'));
    const pointPrices = (data.points || []).map(p=>p.cost).filter(p=>number(p)>0);
    const pointPrice = pointPrices.length ? Math.min(...pointPrices) : null;
    add('Daily refill (30 points)',plan.refill === true ? 30 : 0,pointPrice);

    for (const row of plan.items || []) {
      const id = Number(row.id), item = data.items?.find(i=>i.id===id || i.name===row.name);
      add(item?.name || row.name || `Item #${row.id || '?'}`,optional(row.quantity) ?? 0,itemPrice(data.items,item?.id ?? id));
    }
    const surplus = income === null || missing.length ? null : income - daily;
    return { daily, surplus, missing, costs };
  }
  if (typeof module === 'object' && module.exports) {
    module.exports = { calculate, recommendStocks, trainingBudget, salaryFrom, itemPrice, budgetWait, DEFAULTS }; return;
  }
  if (window.top !== window.self || document.getElementById('tpi-root')) return;
  // PDA can inject at document-start regardless of the userscript run-at header.
  // Wait for the document root, not body; page body replacements must not remove us.
  if (!document.documentElement) await new Promise(resolve => {
    const observer = new MutationObserver(() => {
      if (document.documentElement) { observer.disconnect(); resolve(); }
    });
    observer.observe(document, { childList:true });
  });
  if (document.getElementById('tpi-root')) return;
  const isPDA = () => typeof PDA_httpGet === 'function';
  const useGMStorage = !isPDA() && typeof GM_getValue === 'function' && typeof GM_setValue === 'function';
  const read = (k, fallback) => {
    try {
      if (useGMStorage) return GM_getValue(PREFIX + k, fallback);
      const raw = localStorage.getItem(PREFIX + k);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  };
  const write = (k, value) => {
    if (useGMStorage) GM_setValue(PREFIX + k, value);
    else localStorage.setItem(PREFIX + k, JSON.stringify(value));
  };
  const active = () => !document.hidden && (isPDA() || document.hasFocus());
  function httpGet(options) {
    if (!isPDA()) {
      if (typeof GM_xmlhttpRequest !== 'function') { options.onerror(); return; }
      return GM_xmlhttpRequest(options);
    }
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); callback(value);
    };
    const timer = setTimeout(() => finish(options.ontimeout), options.timeout);
    Promise.resolve().then(() => PDA_httpGet(options.url, options.headers)).then(
      response => finish(options.onload, response), () => finish(options.onerror));
  }
  // PDA uses one atomic IndexedDB record for request admission and the refresh
  // lease, including on WebViews without Web Locks. Never use a localStorage lock.
  function coordinate(update) {
    return new Promise((resolve, reject) => {
      let db, finished = false;
      const fail = () => {
        if (finished) return;
        finished = true; clearTimeout(timer); db?.close();
        reject(new Error('Request coordination storage unavailable. Refresh stopped.'));
      };
      const timer = setTimeout(fail, 5000);
      let open;
      try { open = indexedDB.open('torn-passive-income-coordination-v1', 1); } catch { fail(); return; }
      open.onupgradeneeded = () => open.result.createObjectStore('state');
      open.onerror = open.onblocked = fail;
      open.onsuccess = () => {
        db = open.result;
        if (finished) { db.close(); return; }
        const tx = db.transaction('state', 'readwrite'), store = tx.objectStore('state');
        const get = store.get('shared'); let result;
        get.onsuccess = () => {
          try {
            const state = get.result || { history:[], lease:null, attempt:0 };
            result = update(state); store.put(state, 'shared');
          } catch { tx.abort(); }
        };
        tx.onerror = tx.onabort = fail;
        tx.oncomplete = () => {
          if (finished) return;
          finished = true; clearTimeout(timer); db.close(); resolve(result);
        };
      };
    });
  }
  let leaseOwner = null;
  const nativeLocks = () => !isPDA() && !!navigator.locks;
  async function reserveBudget() {
    if (nativeLocks()) return navigator.locks.request('torn-passive-income-budget-v1', () => {
      const now = Date.now(), history = read('budget', []).filter(t => t > now - 60000);
      const delay = budgetWait(history, now);
      if (!delay) write('budget', [...history, now]);
      return delay;
    });
    const result = await coordinate(state => {
      const now = Date.now();
      if (!leaseOwner || state.lease?.owner !== leaseOwner || state.lease.until <= now) return -1;
      state.lease.until = now + 120000;
      state.history = state.history.filter(t => t > now - 60000);
      const delay = budgetWait(state.history, now);
      if (!delay) state.history.push(now);
      return delay;
    });
    if (result === -1) throw new Error('Refresh lease expired. Press Refresh to retry.');
    return result;
  }
  async function withRefreshLock(callback) {
    if (nativeLocks()) return navigator.locks.request('torn-passive-income-refresh-v1', { ifAvailable:true }, callback);
    const owner = Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16)).join('-');
    const admitted = await coordinate(state => {
      const now = Date.now();
      if (state.lease?.until > now || (state.attempt && now - state.attempt < 60000)) return false;
      state.lease = { owner, until:now + 120000 }; state.attempt = now; return true;
    });
    if (!admitted) return callback(null);
    leaseOwner = owner;
    try { return await callback({ owner }); }
    finally {
      leaseOwner = null;
      await coordinate(state => { if (state.lease?.owner === owner) state.lease = null; });
    }
  }
  async function assertLease() {
    if (nativeLocks()) return;
    const valid = await coordinate(state => !!leaseOwner && state.lease?.owner === leaseOwner && state.lease.until > Date.now());
    if (!valid) throw new Error('Refresh lease expired. Press Refresh to retry.');
  }
  let cfg = { ...DEFAULTS, ...read('settings', {}) };
  let snapshot = read('snapshot', null), busy = false, generation = 0;
  const root = document.createElement('div'); root.id = 'tpi-root';
  const shadow = root.attachShadow({ mode: 'closed' });
  const style = document.createElement('style');
  style.textContent = `
    :host{all:initial;display:block;position:fixed;top:12px;right:14px;z-index:2147483647;font:13px/1.45 Arial,sans-serif;color:#e9edf3;color-scheme:dark}:host([hidden]){display:none!important}
    *{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer;border:1px solid #4a5464;background:#2d3747;color:#f3f6fa;border-radius:6px;padding:7px 10px}
    button:hover{background:#3b4b60}button:disabled{opacity:.5;cursor:wait}button:focus-visible,input:focus-visible{outline:2px solid #66dbc0;outline-offset:2px}
    #launcher{box-shadow:0 3px 14px #0006;font-weight:bold;font-size:12px;padding:7px 11px}
    #panel{position:absolute;right:0;top:39px;width:430px;max-width:calc(100vw - 20px);max-height:calc(100vh - 72px);max-height:calc(100dvh - 72px);overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;background:#18212d;border:1px solid #465063;border-radius:10px;box-shadow:0 12px 36px #0008;padding:16px}
    [hidden]{display:none!important}header,.rowhead,.actions{display:flex;align-items:center;justify-content:space-between;gap:8px}h2{font-size:17px;margin:0}h3{font-size:14px;margin:18px 0 8px}
    #total{font-size:29px;font-weight:bold;color:#77e0c0;margin:10px 0 0}.muted,small{color:#b3bfce}small{display:block;font-size:11px;margin-top:4px}.row{border-top:1px solid #344051;padding:10px 0}.rowhead{align-items:start}.rowhead strong{white-space:nowrap}
    .warning{color:#f6ca7b}#status{margin:10px 0;font-size:12px;white-space:pre-line}.actions{justify-content:flex-start;flex-wrap:wrap;margin:12px 0}
    label{display:block;margin:11px 0 4px}input{background:#101823;border:1px solid #586276;border-radius:4px;color:#f5f7fa;padding:7px;width:100%}input[type=checkbox]{width:auto;margin-right:7px}
    .custom{border:1px solid #414c5e;border-radius:6px;padding:10px;margin:10px 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}p{margin:9px 0}a{color:#86d9fa}summary{cursor:pointer;margin-top:12px}ul{padding-left:18px}#key{letter-spacing:2px}
    @media(max-width:600px),(pointer:coarse){:host{top:calc(8px + env(safe-area-inset-top,0px));right:calc(8px + env(safe-area-inset-right,0px))}
      button{min-height:44px;touch-action:manipulation}#launcher{min-height:36px}#panel{top:44px;padding:13px;max-width:calc(100vw - 16px - env(safe-area-inset-left,0px) - env(safe-area-inset-right,0px));max-height:calc(100vh - 70px);max-height:calc(100dvh - 70px - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px))}
      input{font-size:16px;min-height:44px}input[type=checkbox]{min-height:24px;width:24px;vertical-align:middle}.rowhead span{min-width:0;overflow-wrap:anywhere}.rowhead strong{font-size:12px}#total{font-size:clamp(20px,6vw,29px)}header{position:sticky;top:-13px;background:#18212d;padding:8px 0;z-index:1}}
  `;
  shadow.append(style);
  const dragStyle = document.createElement('style');
  dragStyle.textContent = '#launcher{touch-action:none;user-select:none;-webkit-user-select:none;cursor:grab}#launcher:active{cursor:grabbing}#panel{position:fixed;left:50%;right:auto;top:64px;transform:translateX(-50%);max-height:calc(100dvh - 80px)}';
  shadow.append(dragStyle);
  function el(tag, text, parent, attrs = {}) {
    const node = document.createElement(tag); if (text !== undefined) node.textContent = text;
    for (const [k,v] of Object.entries(attrs)) node.setAttribute(k,v);
    if (parent) parent.append(node); return node;
  }
  const launcher = el('button', 'Income', shadow, { id:'launcher', 'aria-expanded':'false', 'aria-controls':'panel' });
  const panel = el('section', undefined, shadow, { id:'panel', 'aria-label':'My passive income' }); panel.hidden = true;
  const header = el('header', undefined, panel);
  const heading = el('h2', 'My passive income', header);
  const backToIncome = el('button', 'Back to Income', header); backToIncome.hidden = true;
  const close = el('button', 'x', header, { 'aria-label':'Close income panel' });
  const view = el('div', undefined, panel);
  el('small','Version 1.5.2 - drag Income to move it',view);
  const total = el('div', '-', view, { id:'total' });
  const subtitle = el('div', 'Estimated daily equivalent', view, { class:'muted' });
  const status = el('div', '', view, { id:'status', role:'status' });
  const actions = el('div', undefined, view, { class:'actions' });
  const refreshButton = el('button', 'Refresh', actions);
  const settingsButton = el('button', 'Settings', actions);
  const stocksButton = el('button', 'Next stock', actions);
  const trainingButton = el('button', 'Training budget', actions);
  const trainingView = el('section', undefined, panel, {'aria-label':'Training budget'}); trainingView.hidden = true;
  let trainingOrigin = false;
  function renderTraining(draft) {
    trainingView.replaceChildren();
    el('p', 'Plan the training your recurring income can support.', trainingView);
    el('small','How much do you use on an average day? Blank means none; fractions are allowed. Costs use refreshed market values automatically.',trainingView);
    const form = el('form', undefined, trainingView);
    const plan = draft || cfg.training || {}, inputs = {};
    const priceNote = (parent, price) => el('small',price === null ? 'Market price unavailable - refresh prices.' : `Market price: ${money(price)} each`,parent);
    const refreshPrices = el('button','Refresh prices',form,{type:'button'});
    const refreshNote = el('small',snapshot ? `Prices last refreshed ${new Date(snapshot.at).toLocaleString()}` : 'No prices loaded yet.',form,{role:'status'});
    refreshPrices.onclick = async () => {
      const draft = current(); refreshPrices.disabled = true; refreshNote.textContent = 'Refreshing account and market prices; keep this page visible.';
      await refresh();
      if (!trainingView.hidden) { renderTraining(draft); }
    };
    if (status.textContent) el('small',status.textContent,form);
    inputs.xanaxCount = field(form,'How many Xanax per day?',plan.xanaxCount ?? '', 'number',{min:'0',step:'any'});
    priceNote(form,itemPrice(snapshot?.data?.items,'Xanax'));
    inputs.refill = field(form,'Do you use a daily points refill? (30 points)',plan.refill === true,'checkbox');
    const pointQuotes = (snapshot?.data?.points || []).map(p=>p.cost).filter(p=>number(p)>0);
    el('small',pointQuotes.length ? `Refill cost: ${money(30 * Math.min(...pointQuotes))} (30 points)` : 'Point price unavailable - refresh prices.',form);
    inputs.rehab = field(form,'Average rehab spending per week ($)',plan.rehab ?? '', 'number',{min:'0',step:'any'});
    const catalogue = snapshot?.data?.items || [];
    const names = ['Feathery Hotel Coupon','Erotic DVD','Ecstasy','LSD'];
    const selected = new Map();
    for (const name of names) {
      const item = catalogue.find(i=>i.name===name);
      selected.set(item ? String(item.id) : name,{id:item?.id,name});
    }
    for (const item of catalogue) {
      if (/^Can of /i.test(item.name) || item.type === 'Energy Drink' || item.type === 'Candy' || (plan.items || []).some(r=>String(r.id)===String(item.id))) {
        if (item.name !== 'Xanax') selected.set(String(item.id),item);
      }
    }
    for (const row of plan.items || []) {
      if (row.id && !catalogue.some(i=>String(i.id)===String(row.id))) selected.set(String(row.id),{id:row.id,name:`Item #${row.id}`});
    }
    el('h3','Daily training items',form);
    if (!catalogue.length) el('p','Refresh Income first to load all energy drink and training item names and prices.',form,{class:'warning'});
    const editors = [];
    for (const item of selected.values()) {
      const saved = (plan.items || []).find(r=>String(r.id)===String(item.id) || r.name===item.name);
      const quantity = field(form,`How many ${item.name === 'Feathery Hotel Coupon' ? 'FHCs (Feathery Hotel Coupons)' : item.name} per day?`,saved?.quantity ?? '', 'number',{min:'0',step:'any'});
      priceNote(form,itemPrice(catalogue,item.id ?? item.name));
      editors.push({id:item.id,name:item.name,quantity});
    }
    const save = el('button','Save budget',form,{type:'submit'});
    const saveStatus = el('small','',form,{role:'status'});
    const results = el('div',undefined,trainingView,{'aria-live':'polite'});
    const current = () => ({...Object.fromEntries(Object.entries(inputs).map(([key,input]) => [key,input.type === 'checkbox' || key === 'refill' ? input.checked : input.value])),items:editors.map(e=>({id:e.id,name:e.name,quantity:e.quantity.value}))});
    function update() {
      results.replaceChildren(); saveStatus.textContent = '';
      if ([...Object.values(inputs),...editors.map(e=>e.quantity)].some(input => !input.validity.valid)) { el('p','Enter valid amounts of zero or more.',results); return; }
      const income = snapshot ? calculate(snapshot.data,cfg) : null;
      const budget = trainingBudget(income?.total ?? null,current(),snapshot?.data || {});
      el('h3',`${money(budget.daily)} / day ${budget.missing.length ? 'known spending subtotal' : 'planned spending'}`,results);
      for (const cost of budget.costs) el('small',`${cost.name}: ${cost.quantity} x ${money(cost.price)} = ${money(cost.cost)}/day`,results);
      el('small','Market item values are estimates, not executable offers. Points use the lowest unit asking price. Refresh Income to update prices; ',results);
      if (budget.missing.length) { el('p',`Missing prices: ${budget.missing.join(', ')}. Refresh Income; surplus is unavailable.`,results,{class:'warning'}); return; }
      if (!income) { el('p','Refresh Income to calculate your surplus.',results); return; }
      if (income.missing) el('p','Income is incomplete: these figures use only the known subtotal.',results,{class:'warning'});
      if (Date.now() - snapshot.at > TTL) el('p','Income prices are stale. Refresh from the Income view.',results,{class:'warning'});
      el('p',`${money(income.total)} / day recurring income`,results);
      el('h3',`${money(Math.abs(budget.surplus))} / day ${budget.surplus < 0 ? 'shortfall' : 'remaining after training'}`,results);
      el('p',`${money(budget.surplus * 30)} over 30 days`,results);
      el('small','Projection assumes unchanged income and spending. Dividends are not paid daily; allow cash for expenses between payouts. Item income assumes sales; company profit may not be available to withdraw.',results);
    }
    for (const input of [...Object.values(inputs),...editors.map(e=>e.quantity)]) input.oninput = update;
    form.onsubmit = event => {
      event.preventDefault(); if (!form.reportValidity()) return;
      const next = {...cfg,training:current()};
      try { write('settings',next); cfg = next; update(); saveStatus.textContent = 'Budget saved on this device.'; }
      catch { saveStatus.textContent = 'Could not save budget. Device storage is unavailable.'; }
    };
    update();
  }
  trainingButton.onclick = () => {
    trainingOrigin = true; view.hidden = true; stocksView.hidden = true; settingsView.hidden = true; trainingView.hidden = false;
    heading.textContent = 'Training budget'; backToIncome.hidden = false; panel.scrollTop = 0;
    renderTraining(); backToIncome.focus();
  };
  const stocksView = el('section', undefined, panel, { 'aria-label':'Next stock' }); stocksView.hidden = true;
  el('h3', 'What stock should I buy next?', stocksView);
  const budgetLabel = el('label', 'Purchase budget (optional)', stocksView, {for:'stock-budget'});
  const stockBudget = el('input', undefined, stocksView, {id:'stock-budget',type:'number',min:'0',step:'any',placeholder:'Blank = all purchases'});
  const sortActions = el('div', undefined, stocksView, {class:'actions'});
  const dailySort = el('button', 'Highest profit/day', sortActions);
  const yieldSort = el('button', 'Best return per dollar', sortActions);
  let stockSort = 'daily';
  const stockResults = el('div', undefined, stocksView);
  function renderStocks() {
    stockResults.replaceChildren();
    dailySort.setAttribute('aria-pressed', String(stockSort === 'daily'));
    yieldSort.setAttribute('aria-pressed', String(stockSort === 'efficiency'));
    if (!snapshot) { el('p', 'Refresh your account data first.', stockResults); return; }
    const budget = optional(stockBudget.value);
    if (!stockBudget.validity.valid || (stockBudget.value !== '' && (budget === null || budget < 0))) {
      el('p', 'Enter a valid budget of zero or more.', stockResults); return;
    }
    const stale = Date.now() - snapshot.at > TTL;
    el('small', `Prices updated ${new Date(snapshot.at).toLocaleString()}`, stockResults);
    if (stale) el('p', 'Stale prices - refresh before choosing a purchase.', stockResults, {class:'warning'});
    const result = recommendStocks(snapshot.data, cfg, budget, stockSort);
    const affordable = result.rows.filter(r => r.affordable);
    el('p', affordable.length ? `${stale ? 'Cached leader' : 'Top choice among valued stocks'}: ${affordable[0].acronym} | benefit increment ${affordable[0].increment}` : 'No valued purchases fit this budget or available data.', stockResults);
    el('small', 'One next increment per stock. Estimated extra dividend income after maturity; assumes timely claims and sale of item rewards. Share-price gains/losses and indirect perks (including TCI) are excluded. This ranks individual purchases, not combinations.', stockResults);
    el('small', 'Return per dollar uses only the extra cash needed; shares already owned still have value. New increments may wait for your existing payout cycle. HRG uses your estimate in Settings.', stockResults);
    for (const row of result.rows) {
      const node = el('div', undefined, stockResults, {class:'row'});
      el('strong', `${row.acronym} | increment ${row.increment} | +${money(row.daily)}/day`, node);
      el('small', row.name, node);
      el('p', `Buy ${row.sharesNeeded.toLocaleString()} shares | ${money(row.cost)}`, node);
      el('small', `${money(row.efficiency * 1000000)}/day per $1m added | payout every ${row.days} days`, node);
      if (!row.affordable) el('small', `${money(row.cost - budget)} over budget`, node, {class:'warning'});
    }
    if (result.excluded.length) {
      const details = el('details', undefined, stockResults); el('summary', 'Unvalued stocks - ranking may be incomplete', details);
      for (const reason of result.excluded) el('small', reason, details);
    }
    el('a', 'Open Torn stocks', stockResults, {href:'https://www.torn.com/page.php?sid=stocks'});
  }
  stocksButton.onclick = () => {
    trainingOrigin = false; trainingView.hidden = true;
    view.hidden = true; settingsView.hidden = true; stocksView.hidden = false;
    heading.textContent = 'Next stock'; backToIncome.hidden = false;
    panel.scrollTop = 0; renderStocks(); backToIncome.focus();
  };
  backToIncome.onclick = () => {
    trainingView.hidden = true;
    stocksView.hidden = true; settingsView.hidden = true; view.hidden = false;
    heading.textContent = 'My passive income'; backToIncome.hidden = true;
    panel.scrollTop = 0; render(); (trainingOrigin ? trainingButton : stocksButton).focus();
  };
  stockBudget.oninput = renderStocks;
  dailySort.onclick = () => { stockSort = 'daily'; renderStocks(); };
  yieldSort.onclick = () => { stockSort = 'efficiency'; renderStocks(); };
  const rowsNode = el('div', undefined, view);
  const foot = el('small', 'Daily earning rate, not cash received today. Assumes timely dividend claims and renewed investments/rentals. Item values are estimates; non-cash perks are excluded.', view);
  const settingsView = el('form', undefined, panel); settingsView.hidden = true;
  function render() {
    // Always show the launcher; all data still belongs to the supplied API key.
    root.hidden = false;
    refreshButton.disabled = busy;
    if (!stocksView.hidden) renderStocks();
    if (!snapshot) { total.textContent = '-'; subtitle.textContent = 'Connect your API key to calculate income'; rowsNode.replaceChildren(); return; }
    const result = calculate(snapshot.data, cfg);
    total.textContent = `${money(result.total)} / day`;
    subtitle.textContent = `${result.missing ? 'Known subtotal' : 'Estimated daily equivalent'} | ${snapshot.data.profile?.name || 'Your account'}`;
    rowsNode.replaceChildren();
    const stale = Date.now() - snapshot.at > TTL;
    el('small', `Updated ${new Date(snapshot.at).toLocaleString()}${stale ? ' | stale; refresh for current values' : ''}`, rowsNode);
    if (result.missing) el('p', `${result.missing} source(s) need data or settings and are excluded from the subtotal.`, rowsNode, { class:'warning' });
    for (const error of snapshot.errors || []) el('small', error, rowsNode, { class:'warning' });
    for (const row of result.rows) {
      const node = el('div', undefined, rowsNode, { class:'row' });
      const head = el('div', undefined, node, { class:'rowhead' });
      el('span', row.label, head); el('strong', money(row.daily), head, row.daily === null ? { class:'warning' } : {});
      el('small', row.detail, node);
    }
    if (result.notes.length) {
      const details = el('details', undefined, rowsNode); el('summary', 'Other stock benefits', details);
      const list = el('ul', undefined, details); for (const note of result.notes) el('li', note, list);
    }
  }
  let drag = null, suppressClick = false;
  let buttonPosition = read('buttonPosition', null);
  function positionButton(position) {
    const width = window.innerWidth || document.documentElement.clientWidth || 320;
    const height = window.innerHeight || document.documentElement.clientHeight || 480;
    const x = Math.max(8, Math.min(position.x, width - (launcher.offsetWidth || 80) - 8));
    const y = Math.max(8, Math.min(position.y, height - (launcher.offsetHeight || 44) - 8));
    root.style.left = `${x}px`; root.style.top = `${y}px`; root.style.right = 'auto';
    buttonPosition = {x,y};
  }
  launcher.setAttribute('title', 'Drag to move; tap to open');
  launcher.onpointerdown = event => {
    if (event.button !== 0 || event.isPrimary === false) return;
    suppressClick = false;
    const rect = root.getBoundingClientRect();
    drag = {id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top,moved:false};
    try { launcher.setPointerCapture(event.pointerId); } catch { /* Touch fallback and window listeners handle WebViews without capture. */ }
  };
  launcher.onpointermove = event => {
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx,dy) < 6) return;
    drag.moved = true;
    positionButton({x:drag.left + dx,y:drag.top + dy});
  };
  const finishDrag = event => {
    if (!drag || drag.id !== event.pointerId) return;
    suppressClick = drag.moved;
    if (drag.moved) { try { write('buttonPosition', buttonPosition); } catch { /* Position works for this page if storage is unavailable. */ } }
    drag = null;
  };
  launcher.onpointerup = finishDrag;
  launcher.onpointercancel = finishDrag;
  launcher.onlostpointercapture = finishDrag;
  window.addEventListener('pointermove', launcher.onpointermove);
  window.addEventListener('pointerup', finishDrag);
  window.addEventListener('pointercancel', finishDrag);
  // Some PDA WebViews cancel pointer events when native scrolling begins.
  // Non-passive touch listeners keep the gesture on the launcher itself.
  launcher.addEventListener('touchstart', event => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0], rect = root.getBoundingClientRect();
    suppressClick = false;
    drag = {id:'touch',touchId:touch.identifier,x:touch.clientX,y:touch.clientY,left:rect.left,top:rect.top,moved:false};
  }, {passive:false});
  launcher.addEventListener('touchmove', event => {
    if (drag?.id !== 'touch') return;
    const touch = Array.from(event.touches).find(t=>t.identifier === drag.touchId);
    if (!touch) return;
    if (event.cancelable) event.preventDefault();
    launcher.onpointermove({pointerId:'touch',clientX:touch.clientX,clientY:touch.clientY});
  }, {passive:false});
  launcher.addEventListener('touchend', event => {
    if (drag?.id !== 'touch') return;
    if (!Array.from(event.changedTouches).some(t=>t.identifier === drag.touchId)) return;
    if (drag.moved && event.cancelable) event.preventDefault();
    finishDrag({pointerId:'touch'});
  }, {passive:false});
  launcher.addEventListener('touchcancel', () => finishDrag({pointerId:'touch'}), {passive:false});
  window.addEventListener('resize', () => { if (buttonPosition) positionButton(buttonPosition); });
  function show(open = true) { panel.hidden = !open; launcher.setAttribute('aria-expanded', String(open)); if (!open) launcher.focus(); }
  launcher.onclick = event => { if (suppressClick && event?.detail !== 0) { suppressClick = false; return; } show(panel.hidden); if (!panel.hidden) { render(); if (!read('key','')) openSettings(); } };
  close.onclick = () => show(false);
  shadow.addEventListener('keydown', e => { if (e.key === 'Escape') show(false); });
  function field(parent, label, value, type = 'number', attrs = {}) {
    const wrap = el('label', label, parent);
    const input = el('input', undefined, wrap, { type, ...attrs });
    if (type === 'checkbox') input.checked = !!value; else input.value = value ?? '';
    return input;
  }
  function openSettings() {
    show(); view.hidden = true; stocksView.hidden = true; trainingView.hidden = true; backToIncome.hidden = true;
    heading.textContent = 'My passive income'; settingsView.hidden = false; settingsView.replaceChildren();
    el('p', 'Use your own Full Access key. ' + (useGMStorage ? 'It stays in Tampermonkey storage.' :
      'It is saved in this device\x27s Torn site storage, accessible to scripts on Torn; clearing site data removes it.') +
      ' Sent only to api.torn.com. ' + (isPDA() ? 'Enter it here once; the app\x27s account key is not used automatically.' : ''), settingsView, { class:'muted' });
    const key = field(settingsView, read('key','') ? 'Replace API key (blank keeps current key)' : 'Full Access API key', '', 'password',
      { id:'key', autocomplete:'off', spellcheck:'false', maxlength:'16' });
    const salary = field(settingsView, 'Daily salary override ($; blank uses latest pay log)', cfg.salary, 'number', { min:'0', step:'any' });
    const costs = field(settingsView, 'Director: other company costs per day ($)', cfg.companyCosts, 'number', { min:'0', step:'any' });
    el('small', 'Wages and advertising are deducted automatically. Enter average stock purchases and other running costs here; enter 0 if none. Company profit stays excluded until this is set.', settingsView);
    const cayman = field(settingsView, 'Cayman: lowest eligible balance this UTC month ($)', cfg.caymanMinimum, 'number', { min:'0', step:'any' });
    el('small', 'Blank projects from the current balance. Update this at the start of each month and after withdrawals.', settingsView);
    const excursion = field(settingsView, 'Faction Excursion interest bonus (+25%)', cfg.excursion, 'checkbox');
    const oil = field(settingsView, '7-star or higher Oil Rig interest bonus (+10%)', cfg.oilBonus, 'checkbox');
    const hrg = field(settingsView, 'HRG expected resale value per random property ($)', cfg.hrgValue, 'number', { min:'0', step:'any' });
    const fee = field(settingsView, 'Item / point sale deduction (%)', cfg.saleFee, 'number', { min:'0', max:'100', step:'any' });
    el('h3', 'Other recurring income / expenses', settingsView);
    el('small', 'Add job-point rewards, company perks, faction payouts, private investments, or upkeep. Cash: amount per cycle (negative for expenses). Item: quantity per cycle and Torn item ID. Avoid duplicating automatic sources.', settingsView);
    const customs = el('div', undefined, settingsView), editors = [];
    function addCustom(row = { name:'', amount:'', days:1, itemId:'' }) {
      const node = el('div', undefined, customs, { class:'custom' });
      const name = field(node, 'Source name', row.name, 'text', { maxlength:'100', required:'' });
      const grid = el('div', undefined, node, { class:'grid' });
      const amount = field(grid, 'Cash $ or item quantity', row.amount, 'number', { step:'any', required:'' });
      const days = field(grid, 'Every N days', row.days, 'number', { min:'0.001', step:'any', required:'' });
      const itemId = field(node, 'Torn item ID (blank for cash)', row.itemId, 'number', { min:'1', step:'1' });
      const remove = el('button', 'Remove source', node, { type:'button' });
      const editor = { node, name, amount, days, itemId }; editors.push(editor);
      remove.onclick = () => { node.remove(); editors.splice(editors.indexOf(editor),1); };
    }
    for (const row of cfg.custom) addCustom(row);
    const addButton = el('button', '+ Add source', settingsView, { type:'button' }); addButton.onclick = () => addCustom();
    const buttons = el('div', undefined, settingsView, { class:'actions' });
    const save = el('button', 'Save & refresh', buttons, { type:'submit' });
    const cancel = el('button', 'Back', buttons, { type:'button' });
    cancel.onclick = () => { view.hidden = false; settingsView.hidden = true; panel.scrollTop = 0; };
    const forget = el('button', 'Forget key & data', buttons, { type:'button' });
    forget.onclick = () => {
      generation++; write('key',''); write('snapshot',null); write('settings',{});
      snapshot = null; cfg = { ...DEFAULTS, custom:[] }; status.textContent = 'Key, income data and settings removed.';
      view.hidden = false; settingsView.hidden = true; panel.scrollTop = 0; render();
    };
    settingsView.onsubmit = e => {
      e.preventDefault();
      const replacement = key.value.trim(), old = read('key','');
      if (replacement && !/^[a-zA-Z0-9]{16}$/.test(replacement)) { key.setCustomValidity('Enter the 16-character Torn API key.'); key.reportValidity(); return; }
      key.setCustomValidity('');
      if (!replacement && !old) { key.setCustomValidity('Enter your API key.'); key.reportValidity(); return; }
      generation++;
      // A different key must never inherit another account's manual income inputs.
      if (replacement && replacement !== old) { write('key', replacement); snapshot = null; write('snapshot', null); }
      cfg = { training:cfg.training, salary:salary.value, companyCosts:costs.value, caymanMinimum:cayman.value,
        excursion:excursion.checked, oilBonus:oil.checked, hrgValue:hrg.value, saleFee:Number(fee.value),
        custom:editors.map(r => ({ name:r.name.value.trim(), amount:Number(r.amount.value), days:Number(r.days.value), itemId:r.itemId.value })) };
      if (old && replacement && replacement !== old) cfg = { ...DEFAULTS, custom:[] };
      write('settings', cfg); view.hidden = false; settingsView.hidden = true; panel.scrollTop = 0; render();
      status.textContent = busy ? 'Settings saved. Current refresh is stopping; press Refresh when it finishes.' : '';
      if (!busy) refresh();
    };
    key.oninput = () => key.setCustomValidity('');
    panel.scrollTop = 0; key.focus({ preventScroll:true });
  }
  settingsButton.onclick = openSettings;
  async function request(path, key, token) {
    const url = new URL(path, 'https://api.torn.com/v2/');
    if (url.origin !== 'https://api.torn.com' || !url.pathname.startsWith('/v2/') || url.searchParams.has('key')) throw new Error('Invalid API route.');
    url.searchParams.set('comment', 'TornPassiveIncome');
    for (;;) {
      if (token !== generation || key !== read('key','')) throw new Error('Settings changed; refresh cancelled.');
      if (!active()) throw new Error('Refresh paused: return to this tab and press Refresh.');
      const wait = await reserveBudget();
      if (!wait) break;
      status.textContent = `Refreshing | waiting for API budget (${Math.ceil(wait/1000)}s)...`;
      await new Promise(resolve => setTimeout(resolve, Math.min(wait,1000)));
    }
    if (token !== generation || key !== read('key','')) throw new Error('Settings changed; refresh cancelled.');
    status.textContent = `Refreshing | ${url.pathname.replace('/v2/','')}...`;
    return new Promise((resolve, reject) => httpGet({ method:'GET', url:url.href,
      headers:{ Authorization:`ApiKey ${key}` }, anonymous:true, timeout:25000,
      onload: response => {
        if (token !== generation || key !== read('key','')) return reject(new Error('Settings changed; refresh cancelled.'));
        try {
          const body = JSON.parse(response.responseText);
          if (body.error) { const error = new Error(`Torn API error ${body.error.code}.`); error.code = body.error.code; throw error; }
          if (response.status !== 200) throw new Error(`HTTP ${response.status}.`);
          resolve(body);
        } catch (error) { reject(error instanceof SyntaxError ? new Error('Invalid API response.') : error); }
      }, onerror:() => reject(new Error('Network error.')), ontimeout:() => reject(new Error('API timeout.'))
    }));
  }
  async function refresh() {
    if (busy) return;
    const key = read('key',''); if (!key) return openSettings();
    if (!active()) { status.textContent = 'Focus this tab, then press Refresh.'; return; }
    busy = true; render(); const token = generation;
    try {
      await withRefreshLock(async lock => {
        if (!lock) { status.textContent = 'Another tab is refreshing, or a refresh just ran. Try again shortly.'; return; }
        const last = read('attempt',0);
        if (Date.now() - last < 60000) { status.textContent = 'Please wait one minute between refresh attempts.'; return; }
        write('attempt', Date.now());
        const data = {}, errors = [];
        async function fetchPart(label, path, assign) {
          try { assign(await request(path,key,token)); }
          catch (error) {
            if ([1,2,5,8,9,10,13,14,18].includes(error.code) || token !== generation || !active()) throw error;
            errors.push(`${label}: ${error.message}`);
          }
        }
        // Establish account identity before fetching or displaying private income data.
        const identity = await request('user/basic', key, token);
        if (!Number.isInteger(identity.profile?.id)) throw new Error('Account identity missing from API response.');
        data.profile = identity.profile;
        await fetchPart('Stocks', 'user/stocks', body => { if (!Array.isArray(body.stocks)) throw new Error('Holdings missing.'); data.holdings = body.stocks; });
        await fetchPart('Stock catalogue', 'torn/stocks', body => { data.stocks = body.stocks; });
        await fetchPart('Item prices', 'torn/items', body => {
          if (!Array.isArray(body.items)) throw new Error('Item catalogue missing.');
          data.items = body.items.map(({id,name,type,value,is_tradable}) => ({id,name,type,value:{market_price:value?.market_price},is_tradable}));
        });
        await fetchPart('Investments', 'user/money', body => { data.money = body.money; });
        await fetchPart('Job', 'user/job', body => { data.job = body.job; });
        await fetchPart('Rentals', 'user/properties?limit=100&offset=0', body => {
          if (!Array.isArray(body.properties)) throw new Error('Properties missing.');
          data.properties = body.properties; data.propertiesIncomplete = !!body._metadata?.links?.next;
        });
        // Construct our own pagination paths; never forward keys to API-provided links.
        let offset = 100;
        while (data.propertiesIncomplete && offset < 10000) {
          let succeeded = false;
          await fetchPart('More rentals', `user/properties?limit=100&offset=${offset}`, body => {
            if (!Array.isArray(body.properties)) throw new Error('Properties missing.');
            const seen = new Set(data.properties.map(p => p.id));
            data.properties.push(...body.properties.filter(p => !seen.has(p.id)));
            data.propertiesIncomplete = !!body._metadata?.links?.next;
            succeeded = true;
          });
          if (!succeeded) break; offset += 100;
        }
        // Training refills need points prices even without a PTS holding.
          await fetchPart('Points price', 'market/pointsmarket', body => { data.points = body.pointsmarket; });
        if (data.job?.type === 'company' && /director/i.test(data.job.position || '')) {
          await fetchPart('Company', 'company/profile', body => { data.company = body.profile; });
          await fetchPart('Company wages', 'company/employees', body => { data.employees = body.employees; });
        } else if (data.job && optional(cfg.salary) === null) {
          let logIds = [];
          await fetchPart('Pay log types', 'torn/logtypes', body => {
            const title = data.job.type === 'company' ? 'company employee pay' : 'job pay';
            logIds = (body.logtypes || []).filter(l => String(l.title).toLowerCase() === title).map(l => l.id).filter(Number.isInteger);
            if (!logIds.length) throw new Error('Pay log type not found; use a salary override.');
          });
          if (logIds.length) await fetchPart('Salary', `user/log?log=${logIds.join(',')}&limit=5&from=${Math.floor(Date.now()/1000)-2*DAY}`,
            body => { data.logs = body.log; });
        }
        if (token !== generation || key !== read('key','')) throw new Error('Settings changed; refresh cancelled.');
        await assertLease();
        if (token !== generation || key !== read('key','')) throw new Error('Settings changed; refresh cancelled.');
        snapshot = { at:Date.now(), data, errors }; write('snapshot',snapshot);
        status.textContent = errors.length ? 'Refresh complete with missing sources. See details below.' : 'Refresh complete.';
      });
    } catch (error) { status.textContent = `${error.message} ${snapshot ? 'Previous snapshot retained.' : 'No income snapshot saved.'}`; }
    finally { busy = false; render(); }
  }
  refreshButton.onclick = refresh;
  const mount = () => { if (!root.isConnected) document.documentElement.append(root); };
  mount(); render();
  if (buttonPosition && Number.isFinite(buttonPosition.x) && Number.isFinite(buttonPosition.y)) positionButton(buttonPosition);
  else buttonPosition = null;
  new MutationObserver(mount).observe(document.documentElement, { childList:true });
  if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('Passive income settings', openSettings);
  if (useGMStorage && typeof GM_addValueChangeListener === 'function') {
    GM_addValueChangeListener(PREFIX+'snapshot', (_key,_old,value,remote) => { if (remote) { snapshot = value; render(); } });
    GM_addValueChangeListener(PREFIX+'key', (_key,_old,_value,remote) => { if (remote) { generation++; snapshot = null; render(); } });
    GM_addValueChangeListener(PREFIX+'settings', (_key,_old,value,remote) => { if (remote) { generation++; cfg = { ...DEFAULTS, ...value }; render(); } });
  }
  if (!useGMStorage) window.addEventListener('storage', event => {
    if (event.key === null || [PREFIX+'key', PREFIX+'settings', PREFIX+'snapshot'].includes(event.key)) {
      generation++; cfg = { ...DEFAULTS, ...read('settings', {}) };
      snapshot = read('snapshot',null); render();
    }
  });
})();
