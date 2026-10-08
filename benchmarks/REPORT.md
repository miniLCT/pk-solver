# Reproducible benchmark results

Reference: [goldfire/pokersolver](https://github.com/goldfire/pokersolver), pinned npm version 2.1.4 (MIT).
Run: `npm ci --ignore-scripts && npm run benchmark`. Seed: 20261008. Environment: darwin/arm64, v20.20.1, Apple M4 Pro.

## Independent evaluator comparison

- 25,000 random seven-card hands: **0 category mismatches**.
- 5,000 legal shared-board deals, 2–8 players: **0 winner/tie mismatches**.
- Evaluating the same 25,000 hands: local 24.2 ms; reference 316.5 ms. This is one local run, not a stable throughput guarantee; the reference returns richer hand objects.

## Exact river equity against the independent evaluator

Every scenario enumerates all 990 legal opponent hands.

| Hero | Board | Local equity | Reference equity | Error (percentage points) |
|---|---|---:|---:|---:|
| As Ks | Qs Js Ts 2h 3h | 100.000000% | 100.000000% | 0.00000000 |
| Ah Ad | Kh Qh Jh Th 2s | 100.000000% | 100.000000% | 0.00000000 |
| 2h 3h | As Ks Qs Js Ts | 50.000000% | 50.000000% | 0.00000000 |
| 8s 9d | 7c 8d 9c Ts Jh | 41.414141% | 41.414141% | 0.00000000 |

## Action-rollout numerical accuracy

Four river scenarios, all legal root actions × three continuation policies. 30,000 Monte Carlo samples per action/policy. Reference is exhaustive integration of all legal opponent combinations and all response branches under the **same declared heuristic model**. It is not an independent opponent model or GTO benchmark. Runtime: 3.41 s.

| Hero | Action | Continuation | Exact EV (BB) | Sampled EV (BB) | Approx. 95% ± (BB) | Absolute error (BB) |
|---|---|---|---:|---:|---:|---:|
| As Kh | 弃牌 | cautious | 0.0000 | 0.0000 | 0.0000 | 0.0000 |
| As Kh | 弃牌 | value | 0.0000 | 0.0000 | 0.0000 | 0.0000 |
| As Kh | 弃牌 | pressure | 0.0000 | 0.0000 | 0.0000 | 0.0000 |
| As Kh | 跟注 5.0 BB | cautious | 14.1818 | 14.1733 | 0.0437 | 0.0085 |
| As Kh | 跟注 5.0 BB | value | 14.1818 | 14.1733 | 0.0437 | 0.0085 |
| As Kh | 跟注 5.0 BB | pressure | 14.1818 | 14.1733 | 0.0437 | 0.0085 |
| As Kh | 加注 11.6 BB | cautious | 17.9649 | 17.9680 | 0.0754 | 0.0030 |
| As Kh | 加注 11.6 BB | value | 17.9649 | 17.9680 | 0.0754 | 0.0030 |
| As Kh | 加注 11.6 BB | pressure | 17.9649 | 17.9680 | 0.0754 | 0.0030 |
| As Kh | 加注 全下 20.0 BB | cautious | 20.7413 | 20.7292 | 0.1232 | 0.0122 |
| As Kh | 加注 全下 20.0 BB | value | 20.7413 | 20.7292 | 0.1232 | 0.0122 |
| As Kh | 加注 全下 20.0 BB | pressure | 20.7413 | 20.7292 | 0.1232 | 0.0122 |
| Ah Ad | 弃牌 | cautious | 0.0000 | 0.0000 | 0.0000 | 0.0000 |
| Ah Ad | 弃牌 | value | 0.0000 | 0.0000 | 0.0000 | 0.0000 |
| Ah Ad | 弃牌 | pressure | 0.0000 | 0.0000 | 0.0000 | 0.0000 |
| Ah Ad | 跟注 5.0 BB | cautious | 15.0000 | 15.0000 | 0.0000 | 0.0000 |
| Ah Ad | 跟注 5.0 BB | value | 15.0000 | 15.0000 | 0.0000 | 0.0000 |
| Ah Ad | 跟注 5.0 BB | pressure | 15.0000 | 15.0000 | 0.0000 | 0.0000 |
| Ah Ad | 加注 11.6 BB | cautious | 20.5305 | 20.5282 | 0.0275 | 0.0023 |
| Ah Ad | 加注 11.6 BB | value | 20.5305 | 20.5282 | 0.0275 | 0.0023 |
| Ah Ad | 加注 11.6 BB | pressure | 20.5305 | 20.5282 | 0.0275 | 0.0023 |
| Ah Ad | 加注 全下 20.0 BB | cautious | 26.4854 | 26.5465 | 0.0715 | 0.0611 |
| Ah Ad | 加注 全下 20.0 BB | value | 26.4854 | 26.5465 | 0.0715 | 0.0611 |
| Ah Ad | 加注 全下 20.0 BB | pressure | 26.4854 | 26.5465 | 0.0715 | 0.0611 |
| 8s 8d | 过牌 | cautious | 9.2616 | 9.2953 | 0.0889 | 0.0337 |
| 8s 8d | 过牌 | value | 9.7016 | 9.7549 | 0.1032 | 0.0534 |
| 8s 8d | 过牌 | pressure | 10.2026 | 10.2393 | 0.1252 | 0.0367 |
| 8s 8d | 下注 5.0 BB | cautious | 10.8986 | 10.9459 | 0.1198 | 0.0473 |
| 8s 8d | 下注 5.0 BB | value | 11.1158 | 11.1637 | 0.1262 | 0.0479 |
| 8s 8d | 下注 5.0 BB | pressure | 11.1158 | 11.1637 | 0.1262 | 0.0479 |
| 8s 8d | 下注 11.3 BB | cautious | 11.1895 | 11.1901 | 0.1598 | 0.0006 |
| 8s 8d | 下注 11.3 BB | value | 11.1895 | 11.1901 | 0.1598 | 0.0006 |
| 8s 8d | 下注 11.3 BB | pressure | 11.1895 | 11.1901 | 0.1598 | 0.0006 |
| 8s 8d | 下注 15.0 BB | cautious | 11.0969 | 11.1206 | 0.1757 | 0.0237 |
| 8s 8d | 下注 15.0 BB | value | 11.0969 | 11.1206 | 0.1757 | 0.0237 |
| 8s 8d | 下注 15.0 BB | pressure | 11.0969 | 11.1206 | 0.1757 | 0.0237 |
| 8s 8d | 下注 全下 20.0 BB | cautious | 10.9201 | 10.9514 | 0.1958 | 0.0313 |
| 8s 8d | 下注 全下 20.0 BB | value | 10.9201 | 10.9514 | 0.1958 | 0.0313 |
| 8s 8d | 下注 全下 20.0 BB | pressure | 10.9201 | 10.9514 | 0.1958 | 0.0313 |
| Kc Qd | 过牌 | cautious | 13.1451 | 13.1376 | 0.0834 | 0.0075 |
| Kc Qd | 过牌 | value | 14.8089 | 14.7860 | 0.0964 | 0.0229 |
| Kc Qd | 过牌 | pressure | 15.6900 | 15.6367 | 0.1282 | 0.0533 |
| Kc Qd | 下注 5.0 BB | cautious | 15.6905 | 15.6474 | 0.0928 | 0.0432 |
| Kc Qd | 下注 5.0 BB | value | 15.6905 | 15.6474 | 0.0928 | 0.0432 |
| Kc Qd | 下注 5.0 BB | pressure | 15.6905 | 15.6474 | 0.0928 | 0.0432 |
| Kc Qd | 下注 11.3 BB | cautious | 16.7210 | 16.6840 | 0.1237 | 0.0370 |
| Kc Qd | 下注 11.3 BB | value | 16.7210 | 16.6840 | 0.1237 | 0.0370 |
| Kc Qd | 下注 11.3 BB | pressure | 16.7210 | 16.6840 | 0.1237 | 0.0370 |
| Kc Qd | 下注 15.0 BB | cautious | 17.0185 | 16.9660 | 0.1395 | 0.0525 |
| Kc Qd | 下注 15.0 BB | value | 17.0185 | 16.9660 | 0.1395 | 0.0525 |
| Kc Qd | 下注 15.0 BB | pressure | 17.0185 | 16.9660 | 0.1395 | 0.0525 |
| Kc Qd | 下注 全下 20.0 BB | cautious | 17.3112 | 17.2659 | 0.1602 | 0.0452 |
| Kc Qd | 下注 全下 20.0 BB | value | 17.3112 | 17.2659 | 0.1602 | 0.0452 |
| Kc Qd | 下注 全下 20.0 BB | pressure | 17.3112 | 17.2659 | 0.1602 | 0.0452 |

## Strategy selection versus a passive baseline

Both use the value-priority continuation policy. Baseline root action is check/call; alternative is selected from Monte Carlo estimates, then both are evaluated by exact integration. Gains apply only against the same heuristic opponent. They are not measured against human players or an equilibrium opponent.

| Hero | Passive root | Exact baseline EV | Selected root | Exact selected EV | Difference (BB) |
|---|---|---:|---|---:|---:|
| As Kh | 跟注 5.0 BB | 14.1818 | 加注 全下 20.0 BB | 20.7413 | 6.5595 |
| Ah Ad | 跟注 5.0 BB | 15.0000 | 加注 全下 20.0 BB | 26.4854 | 11.4854 |
| 8s 8d | 过牌 | 9.7016 | 下注 11.3 BB | 11.1895 | 1.4879 |
| Kc Qd | 过牌 | 14.8089 | 下注 全下 20.0 BB | 17.3112 | 2.5022 |

## Interpretation and remaining strategy benchmarks

Zero disagreements in these fixtures support evaluator correctness; they are not an exhaustive proof over all seven-card deals. Exact EV comparison checks rollout sampling and chip accounting under the declared model. Sampling intervals do not capture opponent-model misspecification. These results do not establish real-money profitability or proximity to equilibrium.

For a future CFR module, use [OpenSpiel](https://github.com/google-deepmind/open_spiel) for Kuhn/Leduc game values, exploitability and convergence, and [Desktop Postflop](https://github.com/b-inary/desktop-postflop) / [postflop-solver](https://github.com/b-inary/postflop-solver) for matched heads-up Hold’em ranges, pots, stacks, bet trees and rake. Desktop Postflop notes that open-source development was suspended in October 2023. No CFR/GTO comparison has been run in this version.
