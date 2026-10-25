# Calendar local-time guide

The calendar layout, event names, descriptions, and Torn timestamps remain unchanged. Local start and end times are appended inside the existing timestamp container when Torn creates the event popup. No separate calendar or launcher is added.

## Time conversion

Torn timestamps are interpreted as UTC. Local dates and times use the browser's timezone and locale. Both endpoints include a year and timezone abbreviation, so events spanning midnight, year boundaries, or a daylight-saving change can be read unambiguously.

The supported native format is `15:45:00 – 16/03/26 until 15:45:00 – 18/03/26`, with either two- or four-digit years. Invalid dates, reversed ranges, and unfamiliar formats are left alone. The script does not assume a start hour from an event's name or from its day on the calendar.

## Troubleshooting

- Reload the calendar after installing and open an event's details.
- If the timezone is wrong, check your device/browser timezone settings.
- If an event shows no local time, its timestamp format may have changed. Report the timestamp line and popup markup without personal account details.
- Browser extensions that replace the calendar popup can affect compatibility.

The timestamp format was inspected on Torn's desktop calendar. Six local date-conversion tests and seven synthetic browser popup checks pass. Actual installed-script desktop and TornPDA behavior still require verification. The preview browser reported a different Winnipeg daylight-saving offset from Node for November 1, 2026; check that boundary on your target browser before relying on it. Conversion uses the timezone data supplied by the browser.

No API keys, storage, external libraries, network calls, notifications, or gameplay actions are used.
