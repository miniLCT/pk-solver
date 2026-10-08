# RIVER implementation plan

## Scope and algorithm choices

The application is a local Chinese-language study GUI for Texas Hold'em. The user normally supplies only their own hole cards, the public board, and observable opponent actions. Unknown opponent cards are represented by ranges, never treated as observable information.

1. **Showdown equity**: enumerate all legal deals when there are at most 150,000 outcomes; otherwise use uniform Monte Carlo sampling. Compare the best five of seven cards. Split tied pots by the number of tied winners.
2. **Action analysis, first version**: sample opponent ranges conditioned on user-entered observable actions, and run action-tree rollouts against explicit heuristic opponent policies. Compare incremental EV in big blinds and display sampled action paths. This is a model-based best-response study tool, not a GTO solution. It needs no offline training.
3. **Optional future GTO module**: a separately labeled, heads-up CFR implementation with both players' ranges, a finite betting tree, iteration controls, and convergence/exploitability checks. Expanding to full preflop/multiway no-limit games is outside the first version. No claim of equilibrium without convergence evidence.

## Milestones

- [x] M1: local server, card-selection GUI, multiway showdown engine, exact and Monte Carlo modes, correctness tests.
- [x] M2: heads-up action-analysis GUI; pot, effective stack, position, outstanding bet, opponent profile/range, and structured observed action history.
- [x] M3: range filtering, action likelihood updates, legal betting tree, stochastic opponent actions, alternative hero continuation policies, EV uncertainty and route summaries.
- [ ] M4: browser QA, reproducible validation, README with assumptions, staged Git commits.

## Action model contract

- Begin with heads-up action analysis; multiway remains supported for raw showdown equity. This avoids pretending that side pots and multiple action orders are modeled.
- Pot includes all chips already invested, including an outstanding opponent bet. Stack is each player's available effective budget at the current decision; a facing bet reduces the opponent's remaining budget by that bet.
- EV is incremental chip return measured from the current decision; folding has EV 0. Prior invested chips are sunk.
- Opponent policy uses only their own cards, current public board, pot odds, and a declared strength heuristic. It cannot inspect hero cards or future public cards. Sampled hidden hands are displayed only as aggregated ranges, not recommended guesses.
- Record history as street, public board at that street, action, and size. Apply action likelihoods to each legal hole-card combination. Explicitly document heuristic preset ranges and likelihoods.
- Cap action trees to one raise per street and fixed bet scales; expose this abstraction. Use explicit hero continuation policies rather than hidden-card-perfect optimization.
- Include fold/call/check legality, stack limits, minimum raise rules, all-in runouts, card blockers, ties, deterministic random seeds, and honest uncertainty.

## Validation

- Known hand-ranking edge cases and randomized seven-card evaluation against five-card subset enumeration.
- Exact outcome counts, split-pot conservation, deterministic Monte Carlo benchmarks.
- Range parsing/blockers and action-based posterior updates.
- Zero-cost checks, call EV and fold EV, bet/raise cost accounting, all-in caps, no hidden-card or future-card access in policy decisions.
- GUI card picking, duplicate prevention, board-count validation, worker cancellation, responsive layout, and end-to-end action analysis.

## References

- [PokerStars: Hold'em rules](https://www.pokerstars.com/poker/games/texas-holdem/)
- [PokerNews: equity tools](https://www.pokernews.com/poker-tools/)
- [Zinkevich et al., 2007: Counterfactual Regret Minimization](https://proceedings.neurips.cc/paper/2007/file/08d98638c6fcd194a4b1e6992063e944-Paper.pdf)
- [PioSOLVER: solver inputs and resource requirements](https://piosolver.com/docs/technical_details/)
- [PioSOLVER: range updates from action frequencies](https://piosolver.com/docs/faq/gto_concept/)

## Benchmark requirement

Compare the hand evaluator against the open-source `goldfire/pokersolver` implementation on deterministic random seven-card deals and winner selection. Keep it as a development-only reference dependency. For action EV, compare Monte Carlo rollouts against exact river integration over every legal opponent combination and response branch. Report time, mismatch count, absolute EV error, and sampling intervals. This validates numerical correctness, not GTO strength or real-world profitability. Future CFR baselines: OpenSpiel's small poker games and desktop-postflop's constrained heads-up postflop solves.
