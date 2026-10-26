// ==UserScript==
// @name         Torn Chain Watcher
// @namespace    https://github.com/vexiumlabs/torn-scripts
// @author       DarrylPhilbin
// @license      GPL-3.0-only
// @copyright    2026 DarrylPhilbin
// @version      1.0.3
// @description  Desktop alerts when your faction chain has one minute and 30 seconds remaining.
// @match        https://www.torn.com/*
// @match        https://torn.com/*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==
// Copyright (C) 2026 DarrylPhilbin
// SPDX-License-Identifier: GPL-3.0-only
// This program is free software: you can redistribute it and/or modify
// it under the GNU General Public License, version 3, as published by
// the Free Software Foundation. This program comes WITHOUT ANY WARRANTY;
// without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
// PARTICULAR PURPOSE. See https://www.gnu.org/licenses/ for details.

(() => {
  'use strict';
  const ID = 'torn-chain-watcher';
  function secondsFrom(text) {
    const match = /^\s*(\d{1,2}):([0-5]\d)\s*$/.exec(text);
    if (!match) return null;
    const seconds = Number(match[1]) * 60 + Number(match[2]);
    return seconds <= 300 ? seconds : null;
  }
  function parseChain(countText, timerText, context = '') {
    if (/cool\s*down/i.test(context)) return null;
    const match = /(?:^|\bChain\s*:?\s*)([\d,]+)\s*\/\s*[\d,.]+k?\b/i.exec(countText.trim());
    const count = match ? Number(match[1].replace(/,/g, '')) : NaN;
    const seconds = secondsFrom(timerText);
    if (!Number.isSafeInteger(count) || count < 0 || seconds === null) return null;
    return { count, seconds };
  }
  function advance(previous, sample) {
    // Missing DOM is not evidence of a new chain or a reset.
    if (!sample) return { state: previous, alert: null };
    if (sample.count < 10 || sample.seconds === 0) return { state: null, alert: null };
    const reset = !previous || sample.count !== previous.count || sample.seconds > previous.seconds + 5;
    const state = { ...sample, minute: reset ? false : previous.minute, urgent: reset ? false : previous.urgent };
    let alert = null;
    // Catch delayed ticks, but send only the most urgent warning, not two at once.
    if (sample.seconds <= 30) {
      if (!state.urgent) alert = 30;
      state.minute = state.urgent = true;
    } else if (sample.seconds <= 60 && !state.minute) {
      state.minute = true;
      alert = 60;
    }
    return { state, alert };
  }
  if (typeof module === 'object' && module.exports) {
    module.exports = { secondsFrom, parseChain, advance };
    return;
  }
  if (!document.body || document.getElementById(ID)) return;

  const panel = document.createElement('section');
  panel.id = ID;
  panel.setAttribute('aria-label', 'Chain watcher');
  panel.innerHTML = '<button data-toggle type="button" aria-label="Chain Watcher settings" aria-expanded="false">&#128276;</button><div data-controls hidden><strong>Chain Watcher</strong><div data-status role="status">Alerts off</div><div class="cw-actions"><button data-enable>Enable alerts</button><button data-test>Test alert</button></div></div>';
  const style = document.createElement('style');
  style.textContent = `#${ID}{position:fixed;bottom:60px;left:12px;z-index:10000;width:245px;max-width:calc(100vw - 40px);padding:10px;background:#242a30;color:#f4f4f4;border:1px solid #85909c;border-radius:6px;box-shadow:0 3px 12px #0005;font:12px/1.4 Arial,sans-serif}#${ID} [data-status]{margin:5px 0;overflow-wrap:anywhere}#${ID} .cw-actions{display:flex;gap:6px}#${ID} button{padding:7px;border:1px solid #85909c;border-radius:4px;background:#37424d;color:white;cursor:pointer}#${ID}[data-urgent="true"]{border:2px solid #ffb34d}`;
  document.head.appendChild(style);
  style.textContent += `#${ID}{display:inline-block;position:relative;bottom:auto;left:auto;width:auto;max-width:none;padding:0;margin-left:4px;background:transparent;border:0;box-shadow:none;vertical-align:middle}#${ID} [hidden]{display:none!important}#${ID} [data-toggle]{padding:2px;width:24px;height:24px;font-size:14px;background:transparent}#${ID} [data-controls]{position:absolute;top:100%;left:0;width:235px;padding:10px;background:#242a30;border:1px solid #85909c;border-radius:6px;box-shadow:0 3px 12px #0005}#${ID}[data-enabled="true"] [data-toggle]{border-color:#65c98a}#${ID}[data-urgent="true"]{border:0}#${ID}[data-urgent="true"] [data-toggle]{border-color:#ffb34d}`;
  const toggle = panel.querySelector('[data-toggle]');
  const controls = panel.querySelector('[data-controls]');
  controls.id = ID + '-controls';
  toggle.setAttribute('aria-controls', controls.id);
  // Escape the sidebar's overflow clipping by mounting the popup at body level.
  style.textContent += `#${ID}-controls{position:fixed;z-index:2147483647;box-sizing:border-box;width:255px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;padding:10px;background:#242a30;color:#f4f4f4;border:1px solid #85909c;border-radius:6px;box-shadow:0 3px 12px #0005;font:12px/1.4 Arial,sans-serif}#${ID}-controls[hidden]{display:none!important}#${ID}-controls [data-status]{margin:5px 0;overflow-wrap:anywhere}#${ID}-controls .cw-actions{display:flex;gap:6px}#${ID}-controls button{padding:7px;border:1px solid #85909c;border-radius:4px;background:#37424d;color:white;cursor:pointer}`;
  function positionControls() {
    if (controls.hidden) return;
    const anchor = toggle.getBoundingClientRect();
    const width = controls.offsetWidth, height = controls.offsetHeight;
    const left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8));
    const below = anchor.bottom + 6;
    const top = below + height <= window.innerHeight - 8 ? below : Math.max(8, anchor.top - height - 6);
    controls.style.left = left + 'px';
    controls.style.top = top + 'px';
  }
  function closeControls() { controls.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }
  toggle.onclick = event => {
    event.preventDefault(); event.stopPropagation();
    controls.hidden = !controls.hidden;
    toggle.setAttribute('aria-expanded', String(!controls.hidden));
    positionControls();
  };
  document.addEventListener('click', event => { if (!panel.contains(event.target) && !controls.contains(event.target)) closeControls(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !controls.hidden) { closeControls(); toggle.focus(); } });
  window.addEventListener('resize', positionControls);
  window.addEventListener('scroll', positionControls, true);
  function mount() {
    const links = [...document.querySelectorAll('a[href*="factions.php"][href*="/war/chain"]')];
    const link = links.find(item => item.getClientRects().length > 0);
    if (link && link.nextElementSibling !== panel) link.insertAdjacentElement('afterend', panel);
    if (!link && panel.isConnected) { panel.remove(); closeControls(); }
  }
  mount();
  const status = panel.querySelector('[data-status]');
  const enable = panel.querySelector('[data-enable]');
  const test = panel.querySelector('[data-test]');
  document.body.appendChild(controls);
  let enabled = false, starting = false, leaving = false, state = null, release = null;
  let signature = '', lastChange = 0, notification = null, notificationKind = null;
  const savedKey = ID + '-enabled';
  function savedEnabled() { try { return localStorage.getItem(savedKey) === 'true'; } catch { return false; } }
  function saveEnabled(value) { try { localStorage.setItem(savedKey, String(value)); } catch { tell('Browser storage unavailable; this preference cannot survive reloads.'); } }
  function tell(text) { if (status.textContent !== text) status.textContent = text; toggle.title = 'Chain Watcher: ' + text; panel.dataset.enabled = String(enabled); }
  function clearNotification() { notification?.close(); notification = null; notificationKind = null; }
  function desktop(title, text, kind = 'chain') {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') throw new Error('Allow Torn notifications in your browser, then enable alerts again.');
    clearNotification();
    notification = new Notification(title, { body: text, tag: 'torn-chain-watcher', renotify: true, requireInteraction: true });
    notificationKind = kind;
    notification.onclick = () => { window.focus(); clearNotification(); };
    notification.onerror = () => tell('Desktop notification failed. Check browser and Windows notification settings.');
  }
  async function permission() {
    if (typeof Notification === 'undefined') throw new Error('Desktop notifications are unavailable in this browser.');
    const result = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (result !== 'granted') throw new Error('Notifications blocked. Allow notifications for Torn in browser site settings.');
  }
  function readChain() {
    // Restrict reads to the native chain link so other sidebar timers cannot match.
    const links = [...document.querySelectorAll('a[href*="factions.php"][href*="/war/chain"]')];
    const samples = links.map(link => {
      const context = [link.textContent, link.getAttribute('aria-label'), link.getAttribute('title')].filter(Boolean).join(' ');
      const value = link.querySelector('[class*="bar-value"]')?.textContent || context;
      const timer = link.querySelector('[class*="bar-timeleft"]')?.textContent;
      // Some layouts expose the entire value through the link's accessible label.
      const times = [...context.matchAll(/\b\d{1,2}:[0-5]\d\b/g)].map(match => match[0]);
      return parseChain(value, timer || (times.length === 1 ? times[0] : ''), context);
    }).filter(Boolean);
    if (!samples.length) return null;
    const first = samples[0];
    return samples.every(value => value.count === first.count && Math.abs(value.seconds - first.seconds) <= 1) ? first : null;
  }
  function stop(message = 'Alerts off') {
    enabled = false;
    state = null;
    clearNotification();
    if (release) { release(); release = null; }
    enable.textContent = 'Enable alerts';
    panel.dataset.urgent = 'false';
    tell(message);
  }
  function tick() {
    if (leaving) return;
    mount();
    if (!enabled) {
      if (!starting && savedEnabled() && typeof Notification !== 'undefined' && Notification.permission === 'granted') void start();
      return;
    }
    if (Notification.permission !== 'granted') { stop('Notification permission was removed.'); return; }
    const sample = readChain();
    if (!sample) { tell('Waiting for Torn\'s chain timer. Keep this tab open.'); return; }
    const currentSignature = sample.count + ':' + sample.seconds;
    const now = performance.now();
    if (currentSignature !== signature) { signature = currentSignature; lastChange = now; }
    if (now - lastChange > 10000 && sample.seconds > 0 && sample.count >= 10) {
      tell('Torn\'s timer is not updating. Check the page; alerts may be delayed.');
      return;
    }
    const result = advance(state, sample);
    const newHit = state && result.state && state.count !== result.state.count;
    // Timer updates may retire a chain warning, but must not dismiss a test alert.
    if (notificationKind === 'chain' && (newHit || !result.state || sample.seconds > 60)) clearNotification();
    state = result.state;
    panel.dataset.urgent = String(sample.count >= 10 && sample.seconds > 0 && sample.seconds <= 60);
    tell(sample.count < 10 ? 'Watching; waiting for a chain of 10+ hits.' : sample.seconds === 0 ? 'Chain timer expired; waiting for a new chain.' : `Watching ${sample.count.toLocaleString()} hits - ${Math.floor(sample.seconds / 60)}:${String(sample.seconds % 60).padStart(2, '0')} left`);
    if (result.alert) {
      try { desktop(result.alert === 30 ? 'Torn chain: 30-second warning' : 'Torn chain: 1-minute warning', `${sample.count.toLocaleString()} hits. Torn shows ${sample.seconds} seconds remaining. Your chain needs a hit!`); }
      catch (error) { stop(error.message); }
    }
  }
  async function start() {
    if (starting) return;
    starting = true; enable.disabled = true;
    try {
      await permission();
      if (!navigator.locks?.request) throw new Error('This browser needs Web Locks support to prevent duplicate alerts across tabs.');
      // Hold one lock for the watch session. Other tabs can still use Torn normally.
      void navigator.locks.request('torn-chain-watcher-v1', { ifAvailable: true }, async lock => {
        if (!lock) { tell('Already watching in another Torn tab. Disable it there first.'); return; }
        enabled = true; state = null; signature = ''; lastChange = performance.now();
        enable.textContent = 'Disable alerts';
        const done = new Promise(resolve => { release = resolve; });
        tick();
        await done;
      }).catch(error => stop('Unable to start watcher: ' + error.message));
    } catch (error) { tell(error.message); }
    finally { starting = false; enable.disabled = false; }
  }
  enable.onclick = async () => {
    if (savedEnabled() || enabled) { saveEnabled(false); stop(); return; }
    await permission().then(async () => { saveEnabled(true); await start(); }).catch(error => tell(error.message));
  };
  test.onclick = async () => {
    try { await permission(); desktop('Torn Chain Watcher - test', 'Desktop notifications are working. Real alerts trigger at 1 minute and 30 seconds.', 'test'); }
    catch (error) { tell(error.message); }
  };
  setInterval(tick, 1000);
  window.addEventListener('storage', event => { if (event.key === savedKey && !savedEnabled()) stop(); });
  window.addEventListener('pagehide', () => { leaving = true; stop(); });
  window.addEventListener('pageshow', () => { leaving = false; tick(); });
  if (savedEnabled() && typeof Notification !== 'undefined' && Notification.permission === 'granted') void start();
})();
