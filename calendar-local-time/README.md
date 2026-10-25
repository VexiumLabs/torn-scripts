# Torn Calendar Local Time

Adds your local start and end dates beneath Torn's original event times when you open an Events Calendar popup by hovering or tapping.

**Author:** DarrylPhilbin  
**Version:** 1.0.0  
**Designed for:** Tampermonkey and TornPDA  
**API key:** None

## Install

Copy [the complete userscript](torn-calendar-local-time.user.js) into Tampermonkey or TornPDA, save and enable it, then reload [Torn's Events Calendar](https://www.torn.com/calendar.php). In TornPDA, use end-of-page injection.

On GitHub, open the script's **Raw** view to copy its source. To update, replace your existing installed copy rather than enabling a duplicate.

Hover or tap an event as usual. Its original Torn times remain visible, followed by a **Your local time** block. The timezone comes from your browser/device and daylight saving is calculated separately for each event date.

The script converts the actual timestamps in the event popup, including any personal event start slot already applied by Torn. It makes no requests and stores no data.

See the [guide](GUIDE.md) for supported formats and troubleshooting.

**Verification:** Date-conversion and synthetic popup checks pass. Live Torn and TornPDA verification is pending; see the guide's daylight-saving caveat.

## License

Copyright (C) 2026 DarrylPhilbin. [GNU GPL version 3](../LICENSE) (GPL-3.0-only).

[Back to all scripts](../README.md)
