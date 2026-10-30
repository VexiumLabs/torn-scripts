# Halloween Helper guide

## Seasonal visibility

The floating pumpkin and sidebar counter appear from October 23 until November 3 at your configured event start time: 48 hours before October 25 and 48 hours after November 1. Set your personal event start time in Settings using 24-hour Torn time (UTC), with minutes limited to 00, 15, 30, or 45; the default is 00:00. No calendar API requests are added. Outside this window, automatic receipt syncing and upgrade alerts pause. Profile add/remove target buttons remain available year-round, and saved targets are retained. A manually disabled counter stays disabled when the season returns.

## Treat receipts

The sidebar counter sits beneath the chain link during both active chains and decay. It reattaches when Torn replaces the chain display, rather than falling back to the top of the sidebar.

In the pumpkin's **Settings**, turn off **Live treat counter and automatic sync** to hide the sidebar counter and pause automatic receipt syncing and upgrade alerts. The choice is saved on your device and defaults to on. Your saved receipts, pin, and targets are retained; adding/removing targets, Next target, and manual **Sync receipts** remain available. An already-running sync may finish. Turn it back on to show the counter and resume overdue syncing. This applies to both desktop and PDA.

The helper uses Torn's documented v2 log API and discovers the Halloween basket category from Torn's log-category list. Each recognized receipt is saved under its unique log ID. This prevents overlap between paginated or repeated requests from increasing the total twice.

The displayed total is earned treats for the current UTC calendar year, not your spendable basket balance or lifetime basket progress. Purchases and exchanges do not reduce it. Recognized incoming treat logs are included; new or unrecognized log formats are flagged rather than guessed. The most recent 20 receipts are shown, with all recognized receipts retained for the current year.

Sync runs while Torn is focused, approximately once a minute. Overdue syncs are also checked immediately on page load and when you return to Torn, so moving quickly between profiles does not postpone updates. **Sync receipts** also runs it manually. Up to five pages of 100 logs are fetched in a batch, and larger imports resume from their saved position. The total is marked partial until the first import finishes. API delays mean a receipt may not appear immediately after an attack.

On January 1 at 00:00 UTC, the next update starts a fresh ledger. The previous year's receipts are not included. This resets only the helper's statistics; it does not change your actual Torn basket. Targets, the upgrade pin, and the pumpkin position survive.

## Upgrade pinning

Open your basket normally. The helper adds a small pin beside each recognized upgrade. The selected pin is highlighted; clicking it again unpins that upgrade. Pins follow the upgrade icons while scrolling without changing the basket layout. Its buttons never trigger Torn's upgrade or exchange buttons. Costs are based on the documented upgrade list and may need updating if Torn changes them.

Your current spendable balance is read from the basket you are actively viewing. The helper keeps this separate from the basket's Treats Collected progress. Later API receipts add to this recorded balance and recognized upgrade costs subtract from it. Exchanges or unknown balance-changing log formats invalidate the estimate and ask you to reopen your basket. A stale estimate shows “sync needed”; opening the basket is only required when no usable balance remains, such as after an exchange or an unknown balance change.

The alert means **enough treats and the tier is unlocked**. It does not certify that an upgrade is unowned or that special conditions—particularly for Summon Him—are satisfied. Confirm these in Torn before purchasing. A pin alerts once until you unpin or select it again. The helper does not buy the upgrade.

## Target list

The profile pumpkin adds or removes the player from your Halloween list. It appears in the profile Actions grid beside the native target control and matches its dimensions. A highlighted pumpkin with a checkmark means the player is saved; clicking it again removes them. The button is disabled while a save is pending to prevent repeated clicks. Your normal Torn target list is not modified.

**Next target** opens one saved profile per click, in list order, and wraps back to the beginning after the last target. Your position is saved across page changes. The panel also stays open in the current tab when you use Next target, so you can keep cycling. Ordinary navigation and reloads start with the panel closed; only Next target reopens it on the destination profile. Cycling uses no API calls and does not wait for receipt syncing.

All saved targets are included, regardless of status or faction. Check the profile yourself to decide whether you can attack. The helper only opens the profile; you open the attack page and perform the attack yourself.

