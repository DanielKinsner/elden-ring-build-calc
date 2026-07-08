# Elden Ring Build Calculator

A real-time build & weapon calculator for Elden Ring. Enter your stats and gear, watch your
Attack Rating update live, and compare weapons head-to-head **by the actual numbers**.

Built for players who want to *see* what a stat point is actually worth — where their soft caps
are, which weapon wins on their build, and how bleed/status buildup scales.

## Goals

- **Live AR** — full damage breakdown (physical / magic / fire / lightning / holy) as you move sliders.
- **All 8 stats** — Vigor, Mind, Endurance, Strength, Dexterity, Intelligence, Faith, Arcane.
- **Weapon + affinity + upgrade level** selectors, two-hand toggle.
- **Status buildup** — bleed, frost, poison, scarlet rot, sleep, madness.
- **Compare mode** — multiple weapons side by side, ranked by the numbers.
- **Soft-cap analysis** — "your next point of Dex is worth +X AR."
- **Presets** — including the **"Vera Aletheia"** samurai/bleed build. 🖤

## Accuracy & honesty

This calculator uses the **documented Elden Ring damage model** — the real formula
(`base + Σ scaling bonus`), the published grade→scaling-value thresholds, the CalcCorrectGraph
saturation curves anchored to confirmed data points, and per-path reinforcement multipliers.

Where a value is **modeled/interpolated** rather than a confirmed game-param dump, it's labeled
as such — in the docs and in the UI. AR is dead-on for **comparison and stat-effect**; absolute
values may differ from in-game by a few points due to calc-correct nuance. We don't fake precision
we don't have.

**Base game (vanilla) and Shadow of the Erdtree (DLC) math are kept in separate reference files**
so DLC-only systems (Scadutree Blessing, new weapons) never contaminate vanilla numbers.

## Structure

```
docs/         research + reference (the math, with sources)
data/         structured weapon / scaling datasets
src/          calculator engine + UI  (vanilla HTML/CSS/JS, no build step)
```

## Status

🚧 In active development. Research and reference docs first, then the full weapon dataset,
then the engine + UI on real numbers.

---

*Sources for all math live in `docs/`. Built with 🖤.*
