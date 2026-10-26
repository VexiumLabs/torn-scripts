# Torn Chain Watcher

Desktop notifications when your faction's active chain reaches **1 minute** and **30 seconds** remaining. On Windows, notifications are delivered through your browser.

**Author:** DarrylPhilbin  
**Version:** 1.1.0<br>
**Environment:** Desktop Tampermonkey with browser notifications and Web Locks  
**API key:** None

## Install and use

1. Copy [the complete userscript](torn-chain-watcher.user.js) into a new Tampermonkey script, save, and reload Torn.
2. Click the bell beside Torn’s sidebar chain button, then click **Test alert** and allow notifications for Torn. Check that Windows displays the notification.
3. Click **Enable alerts** in the tab you want to leave open.

The watcher calculates an expiry time from Torn’s last reading and schedules each warning separately, so it does not depend only on the sidebar countdown updating. If updates stop, notifications clearly label the remaining time as estimated. A hit that Torn has not reported yet can make an estimated alert unnecessary.

Each warning fires once per hit count. A new hit re-arms the warnings. The script watches chains of at least 10 hits; cooldowns and expired timers do not trigger warnings. If a delayed update jumps past both thresholds, it sends only the 30-second warning with the actual remaining time.

Your enabled preference is saved in this browser. Monitoring resumes after navigation or reload, and another open Torn tab can take over when the watching tab closes. No monitoring runs when all Torn tabs are closed. Only one tab per Torn origin can watch at once. Use the same `www.torn.com` address across your tabs.

**Important:** Leave Torn open and your computer awake. Background-tab throttling, stale Torn data, browser memory saving, or Windows Do Not Disturb can delay or suppress notifications. This is a reminder, not a guarantee that the chain will be saved.

See the [guide](GUIDE.md) for controls, troubleshooting, and data handling. Use **Test alert** to check notification delivery on your own setup.

## License

Copyright (C) 2026 DarrylPhilbin. [GNU GPL version 3](../LICENSE) (GPL-3.0-only).

[Back to all scripts](../README.md)
