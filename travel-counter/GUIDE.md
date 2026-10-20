# Travel Counter

Detailed usage and historical development notes. See [README](README.md) for the current overview.

Version **1.2.0** supports Tampermonkey and TornPDA in the same file. In TornPDA, add the complete `torn-travel-counter.user.js` file to its userscripts, enable it, then reload `https://www.torn.com/page.php?sid=travel`. Use the panel's **API key** button to enter your Limited-access key. No GMforPDA helper is required, and the script does not automatically use TornPDA's account key. The mobile spacing, hidden cities, and green counts at 50+ are retained.

TornPDA uses `PDA_httpGet` with the key in the Authorization header and stores settings/counts in this script's prefixed localStorage keys. This storage is shared with Torn's page origin, is not isolated like Tampermonkey storage, and can be cleared with browser/site data. Settings do not sync with Tampermonkey. Native request timeouts ignore late responses. Visible TornPDA pages do not require the WebView's unreliable document-focus flag.

Web Locks coordinate requests when available; older WebViews use atomic IndexedDB reservations. If coordination storage fails, requests pause. Clearing site data also clears the TornPDA request budget. The rate limit applies within shared browser storage; separate app/browser profiles have separate budgets.

Eight automated tests cover the data/rate-limit behavior plus mocked TornPDA storage, native HTTP, timeouts, and Tampermonkey compatibility. Actual TornPDA device verification remains pending. Native API reference: https://github.com/Manuito83/torn-pda/blob/master/userscripts/TornPDA_API.js.

Version 1.1.1 corrects mobile placement: the flag, country, and right-aligned count now render inside the original destination cell, before the time and price columns. The mobile view hides all original destination text (including city names and separators) while retaining Torn's original DOM for desktop. This fixes the extra count column introduced in 1.1.0. Syntax and API tests pass; the revised layout still needs live mobile verification.

Version 1.1.0 adds a mobile layout (viewport width up to 768px): recognized destination rows hide their standalone city label and show the lifetime visit count aligned right beside the country. The desktop layout stays unchanged. Once all 11 destinations match, the duplicate list in the panel is hidden; API settings and update/error status remain available. Inline counts use the same cached API response and add no requests. Matching runs on the existing five-second local timer, including after Torn redraws its rows. Mobile selectors are based on published travel-script source and still need verification on your live page; unmatched layouts retain the panel list.

Install `torn-travel-counter.user.js` as a **separate new script** in Tampermonkey: Create a new script, replace the editor contents with the complete file, and save. Open Torn's Travel Agency (`https://www.torn.com/page.php?sid=travel`) and enter your **Limited-access API key** in the **My country visits** panel. The script displays the key owner's lifetime visits to all 11 destinations. Public Only keys do not provide these private country stats. Use your own key; no player ID is needed.

The panel appears above the travel page content and adapts to narrow screens. Counts use the official API v2 `user/personalstats?cat=travel` response. Missing values display as `—`, and API errors leave the last successful counts visible with their update time. **API key → Forget key** removes the locally saved key and counts. Saving a replacement key clears old counts.

At most **one API request per rolling minute** across this script's travel tabs in the same browser profile. Reloads, failed requests, and changing keys do not reset the allowance. Web Locks coordinate tabs, with an IndexedDB fallback on older WebViews; requests pause if coordination fails. Only a visible travel tab starts requests; Tampermonkey also requires focus. A five-second local timer checks whether a refresh is due; it does not make a request every five seconds. Separate devices and other scripts have independent allowances.

No external libraries, backend, telemetry, or travel automation. The API key and counts stay in Tampermonkey storage or TornPDA localStorage; the key is sent only to `api.torn.com` in the Authorization header.

Development verification: Tests cover country mapping, unavailable stats, rate-limit boundaries, concurrent tabs, reloads, and failed requests. The API schema was checked against https://www.torn.com/swagger/openapi.json. Live layout and authenticated responses still need verification on your Torn account.

