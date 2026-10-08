# Sampling methodology for ranked model evaluations

## Current rerun: eight configurations, eight reviewers

The September 2026 rerun plans three separate datasets: cross-source synthesis, Frames, and finance.
At preparation, synthesis and Frames were authorized; finance was on hold pending Snowflake access.
Consult the private run plan for current authorization, not this methodology document.
The sections below this update retain the historical 11-configuration design. For the rerun, use:

- Four model families, two distinct efforts each, ordered as adjacent candidate pairs.
- 40 distinct triplets per dataset, two disjoint triplets for each of its 20 questions.
- 15 distinct questions per configuration; every configuration pair co-occurs four or five times.
- Eight pairs co-occur five times, including all four within-model effort contrasts.
- Eight reviewers, two per thread, ten threads per reviewer per dataset (20 across two datasets,
  or 30 if the third is subsequently authorized).
- All 28 reviewer pairs occur: 16 once and 12 twice. No reviewer sees both threads of one question.
- Collect rankings privately through Google Forms, not Slack replies. Keep unusable-output flags.

The concurrence graph is `4*K8 + C8`. Construct it by removing 16 triangles with concurrence
`2*K8 - C8` from all 56 triples of eight configurations. The continuous upper bound has seven
nonzero Laplacian eigenvalues equal to `240/7`; the integer design has D-efficiency
`0.9993027377457784`. This remains an allocation-quality measure, not a power guarantee.

For reviewer assignments, use `K8` plus the 12 edges of a cube. Every reviewer then has degree ten.
Match disjoint reviewer pairs to question blocks, shuffle with the recorded seed, and optimize
configuration coverage. Keep all three analyses separate and cluster uncertainty by question.

`prepare-experiment.mjs --candidates <json> --reviewers <json>` supports this design. Use
`--source-dataset <jsonl>` to preserve finalized prompts from an earlier run. New model selections
must use current Dust reasoning values, including `xhigh` and `maximal`, and must not inherit the
historical pricing snapshot. Measure actual credits through the Dust API.

## Historical experiment

This document defines how to allocate questions, model configurations, and reviewers for the Frame
and text-output evaluations. The two output types are separate experiments and must be analyzed
separately, even when they use the same design.

The sampling design is independent of evidence mode. In the current text-output experiment, every
configuration receives the same question and independently researches Slack, Notion, and Drive through
the `dust` agent's tools. Retrieved evidence may differ and is part of the evaluated behavior.

The default design below is a fixed, one-batch allocation. It is intended to use a limited human
review budget efficiently while keeping every configuration connected to every other configuration.
It is not, by itself, a statistical power guarantee.

## Terminology and scope

- A **configuration** is one model at one reasoning effort, for example `Fable / low`. It is the unit
  whose relative quality we want to estimate.
- A **question** is one of the 20 underlying tasks in a dataset.
- A **triplet** is three configurations run on the same question and shown in one Slack thread.
- A **ranking** is one reviewer's complete ordering of those three anonymous outputs, for example
  `2 > 1 > 3`.
- A **configuration pair** is two configurations that occur together in a triplet. Pair counts are a
  property of the sampling design, not separate votes.

The 11 configurations are listed below. Human-facing `low` maps to Dust's `light`
`modelSelection.reasoningEffort`; human-facing `high` maps directly to Dust's `high`. Provider-native
reasoning controls may differ, so the run manifest must preserve the exact Dust selection sent for
every output.

1. Fable / low
2. Fable / high
3. Sonnet / high
4. Luna / high
5. Sol / low
6. Sol / high
7. K3 / high
8. v4 Flash / low
9. v4 Flash / high
10. Grok 4.6 / low
11. Grok 4.6 / high

## Statistical model for one ranking

Use the Plackett-Luce model as the design model. Give configuration `i` a positive worth
`w_i = exp(theta_i)`. For a ranking `A > B > C`:

```text
P(A > B > C)
  = w_A / (w_A + w_B + w_C)
  * w_B / (w_B + w_C)
```

The ranking is one joint observation consisting of two sequential choices. It implies descriptive
pairwise outcomes, but those three outcomes are not three independent observations. The fitted model
must therefore use the complete ranking likelihood rather than rank-breaking the result into three
independent rows.

Only relative worth is identifiable. Set one score to zero or constrain the scores to sum to zero.

