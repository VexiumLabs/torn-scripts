# Torn RR Odds

Show the risk of the next shot in Torn's Russian Roulette, with double/triple-shot odds when those controls are available.

**Author:** DarrylPhilbin · **Version:** 1.0.0 · **License:** GPL-3.0-only

## Features

- Reads the odds Torn displays on your turn, without API calls.
- Shows remaining chambers and hit/safe percentages.
- Includes double and triple shots only when the corresponding controls are available.
- Clears the odds when the turn is uncertain or the round ends.
- One script for desktop Tampermonkey and Torn PDA; no key or saved settings required.

## Installation

Install [the userscript](torn-rr-odds.user.js) in Tampermonkey or Torn PDA. In PDA use **END** injection. Enable it and reload the RR page. The display appears below the game area during a round.

For Torn PDA, add the [raw GitHub script URL](https://raw.githubusercontent.com/VexiumLabs/torn-scripts/main/rr-odds/torn-rr-odds.user.js) under **Settings → Userscripts**. No API key or extra compatibility script is needed.

The script only displays information. It never joins games, places bets, fires shots, or presses any game controls. GitHub update URLs are included for future published versions.

## Updates and compatibility

The `@updateURL` and `@downloadURL` headers both point to the raw script on GitHub. Use PDA's Userscripts update controls to check for and apply newer versions; Tampermonkey can use the same metadata. Update checks and installation are managed by the app, not by a background updater inside the script.

Desktop and mobile browser simulations are tested without GM APIs or Web Locks. Physical Android/iOS testing is still needed.

See the [guide](GUIDE.md) for calculations and detection limits.

[Back to all scripts](../README.md)
