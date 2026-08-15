---
permalink: /walk-forward-analysis/
title: "Walk-Forward Analysis"
---

> The biggest update OptiPie has seen so far. **Backtests, stronger than ever with Walk-Forward Analysis.**

Walk-Forward Analysis is here. It takes optimization one step further: instead of trusting a backtest that scored itself on data it already knew, it forces your parameters to prove themselves on price they have never seen.

## What is Walk-Forward Analysis?

> Optimization that has to prove itself on data it has never seen.

Classic optimization runs a **grid-search**: it sweeps every parameter combination across your entire chart and keeps the best performer. The catch is built in. That "winner" was chosen because it fit the exact price history you tested it on. It is the top score on an exam the strategy already had the answer key to. Impressive in hindsight, and silent about what comes next.

Walk-Forward Analysis works differently. Instead of one pass over everything, it moves through your history in rolling windows:

- **In-sample.** It optimizes your parameters over a slice of history, exactly like a normal run.
- **Out-of-sample.** It then locks those winning parameters and tests them on the *next* slice of data, which the optimization never touched.
- **Roll forward.** The window slides ahead and the whole process repeats, window after window.

Every out-of-sample result is earned on unseen data. It is the closest thing to forward-testing without waiting months for it. That single change flips what the numbers mean: a grid-search tells you what *would have* worked, while walk-forward tells you what **kept** working once the market moved on.

**Walk-Forward Efficiency (WFE)** brings it together into one number: out-of-sample performance measured against in-sample. A healthy WFE means your edge held up on new data. A weak one means the backtest was fitting noise, and you learned it safely, before risking real capital.

## See It in Action

> A real walk-forward run, from the first window to the last.

Before the numbers, here is how a run is set up. Three settings shape every walk-forward analysis:

- **Date range.** The full span of history the analysis runs across, set by a start and an end date. This is the raw material every window is carved out of.
- **Windows.** Each window is one in-sample plus out-of-sample run. The date range is split into several of them, stepping forward through time, so more windows means smaller slices and more tests.
- **Split.** The in-sample to out-of-sample ratio inside each window. A 70/30 split optimizes on the first 70% of every window and tests on the remaining 30%.

Together they decide how much history each window sees and how often the strategy is put back on trial. The run below covers a multi-year range, divided into 6 windows at a 70/30 split.

<!-- TODO: replace with the chosen THYAO WFA report screenshot -->
![Walk-Forward Analysis report](/images/wfa-thyao-report.png)

*Placeholder: swap in the specific report you want to feature, and we will finalize the run details (date range, windows, split) and write the walkthrough straight off its numbers (in-sample vs out-of-sample, and the resulting WFE).*

---

Ready to put your own strategy to the test? [Open OptiPie](https://optipie.app) and run a walk-forward pass on any optimization.
