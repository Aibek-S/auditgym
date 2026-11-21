# Where each jury criterion is checked

Every line points to code or a test that runs inside `python -m auditgym check`.

## Contract and isolation (25)

| Requirement from the brief | Where |
|---|---|
| `reset(seed, config) -> (observation, info)`; first observation = task, manifest, policy, budget | `auditgym/env.py` `reset`; `tests/test_env.py::test_reset_shape` |
| `step(action) -> (obs, reward, terminated, truncated, info)`, JSON-compatible | `tests/test_env.py::test_step_shape_and_every_step_costs_one` |
| Five actions only, page <= 50, stable cursors | `test_pagination_limit_and_stable_cursor`, `test_cursor_tampering_and_cross_table` |
| Calculator: arithmetic and decimals only, no code | `auditgym/calculator.py`; `test_calculator_is_decimal_and_safe` |
| Unknown id or action: bounded error, costs a step | `test_error_codes` (9 cases) |
| Observation = requested records + result/error + steps left; no shell/SQL/files/internet | `env.py` (no such actions exist); `test_error_codes` path cases |
| 100 steps incl. submit; truncation -> empty answer | `test_step_limit_truncates_with_empty_findings`, `test_submit_on_step_100_is_allowed` |
| Time limit -> truncated | `test_time_limit_truncates`, `tests/test_baselines.py::test_hung_or_broken_agent_cannot_block_the_runner` |
| submit -> terminated; no re-scoring after the end | `test_submit_terminates_open_mode_reward`, `test_after_end_episode_over_no_charge` |
| Exploration reward 0; closed mode keeps reward at the evaluator | `test_closed_mode_hides_reward`, `test_closed_mode_trajectory_hides_reward` |
| Limits: 30 findings, 10 evidence ids, 1,000 chars | `test_submission_limits` |
| Malformed submission -> -1, logged by the evaluator | `test_malformed_submission_is_minus_one`, `tests/test_matcher.py::test_malformed` |
| Evaluator outside the agent process; no truth in observations, paths, errors | `auditgym/runner.py` (subprocess + JSON lines); `test_no_truth_or_paths_in_observations`, `test_trajectories_do_not_leak_truth`, `tests/test_errors.py::test_no_truth_leaks_into_public` |
| Reset isolates state | `test_reset_isolates_state` |

## Data and ground truth (25)

| Requirement | Where |
|---|---|
| Accounting equalities before injection | `check` step 2 (clean twin of each episode); `tests/test_generator.py::test_all_invariants_pass` (50 seeds) |
| Declared discrepancy after injection, nothing else | `auditgym/invariants.py::verify_episode`; `tests/test_errors.py::test_mixed_episodes_verify_and_cover_everything` |
| Evidence independently sufficient | `invariants.evidence_amount`; `test_wrong_evidence_does_not_prove` |
| Four independently configurable types, two interacting scenarios | `auditgym/errors.py`; `test_forced_plan_is_placed_and_verified`, `test_interacting_issues_share_records` |
| Clean companies and plausible correct distractors | `tests/test_generator.py::test_distractors_present_in_every_episode`; `test_distractors_survive_injection` |
| Variation of names, ids, order, amounts, currencies, timezones | `test_different_seeds_differ`, `test_currencies_and_offsets_vary`, `test_no_shortcut_features` |
| Integer minor units, decimal rates, ISO-8601 with offset, explicit null | `tests/test_fixtures.py` format tests |

## Reward robustness (25)

| Requirement | Where |
|---|---|
| Full correct answer > silence on books with errors | `tests/test_matcher.py::test_perfect_answer`, `test_silence_on_errors_and_on_clean` |
| Silence > false accusations on clean books | `test_false_finding_on_clean`, `tests/test_baselines.py::test_flag_all_loses_to_silence_on_clean` |
| Duplicates give no gain | `test_repeated_finding_is_fp` |
| Flagging everything scores badly | `test_flag_everything_is_bad`; `check` baseline sanity |
| Step cost only slightly separates equal answers | `test_step_cost_only_slightly_separates_equal_answers` |
| Guessed ids, unsupported evidence, wrong currency or amount | `test_wrong_fields_do_not_match`, `test_correct_ids_without_evidence`, `test_partial_evidence_does_not_match` |
| Resubmission, malformed input, timeout | `test_after_end_episode_over_no_charge`, `test_malformed`, `test_time_limit_truncates` |
| Explanation text does not matter | `test_explanation_never_matters` |
| Published normalization, tolerance, tie-breaking | `auditgym/matcher.py` module docstring; `test_normalization`, `test_matching_is_order_independent_and_maximal` |

## Reproducibility and generalization (15)

| Requirement | Where |
|---|---|
| Same seed + config + actions -> same records, transitions, rewards | `check` step 1 (byte comparison of 20 episodes); `test_same_seed_same_errors`, `test_generated_episode_and_determinism`, `test_trajectory_format_and_replay` |
| Permuted order and new ids keep the oracle answer and reward | `test_paired_transform_keeps_truth_up_to_ids`, `tests/test_baselines.py::test_paired_transform_keeps_oracle_reward` |

## Engineering and explanation (10)

| Criterion | Where |
|---|---|
| One-command run | `Dockerfile`, `python -m auditgym check` |
| Config versions | `configs/default.json` (`config_version`), versions printed in `results/check.log` |
| Trajectory logs | `results/trajectories.jsonl` (+ per policy) |
| Measured failure analysis | `docs/DESIGN_NOTE.md` section 6 |
| Honest limitations | `README.md` Limitations, `docs/DESIGN_NOTE.md` section 7 |