## Why pair balance is the right design target

At equal starting worths, the expected Fisher information from one fully ranked triplet is:

```text
I_triplet = (7 / 36) * L(K3)
```

`L(K3)` is the graph Laplacian of the triangle joining the triplet's three configurations. The first
choice contributes `(1 / 9) * L(K3)`. Averaged over which configuration is selected first, the second
choice contributes `(1 / 12) * L(K3)`, giving `7 / 36` in total.

Across the complete experiment:

```text
I_design = (7 / 36) * L(G)
```

`G` is the weighted concurrence graph whose vertices are configurations and whose edge weight is the
number of triplets in which that pair co-occurs. Consequently:

- a disconnected graph makes some relative scores unidentifiable;
- weakly connected or highly uneven graphs give noisy contrasts;
- spreading pair co-occurrences evenly makes the information matrix well conditioned.

We use local D-optimality at equal worths to measure allocation quality. It maximizes the product of
the ten non-zero information eigenvalues, equivalently minimizing the joint confidence-ellipsoid
volume for the ten identifiable score contrasts. A-optimality, which minimizes average contrast
variance, and contrast-specific efficiency for the four low-versus-high effort comparisons should be
checked as secondary criteria.

For a design `D`, its D-efficiency is:

```text
Eff_D(D) = (det*(I_D) / det*(I_best))^(1 / 10)
```

`det*` is the product of the non-zero eigenvalues. This is allocation efficiency at a fixed review
count, not statistical power and not the probability that the observed winner is truly best.

## Applied design: 40 triplets per experiment

Run **40 triplet threads for each experiment**. Since every triplet contains three outputs, this is
120 generated outputs per experiment.

Forty triplets contain 120 pair incidences because each triplet contains three pairs. There are
`choose(11, 2) = 55` possible configuration pairs, so perfect fractional balance would give every pair:

```text
120 / 55 = 24 / 11 = 2.1818... co-occurrences
```

The closest integer allocation is:

- 45 pairs occurring twice;
- 10 pairs occurring three times.

Start with pair count two for every pair, then place the ten extra pair incidences on a ten-vertex
cycle. Every vertex on the cycle gains degree two, which corresponds to one additional triplet
appearance. The resulting exposure is therefore as even as the integer constraints allow:

- ten configurations appear in 11 triplets;
- one configuration appears in 10 triplets.

Use this extra-edge cycle so that all four within-model effort contrasts receive a third direct
co-occurrence:

```text
Fable low
  -> Fable high
  -> Sonnet high
  -> Sol low
  -> Sol high
  -> Luna high
  -> v4 Flash low
  -> v4 Flash high
  -> Grok 4.6 low
  -> Grok 4.6 high
  -> Fable low
```

K3 / high is the ten-exposure configuration in this instance. The other experiment may rotate the
ten-exposure position, but the experiments remain separate analyses.

### Efficiency certificate

The ideal fractional concurrence graph has all 55 edge weights equal to `24 / 11`. Its ten non-zero
Laplacian eigenvalues are all 24.

The integer design above has concurrence graph `2 * K11 + C10`. The geometric mean of its ten
non-zero Laplacian eigenvalues is `23.9582607`, so its local D-efficiency is:

```text
23.9582607 / 24 = 0.9982609, or 99.83%
```

This certifies that the 40-triplet allocation is within 0.17% of the continuous upper bound under the
equal-worth Plackett-Luce design model. It does not say that 40 triplets provide the same precision as
a larger experiment.

For comparison, an exact `2-(11, 3, 3)` balanced incomplete block design requires 55 triplets. Every
configuration then appears 15 times and every pair appears three times. It gives more total
information because it contains 37.5% more threads. Under equal noise, reducing 55 threads to 40
widens standard errors by roughly `sqrt(55 / 40) = 1.17`, even though the 40 available threads are
allocated nearly optimally.

## Constructing the exact triplets

Let `x_T` be 1 when the three-configuration set `T` is selected and 0 otherwise. Solve the binary
feasibility problem:

```text
for every pair {i, j}:
  sum(x_T for T containing {i, j})
    = 2 + 1[{i, j} is an edge of the chosen ten-cycle]
```

This selects 40 distinct triplets automatically because the target pair counts sum to 120. Validate
the resulting schedule before generating any outputs:

