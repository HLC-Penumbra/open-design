# GitHub automation guide

This directory holds the **release-channel** GitHub Actions workflows for the local-first fork. The merge gate itself runs in Woodpecker (see `.woodpecker.yml`); GitHub Actions does not gate PRs or merges on this fork.

## What stays under `.github/`

`.github/workflows/` contains the dormant release pipeline. All ten workflows here are `workflow_dispatch` or `workflow_call` only — none trigger on `pull_request` — and most additionally hard-gate on `github.repository == 'nexu-io/open-design'`, so they cannot fire on the fork without a custom runner pool and the upstream event source. They stay in tree as the shape of an eventual real release flow:

- `release-prerelease.yml`, `release-prerelease-card.yml`, `release-prerelease-smoke.yml`, `release-prerelease-tests.yml` — the prerelease build / publish / notifier chain.
- `release-stable.yml`, `release-beta.yml` — stable promotion and the daily beta channel.
- `release-gate.yml`, `release-exact.yml`, `finalize-release.yml` — promotion gates and exact-ref rebuilds.
- `main-prerelease-win-smoke.yml` — Windows prerelease smoke before the Tuesday release cut.
- `ui-extended-main.yml` — `workflow_call` target for `release-prerelease-tests.yml`'s extended UI suite.

`.github/scripts/release/` is the implementation behind those workflows (macOS / Windows packaging, beta publish, prerelease dispatch validation). Edit it only when changing release behavior.

`.github/scripts/convergence.py`, `.github/scripts/pack.py`, `.github/scripts/release.py`, `.github/scripts/runners.py`, and `.github/config/convergence-exact.json` are used by `release-exact.yml` and `ui-extended-main.yml`. Do not delete without checking those callers.

`.github/actions/{configure-ci-parallelism,setup-workspace,setup-playwright}` are reusable composite actions consumed by `ui-extended-main.yml`. Do not delete without checking that caller.

## What is gone

The previous GitHub-side merge gate and its follow-on chain have been removed because Woodpecker now owns every PR/Merge required check:

- `.github/workflows/ci.yml` and the six `*.atom.yml` capability workflows (`autofix`, `comment`, `report`, `convergence`, `convergence-exact`, `rerun`). The atom chain ran on `workflow_run: workflows: [ci]`, so it became orphaned when `ci.yml` was deleted.
- All upstream-only workflows (backport, bake-plugin-previews-*, catalog-*, contributor-*, cut-*, discord-*, dsh-*, e2e-coverage-reminder, fork-pr-workflow-approval, metrics, notify-*, pr-author-inactivity, refresh-*, release-branch-direct-pr-guard, stale-issues, visual-baseline, whats-new-publish). These were either hard-gated to `nexu-io/open-design` or only meaningful alongside the deleted ci.yml + atom chain.
- The CI control plane under `.github/scripts/` and `.github/config/`: `handoff.py`, `scopes.py`, `postinstall.py`, `rerun_infra_cancel.py`, `workspace.py`, `publish_whats_new.py`, `r2.ts`, the agent-pr-explore shell helpers, `lib/{r2,github,http,feishu}`, the `bake-previews` action, and `convergence.json` / `scopes.json` / `runners.json` / `postinstall.json`.

## Adding or changing GitHub-side workflows here

- Keep changes scoped to the release channel. PR-time validation belongs in `.woodpecker.yml`, not here.
- If a workflow needs to gate a PR or merge, stop and decide whether the check belongs in Woodpecker instead. Adding it here re-creates the duplication the fork removed.
- Run `actionlint -color` and `pnpm guard` before handing off.

## Branch protection

Required checks for `main` (and any pattern-protected branches) live in GitHub → Settings → Branches. Every check in `.woodpecker.yml` Tier 1 and Tier 2 should be marked required; the GitHub Actions check names listed in the branch-protection picker are only the dormant release workflows above and should be left as advisory.
