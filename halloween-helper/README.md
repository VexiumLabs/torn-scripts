# Torn Halloween Helper

One Halloween userscript for treat receipts, upgrade goals, and your own target rotation.

**Author:** DarrylPhilbin · **Version:** 1.1.3 · **License:** GPL-3.0-only

## Features

- **Yearly receipts:** automatically sync Halloween basket logs about once a minute while Torn is visible and focused. Keep individual receipts and total earned treats without subtracting purchases or exchanges. Receipts are deduplicated across syncs.
- **January reset:** the event ledger starts fresh on January 1 at 00:00 Torn time (UTC). Saved targets, your pin, and pumpkin position remain.
- **Pinned upgrade:** open your basket and use the small pin beside an upgrade. The sidebar and pumpkin show your selected upgrade and how many treats remain. An alert tells you when the recorded balance covers its cost and its tier is unlocked.
- **Halloween targets:** use the pumpkin in a player's Actions grid to add or remove them from a separate list. A checkmark shows saved players. Choose **Next target** to cycle through every saved profile in order. Adding, removing, and cycling targets use no API calls; player availability is not checked.
- **Movable controls:** drag the floating pumpkin wherever you prefer. Its position is saved across pages, and the panel stays open in the current tab while cycling targets.
- **Off-season toggle:** disable **Live treat counter and automatic sync** in Settings to hide the sidebar counter and pause automatic receipt syncing and upgrade alerts. Target saving and cycling still work year-round.

## Installation

1. Install [the userscript](torn-halloween-helper.user.js) in Tampermonkey or Torn PDA. In PDA, add it under **Settings → Userscripts**, choose **END** injection, enable it, and reload Torn. Both platforms use this same file.
2. Open the pumpkin's **Settings** and enter your own **Full Access Torn API key**. Historical logs require Full Access. The key stays on your device and is sent only to `api.torn.com`.
3. Select **Sync receipts**. Large histories are imported in batches; keep selecting it while the helper reports partial history.
4. Open your Halloween basket. Use a helper **Pin** button to choose an upgrade; this does not purchase it or exchange treats.
5. Visit player profiles and use the profile pumpkin to build your Halloween target list.

The script never attacks, purchases upgrades, exchanges treats, or automatically refreshes Torn pages. Target navigation happens only when you press **Next target**.

## Updates

The script declares GitHub update and download URLs for Torn PDA and Tampermonkey. Existing installations need version 1.1.3 or later installed once to pick up these headers. After that, use your userscript manager's update controls instead of copying code. In PDA, check for updates in Userscripts and apply the available update. Update the existing entry rather than deleting and reinstalling it, to preserve its native storage. Update timing and installation are controlled by the manager; the script does not silently replace itself.

See the [guide](GUIDE.md) for target cycling, upgrade estimates, storage, and troubleshooting. Automated logic tests and a local browser fixture cover the main behaviors; Torn markup and API log formats may change.

PDA uses an in-panel upgrade alert while the app is open; it does not send background phone notifications. Use one helper tab on older WebViews without Web Locks. PDA compatibility is tested with a mobile browser simulation of its APIs, not yet on a physical device.

[Back to all scripts](../README.md)