- exactly 40 distinct triplets;
- each pair occurs two or three times, with the specified ten pairs occurring three times;
- ten configurations occur 11 times and one occurs 10 times;
- the concurrence graph is connected;
- the computed D-efficiency matches the certificate above.

Save the solver seed, selected triplets, pair-count matrix, exposure counts, and efficiency metrics as
part of the private experiment manifest.

`src/prepare-experiment.mjs` performs this construction, pairs disjoint triplets, assigns them to the 20
questions with a recorded seed, and writes the private manifest. `src/build-blind-eval.mjs` uses the
same recorded seed to balance anonymous slot positions.

## Assigning the 20 questions

Each question appears in exactly two threads. Pair the 40 selected triplets so the two triplets
assigned to a question are disjoint. This gives each question six distinct configurations and ensures
that no configuration answers the same question twice.

Formally, make a graph whose vertices are the 40 selected triplets and whose edges join disjoint
triplets. Find a perfect matching, shuffle its 20 matched pairs with a recorded seed, then assign them
to questions 1 through 20.

This choice uses every available question, controls question mix across configurations, and adds
within-question coverage without pretending that two rankings on the same question are independent
task samples. The final analysis must retain the question identifier and account for clustering by
question.

Randomize the anonymous Slack slot order subject to near-balance across configurations and positions.
Store the private slot mapping and random seed. Reviewers must not see configuration identities.

## Assigning five reviewers

The default is two reviewers per thread:

- 40 threads produce 80 complete rankings per experiment;
- each of the five reviewers handles 16 threads;
- each of the ten possible reviewer pairs reviews exactly four threads.

This supplies overlap for agreement measurement without asking every reviewer to rank every output.
With two reviewers, every configuration pair has four or six reviewer-level co-rankings because it
appears in two or three threads. Co-rankings from the same thread share the same question and outputs,
so they are not independent task replications.

If more reviewer-noise measurement is worth the cost, predeclare a random calibration subset for a
third review. Do not request third reviews only after seeing disagreement unless that adaptive rule is
recorded and handled in the analysis. Three reviewers on every thread would produce 120 rankings and
24 rankings per reviewer.

## Analysis and interpretation

Fit the complete rankings directly. Report at least:

- relative configuration scores and uncertainty;
- model-implied pairwise win probabilities;
- uncertainty for the four within-model effort contrasts;
- probability of being best or rank distribution, with the method stated;
- first-place count, average rank, and pairwise win rate as descriptive summaries only;
- reviewer agreement, for example exact agreement and Kendall rank correlation.

Analyze Frame and text experiments independently. Do not pool them merely because they use the same
configurations or sampling design.

Use question-aware uncertainty, such as a question-clustered bootstrap or a hierarchical ranking
model that includes question and reviewer variation. Do not count the three implied pairwise outcomes
from one ranking, or two reviewers judging the same generated outputs, as fully independent task
observations.

## What remains empirical

The design makes efficient use of a chosen 40-thread budget. Whether that budget is large enough
depends on quantities that combinatorial balance cannot determine:

- the smallest quality difference worth acting on;
- reviewer inconsistency;
- question-by-configuration variation;
- generation failures and missing reviews.

Express the decision-relevant difference as a pairwise win probability or score contrast. Detecting a
55/45 advantage requires substantially more evidence than detecting a 70/30 advantage. After a pilot,
estimate the noise and simulate the full planned analysis at several effect sizes. Report probability
of selecting the true best configuration, expected confidence-interval width, or expected ranking
error per human review minute.

If those simulations show inadequate precision, add review budget uniformly or through a
predeclared optimal-design update. Do not add questions or triplets selectively because early results
look surprising.

## References

- R. L. Plackett, [The Analysis of Permutations](https://rss.onlinelibrary.wiley.com/doi/10.2307/2346567),
  1975.
- J. Kiefer, [Optimum Experimental Designs](https://academic.oup.com/jrsssb/article/21/2/272/7027985),
  1959.
- F. Rottger, T. Kahle, and R. Schwabe,
  [Optimal Designs for Discrete Choice Models Via Graph Laplacians](https://pmc.ncbi.nlm.nih.gov/articles/PMC12274245/),
  2025.
- R. C. Bose,
  [On the Construction of Balanced Incomplete Block Designs](https://onlinelibrary.wiley.com/doi/10.1111/j.1469-1809.1939.tb02219.x),
  1939.