Adding a target reads their name from the open profile's page title and their ID from its URL. Adding, removing, and cycling targets use no API calls. If the profile name has not loaded, wait for the page to finish loading and try again. Receipt syncing continues to use the API separately.

## Storage and requests

Tampermonkey stores the API key, account identity, current-year receipts, target names and IDs, cursor, pin, recorded basket balance, and pumpkin position locally. No third-party server receives them. No key is embedded in the script, query string, or console output. **Forget key** removes the stored credential while preserving your local lists and receipts.

Next target uses a one-use, destination-specific session marker to reopen the panel. Setup prompts and background sync errors do not automatically open it. Target operations use local data, but initial account setup and receipt syncing require your API key.

### Torn PDA

The sidebar treat total uses the compact `🎃 123` format on PDA. Desktop retains `🎃 123 earned`. Pinned upgrade progress still follows the total on both platforms.

Install the same `.user.js` file in PDA with **END** injection. Enter a Full Access key in the helper's Settings; it does not automatically use PDA's configured key, which may lack log access. Desktop and phone settings and lists are separate.

Version 1.1.3 adds `@updateURL` and `@downloadURL` pointing to the script on GitHub. Install this version once into your existing PDA script entry, then use PDA's Userscripts update controls for future releases. PDA compares the published version against your installed version. Apply updates in place to retain script storage; you do not need to copy each future release manually. The app controls when checks occur and whether user confirmation is needed.

On current PDA versions, the helper uses `PDA_storage` for durable script storage and `PDA_httpGet` for API requests. On older versions without native storage it uses a script-prefixed browser store; clearing browser data can erase that fallback store. Storage write failures are reported instead of silently treating a target as saved.

Web Locks are used where available. Without them, operations are serialized within the current tab only: use one Halloween Helper tab to avoid conflicting writes from multiple tabs. PDA syncing requires a visible page but does not depend on desktop-style window focus.

Upgrade alerts open the helper panel instead of invoking PDA's blocking confirmation dialog. No background phone notifications are scheduled. Keep PDA open to receive updates. Dragging the pumpkin uses touch pointer events, and the panel fits the screen width.

Requests are spaced at least 1.8 seconds apart, with a longer pause after API errors. Other tools still share Torn's account/API limits. Where supported, Web Locks serialize writes and requests among tabs on the same origin. Use `www.torn.com` consistently; mixing it with `torn.com` does not share those locks. The helper supports one connected account per installation.

Page reading occurs only while the document is visible (and focused on desktop). The helper does not run gameplay actions, poll hidden profile pages, or touch Exchange. Desktop notifications are delivered through Tampermonkey and depend on browser/OS notification settings; PDA alerts appear inside the helper.

## Troubleshooting

- **Sync needed:** keep Torn visible and focused so an overdue sync can run, or press **Sync receipts**. A saved estimate older than two minutes is not used for upgrade alerts.
- **Open your basket to refresh:** open the basket to establish a spendable balance again. Exchanges and unrecognized balance changes invalidate the previous estimate.
- **Profile name has not loaded:** wait for the profile to finish loading, then click its pumpkin again. The helper does not make an API request as a fallback.
- **Partial history:** use **Sync receipts** again to continue importing. Upgrade alerts wait until the pending import completes.

## Verification

Automated tests cover yearly reset, duplicate receipts, unknown logs, target rotation, balance adjustments, stale upgrade data, and pagination URL validation. A local browser fixture verifies delayed Actions-grid loading, saving names and IDs without API calls, target cycling across page loads, panel persistence, and refreshing overdue upgrade estimates. These tests use mock data; they do not connect to a live Torn account.

References: [Torn API schema](https://www.torn.com/swagger.php), [Trick or Treat](https://wiki.torn.com/wiki/Trick_or_Treat), [Torn scripting rules](https://www.torn.com/rules.php).

PDA compatibility follows its [userscript documentation](https://github.com/Manuito83/torn-pda/blob/master/userscripts/README.md). Mobile browser tests simulate PDA storage, HTTP requests, missing Web Locks, and notification behavior. Physical Android/iOS testing remains outstanding.
