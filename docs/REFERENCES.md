# References

Accessed on 2026-11-20 unless noted. All facts labeled [VERIFIED] in other documents trace to
R1-R4. Design decisions are not supported by these sources unless stated.

## Primary (official)

**R0. Official hackathon case brief: "FinTech: RL environments for fine-tuning financial audit models"**
- Organization: hackathon organizers (case 1, FinTech track, 19-22 November 2026).
- URL: provided to the team directly (no public URL recorded).
- Supports: all [OFFICIAL CASE] items: file formats, actions, limits, error types, interacting
  scenarios, clean cases, matcher rules, reward formula, closed checks, deliverables, and scoring criteria.

**R1. METRO Annual Report 2023/24 - Combined management report - Principles of the group - Business model**
- Organization: METRO AG.
- URL: https://reports.metroag.de/annual-report/2023-2024/combined-management-report/principles-of-the-group/business-model.html
- Date: financial year 2023/24 (store network as of 30/9/2024).
- Supports: F1-F8 in CASE_OVERVIEW: international food wholesaler in 33 countries; holding
  structure; multichannel model with stores (about 74% sales share), delivery (FSD), and digital;
  HoReCa and Traders as core customers and their definitions; food/non-food assortment;
  FSD definition; 6 stores in Kazakhstan.

**R2. METRO Annual Report 2023/24 - Goals and strategy**
- Organization: METRO AG.
- URL: https://reports.metroag.de/annual-report/2023-2024/goals-and-strategy.html
- Supports: F12 (sCore strategy, FSD share >33% and digital share 40% by 2030; focus on HoReCa and Traders).
  Used only as context for why delivery is a core channel.

**R3. METRO Annual Report 2023/24 - Notes - Income statement (recognition of income and expenses)**
- Organization: METRO AG.
- URL: https://reports.metroag.de/annual-report/2023-2024/notes/notes-to-the-group-accounting-principles-and-methods/income-statement.html
- Supports: F9-F10: revenue recognised under IFRS 15 at transfer of control; cash or short-credit
  payment terms; returns and rebates exist. Informs our cutoff rule (period by transfer of control)
  and payment-term assumptions.

**R4. METRO Annual Report 2023/24 - Notes - Currency translation**
- Organization: METRO AG.
- URL: https://reports.metroag.de/annual-report/2023-2024/notes/notes-to-the-group-accounting-principles-and-methods/currency-translation.html
- Supports: F11: FX gains and losses on foreign currency transactions are in principle recognised
  in profit or loss. Informs the `FX Gain/Loss` account and the "realised FX difference is not an error" distractor.

**R5. METRO AG - About us**
- Organization: METRO AG.
- URL: https://www.metroag.de/about-us
- Status: **not accessible during research** (HTTP 403, bot protection). No facts taken from it.
  It should be checked manually in a browser if the team wants to cite it.

## Technical (named in the case brief)

**R6. Gymnasium Env API**
- Organization: Farama Foundation.
- URL: https://gymnasium.farama.org/api/env/
- Supports: shape of `reset -> (observation, info)` and `step -> (observation, reward, terminated, truncated, info)`.
  Not fetched during this stage; the shape is taken from the brief.

**R7. Specification gaming: the flip side of AI ingenuity**
- Organization: Google DeepMind (blog, 2020).
- URL: https://deepmind.google/blog/specification-gaming-the-flip-side-of-ai-ingenuity/
- Supports: motivation for attack tests (flag-everything, duplicates, text-based gaming) in
  BOUNDARIES section 9. Not fetched during this stage.

## Not used

No source supports METRO's internal accounting, systems, transactions, or customers. NorthAngels
is entirely fictional, and its accounting design is our assumption.
