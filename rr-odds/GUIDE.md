# RR Odds guide

## Reading the display

For one bullet among **n** remaining chambers, the next-shot hit probability is **1/n**. Taking **k** consecutive shots has hit probability **k/n** and safe probability **(n−k)/n**, assuming the chamber is not respun between those shots.

For example, with four chambers remaining:

| Shots | Hit | Safe |
| --- | --- | --- |
| Single | 25% | 75% |
| Double | 50% | 50% |
| Triple | 75% | 25% |

These are risks for the selected shots, not your chance of winning the entire match. The display does not recommend a bet or a shooting strategy.

## Detection

The helper reads the visible `react-root` game area. During observation, Torn displayed “Your odds of getting the bullet: 1 in 3!” and the SHOOT/X2 controls. The helper reads that denominator directly. The observed first-go message establishes six chambers before any shot. It does not count clicks or guess from animations.

Odds appear only with an available SHOOT control and a recognized prompt. Double/triple rows also require their available controls. Unknown prompts, opponent turns, and game-over states clear the previous percentages. Refreshing midway through a game works when Torn restores its odds prompt; otherwise the helper waits for the next recognized prompt.

The script makes no network requests and does not access private game state. It does not read the page while hidden. No settings or player information are stored.

## Compatibility and verification

Use the same file in desktop Tampermonkey or Torn PDA with END injection. The layout wraps on narrow screens and uses ordinary browser APIs without GM storage or Web Locks.

Live observation confirmed the first-go, explicit-odds, and BANG messages. Automated checks cover calculations and simulated game transitions. Full live installation and physical PDA testing are still needed. If Torn changes the wording, the script shows a waiting message instead of estimating the missing state.

Rules reference: [Torn's Russian Roulette wiki](https://wiki.torn.com/wiki/Russian_Roulette).
