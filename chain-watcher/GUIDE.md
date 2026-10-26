# Chain Watcher guide

## What is monitored

The watcher reads the chain count and countdown in Torn's native sidebar chain link. It does not request API data, refresh pages, click attack links, or perform gameplay actions. It uses the displayed countdown to calculate a deadline, then tracks elapsed time independently of the sidebar display.

Separate one-shot timers are scheduled for 60 and 30 seconds before the calculated deadline. A periodic check and checks on focus or visibility changes provide additional opportunities to detect new hits and overdue warnings. Starting the watcher inside either window produces the appropriate warning immediately. A timer that skips from 65 to 25 seconds produces only the urgent warning. The notification body reports the time Torn actually showed.

A new hit count or a clear timer reset re-arms the warnings. Missing or unchanged timer markup retains the last known deadline. After three seconds without a changed reading, warnings are marked as estimates. A slowly updating countdown cannot push that deadline later; a new hit or clear timer reset establishes a new deadline. If Torn has not reported a new hit, an estimated warning can be unnecessary. After the deadline has passed, no obsolete countdown warning is sent. Chain cooldowns, zero timers, and chains below ten hits do not generate warnings. Clicking a notification focuses the watching tab. A new hit or disabling the watcher closes the previous notification.

## Controls

Click the bell beside the sidebar chain button to open the controls. Click again, click outside, or press Escape to close them. Monitoring continues with the controls closed. Green marks enabled monitoring; amber marks an urgent timer. Hover over the bell for status. The popup appears above the page content, outside the sidebar's clipping area, and adjusts its position to fit the window.

**Test alert** checks desktop notification delivery without enabling monitoring. Normal timer updates do not dismiss test alerts. Real chain warnings close when a new hit arrives, the timer resets, or the chain ends. Disabling alerts closes the current notification.

## Windows setup

Allow notifications for Torn when prompted by **Enable alerts** or **Test alert**. If permission was previously blocked, change Torn's notification permission through your browser's site settings. Also check Windows notification permissions for your browser and Do Not Disturb/Focus settings.

Keep the watching tab loaded. Where supported, exclude Torn from browser sleeping-tab or memory-saving features. Locking or sleeping the computer, browser throttling, or Torn's own update behavior can prevent timely warnings. The script does not run after the browser closes.

## Background tabs

The deadline and separate timers reduce dependence on Torn’s display updates and the repeating background timer. They do not bypass browser freezing or guarantee delivery at an exact second. Keep Torn open, allow Windows notifications, and exclude Torn from your browser’s sleeping-tab or Memory Saver feature. No alerts run while the computer sleeps or after all Torn tabs close.

To check your setup, enable alerts while a chain is active, switch tabs or minimize the browser, and check both warnings over a countdown. **Test alert** only checks notification permission and appearance; it does not prove background scheduling reliability.

## Multiple tabs and privacy

A Web Lock allows only one watching tab on the same Torn origin. The `www` and non-`www` origins are separate; use one consistently. The watch is initially off. Your enabled preference is stored locally for this Torn origin and restored after navigation or reload. Disable alerts to turn it off across tabs. An open tab retries automatically when the previous watcher releases its lock. No API key, telemetry, external libraries, or network requests are used.

Desktop notifications may appear on your Windows lock screen according to your system settings. They contain the chain hit count and remaining time.

Only the enabled preference is saved. Warning history resets when a new page or tab takes over, so navigating during the final minute can repeat the current warning.

## Compatibility

Designed for desktop Tampermonkey in a browser supporting the Notifications and Web Locks APIs. TornPDA/mobile system notifications are not supported by this version. Sidebar selectors use the native faction chain link and countdown classes; a Torn layout change can require an update.

If the bell is missing, check that Torn's sidebar chain link is visible and reload the page. If no desktop alert appears, try **Test alert** and check browser site permissions and Windows notification settings. The script requests a notification that remains until interaction, but the browser and Windows control its final appearance and duration.
