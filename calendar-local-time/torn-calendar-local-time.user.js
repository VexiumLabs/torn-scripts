// ==UserScript==
// @name         Torn Calendar Local Time
// @namespace    https://github.com/vexiumlabs/torn-scripts
// @author       DarrylPhilbin
// @license      GPL-3.0-only
// @copyright    2026 DarrylPhilbin
// @version      1.0.0
// @description  Show your local start and end times beneath Torn's calendar event times.
// @match        https://www.torn.com/calendar.php*
// @match        https://torn.com/calendar.php*
// @grant        none
// @run-at       document-end
// @noframes
// ==/UserScript==
// Copyright (C) 2026 DarrylPhilbin
// SPDX-License-Identifier: GPL-3.0-only
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, version 3 of the License.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.

(() => {
  'use strict';
  const CLASS = 'torn-calendar-local-time';
  // Format observed in Torn's own event popup. TCT is UTC, not UK local time.
  const stamp = '(\\d{1,2}):(\\d{2}):(\\d{2})\\s*[-\\u2013\\u2014]\\s*(\\d{1,2})/(\\d{1,2})/(\\d{4}|\\d{2})';
  const rangePattern = new RegExp('^\\s*' + stamp + '\\s+until\\s+' + stamp + '\\s*$', 'i');

  function utc(parts) {
    const [hour, minute, second, day, month, shortYear] = parts.map(Number);
    const year = shortYear < 100 ? 2000 + shortYear : shortYear;
    if (year < 2004 || year > 2199 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
    const result = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    // Date.UTC normalizes invalid dates; reject rather than silently shifting them.
    if (result.getUTCFullYear() !== year || result.getUTCMonth() !== month - 1 || result.getUTCDate() !== day) return null;
    return result;
  }

  function parseRange(text) {
    const match = rangePattern.exec(text.replace(/\u00a0/g, ' '));
    if (!match) return null;
    const start = utc(match.slice(1, 7));
    const end = utc(match.slice(7, 13));
    return start && end && end >= start ? { start, end } : null;
  }

  function localLines(range, locale, timeZone) {
    const zone = timeZone || new Intl.DateTimeFormat().resolvedOptions().timeZone;
    const formatter = new Intl.DateTimeFormat(locale, {
      timeZone: zone,
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short'
    });
    return { zone: formatter.resolvedOptions().timeZone,
      start: formatter.format(range.start), end: formatter.format(range.end) };
  }

  if (typeof module === 'object' && module.exports) {
    module.exports = { utc, parseRange, localLines };
    return;
  }
  if (location.pathname !== '/calendar.php' || !document.body || document.getElementById(CLASS + '-style')) return;

  const style = document.createElement('style');
  style.id = CLASS + '-style';
  style.textContent = `.${CLASS}{display:block;margin-top:5px;padding-top:5px;border-top:1px solid currentColor;font-family:Arial,sans-serif;font-size:11px;line-height:1.45;white-space:normal;overflow-wrap:anywhere;color:inherit}.${CLASS}>span{display:block}.${CLASS}>strong{display:block;font-weight:600}`;
  document.head.appendChild(style);
  const tracked = new Map();

  function sourceText(element) {
    // Our block is always a direct child. Reading everything else preserves
    // timestamps split across native spans without including our converted text.
    return Array.from(element.childNodes)
      .filter(node => !(node.nodeType === 1 && node.classList.contains(CLASS)))
      .map(node => node.textContent).join('');
  }

  function update(element) {
    const range = parseRange(sourceText(element));
    const previous = tracked.get(element);
    if (!element.isConnected || !range) {
      previous?.node.remove();
      tracked.delete(element);
      return;
    }
    const local = localLines(range);
    const key = [local.zone, local.start, local.end].join('|');
    if (previous?.key === key && previous.node.parentNode === element) return;
    previous?.node.remove();
    const node = document.createElement('span');
    node.className = CLASS;
    const heading = document.createElement('strong');
    heading.textContent = 'Your local time (' + local.zone.replace(/_/g, ' ') + ')';
    node.appendChild(heading);
    for (const [label, value] of [['Starts', local.start], ['Ends', local.end]]) {
      const line = document.createElement('span');
      line.textContent = label + ': ' + value;
      node.appendChild(line);
    }
    element.appendChild(node);
    tracked.set(element, { node, key });
  }

  function scan() {
    queued = false;
    // Also clean up reused tooltip containers when Torn changes the event text.
    for (const element of tracked.keys()) update(element);
    // Tooltips can be portalled outside #calendar-root. Match only the complete
    // native timestamp line, never event descriptions or unrelated page dates.
    const candidates = [];
    for (const element of document.body.querySelectorAll('div, span, p, time')) {
      if (tracked.has(element) || element.closest('.' + CLASS) || element.closest('script, style, textarea, [contenteditable="true"]')) continue;
      const text = element.textContent;
      if (text.length > 120 || !text.includes('until')) continue;
      if (parseRange(text)) candidates.push(element);
    }
    // Add once at the deepest matching element; ancestors may contain the same
    // line wrapped in one or more spans.
    for (const element of candidates) {
      if (!candidates.some(other => other !== element && element.contains(other))) update(element);
    }
  }

  let queued = false;
  function schedule() {
    if (queued || document.hidden) return;
    queued = true;
    requestAnimationFrame(scan);
  }
  const observer = new MutationObserver(records => {
    // Ignore our own inserts/removals so adding the local line cannot loop.
    if (records.some(record => {
      if (record.target.nodeType === 1 && record.target.closest('.' + CLASS)) return false;
      if (record.target.parentElement?.closest('.' + CLASS)) return false;
      if (record.type === 'characterData') return true;
      return [...record.addedNodes, ...record.removedNodes].some(node =>
        !(node.nodeType === 1 && node.classList.contains(CLASS)));
    })) schedule();
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  // Torn handles hover/tap itself; no synthetic clicks or prevented events.
  for (const event of ['pointerover', 'click', 'focusin']) document.addEventListener(event, schedule, { passive: true });
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('pageshow', schedule);
  schedule();
})();
