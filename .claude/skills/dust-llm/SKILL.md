---
name: dust-llm
description: Step-by-step guide for adding support for a new LLM in Dust, and for deprecating or removing the model it supersedes (including the agent-config repoint migration). Use when adding a new model, updating a previous one, or retiring a decommissioned one.
---

# Adding Support for a New LLM Model

This skill guides you through adding a newly released LLM to the **model_constructors +
llms** stack (the endpoint-class router). It replaces the legacy `lib/api/llm/clients/*`
router, which no longer exists.

Adding a model is usually only half the task: the model it supersedes has to be retired in
the same PR, and a model the provider has switched off needs its agents repointed. See
[Deprecating or removing an old model](#deprecating-or-removing-an-old-model).

## Mental model

A model reaches production through three stacked layers. Add the new model to each:

1. **Model config** (`front/types/assistant/models/*`) — the legacy `ModelConfigurationType`
   describing the model (context, vision, reasoning efforts, pricing tiers). Still the source
   of truth consumed by the UI, pricing, and the dust layer.
2. **`model_constructors`** (`front/lib/model_constructors/*`) — provider-agnostic endpoint
   **classes**, one per `(provider, model, region, provider-api)`. Each class mixes a shared
   provider **base client** with a per-model **config mixin** (input schema, context size,
   token pricing). This is where the real request/response shape and the narrowed input
   config live.
3. **`llms` (dust layer)** (`front/lib/llms/*`) — thin Dust-specific wrappers around the
   `model_constructors` classes that add Dust concerns (display name, `byok`, endpoint
   filters, and any **caps** — e.g. exposing 250k context on a model that natively supports
   1M). Registered into `DUST_STREAM_ENDPOINTS`.

Endpoints are named and filed as:
`{provider}_{model}_{region}_{provider_api}.ts`
e.g. `google_gemini_3_6_flash_global_agent_platform.ts`. The class name is the
PascalCase of the same, with numbers spelled out:
`GoogleGeminiThreeDotSixFlashGlobalAgentPlatformStream`.

> The **fastest, most reliable way to add a model is to copy the most recent model in the
> same family** across all layers and rename. Grep every reference to that model and mirror
> each one. This skill lists the reference points; the sibling model is your template.

## Before you start: verify against official docs (MANDATORY)

You MUST confirm every value below against the provider's official documentation and leave a
URL + date in a code comment next to it. Do not carry values over from memory.

- **Specs** (context window, max output tokens, vision, structured output):
  - OpenAI: `https://platform.openai.com/docs/models`
  - Anthropic: `https://docs.anthropic.com/en/docs/about-claude/models/overview`
  - Google: `https://ai.google.dev/gemini-api/docs/models`
  - Mistral: `https://docs.mistral.ai/getting-started/models/models_overview/`
- **Pricing** (input / output / cached input per 1M tokens):
  - OpenAI: `https://openai.com/api/pricing/`
  - Anthropic: `https://www.anthropic.com/pricing#anthropic-api`
  - Google: `https://ai.google.dev/gemini-api/docs/pricing`
  - Mistral: `https://mistral.ai/technology/#pricing`
- **Host / region availability**: verify which provider APIs and regions actually serve the
  model day-one. Mirror the sibling model's endpoints, but only **register** an endpoint whose
  region is actually available. Keep an unavailable-but-anticipated endpoint class defined and
  unregistered (see Gemini's EU agent-platform example) with a comment saying why.

`WebSearch`/`WebFetch` the docs first. If a value can't be confirmed, surface it — don't guess.

## Reference points to mirror (grep the sibling model)

Pick the newest sibling (e.g. for "Gemini 3.6 Flash" the sibling is "Gemini 3.5 Flash") and
`grep -rln` its id / const / class-name / model-id string. You will touch, roughly:

### A. Model config + central registry

| File | What to add |
|------|-------------|
| `front/types/assistant/models/{provider}.ts` | `X_MODEL_ID` const + `X_MODEL_CONFIG`. **Set `isLatest: false` on the previous model in the same family** and drop "latest" from its description. **Carry over the predecessor's `availableIfOneOf` / `unavailableIfOneOf`** (see below). |
| `front/types/assistant/models/models.ts` | Add id to `STATIC_MODEL_IDS` and config to `SUPPORTED_MODEL_CONFIGS` (imports in both alpha blocks). |
| `front/types/assistant/models/auto.ts` | If the model should participate in `auto`/`auto_fast`/`auto_complex` routing, add a `ModelStreamCandidate`. |
| `front/lib/model_constructors/types/models.ts` | Add `export const X = "model-id"` and include it in the `MODELS` array (this is the `model_constructors` id type). |

### B. Pricing / tiers / reasoning (TYPE-ENFORCED over `StaticModelIdType`)

Adding the id to `STATIC_MODEL_IDS` makes these fail to compile until updated:

| File | What to add |
|------|-------------|
| `front/lib/api/assistant/token_pricing/global.ts` | `CURRENT_MODEL_PRICING` entry (input/output/`cache_read_input_tokens` per 1M) + doc URL comment. |
| `front/types/assistant/models/static_model_reasoning_efforts.ts` | `{ none, minimal, low, medium, high, xhigh, maximal }` support map (`satisfies Record<StaticModelIdType, ReasoningEffortSupport>`). **Must match the config's `supportedReasoningEfforts`** (enforced by `model_tiers.test.ts`). |
| `front/types/assistant/models/model_tiers.ts` | `STATIC_MODEL_TIERS` entry mapping each supported effort → tier name (omit unsupported efforts). |

And one that is **not** compile-forced, so nothing turns red if you skip it:

| File | What to add |
|------|-------------|
| `front/lib/api/assistant/token_pricing/eu.ts` | Add the id to `EU_UPLIFT_MODEL_IDS` **if you register a non-global endpoint that prices above its global sibling.** |

> **EU pricing is a second, silent list.** Any endpoint with `region = EUROPE` bills through
> `inferenceRegion: "eu"` (`inferenceRegionForEndpointRegion` in `front/lib/api/llm/transitionLLM.ts`),
> and `computeTokensCostForUsageInMicroUsd` then looks the model up in `EU_MODEL_PRICING` —
> **falling back to the global rate when it is absent.** `EU_UPLIFT_MODEL_IDS` is
> `satisfies readonly StaticModelIdType[]`, which validates the ids present but does not force
> completeness, so a missing entry undercharges EU traffic forever with nothing failing.
>
> The uplift is per provider and per endpoint, not per model — **compare the two endpoint
> classes' `tokenPricing` rather than assuming.** Regional agent-platform (Vertex) endpoints
> charge 10% over global for both Anthropic and Google, so a new Gemini registered on
> `eu/agent-platform` belongs in the list just as much as a Claude does. OpenAI uplifts only
> the models whose pricing page lists a data-residency premium (gpt-5.4/5.5/5.6/6 yes,
> gpt-5/5.1/5.2 no). Mistral's own models are EU-only with no global sibling, so nothing to
> add for them.
>
> `EU_MODEL_PRICING` derives every field by multiplying the global entry by
> `EU_PRICING_MULTIPLIER`, so it is only correct when the EU endpoint is a flat 1.1× of global.
> A non-uniform regional price needs an explicit entry in `EU_HOST_MODEL_PRICING`, not the
> multiplier — always the case when the EU host differs from the global one (GLM-5.3:
> Fireworks global, Mistral EU).

> **Third-party model on a lab's own host** (e.g. GLM-5.3 on Mistral): set `lab` on the
> endpoint (a host serving several labs leaves it off its base client), map the host's model
> name with `modelToHostModel`, and check `PROVIDER_ID_TO_HOST` in `front/lib/api/llm/index.ts`.
> Routing matches `lab ∈ whitelisted labs OR host ∈ whitelisted hosts`, so an endpoint whose
> lab and host are both unmapped is silently unreachable.

> **Gating is inherited, and lives in two unlinked places.** A new version of a gated model
> stays gated — being newer is not a reason to release it. Copy the predecessor's
> `availableIfOneOf` / `unavailableIfOneOf` onto the new `X_MODEL_CONFIG` (gates the picker,
> via `isModelAvailable`) **and** declare the same flag on every endpoint you add (gates the
> router, via `isEndpointAvailable`):
>
> ```ts
> static readonly endpointFilter = {
>   featureFlags: { contains: "fireworks_new_model_feature" as const },
> };
> ```
>
> Half-gating fails silently either way: hidden but reachable, or pickable but unroutable —
> and `resolveModel` swaps in a fallback model instead of erroring. Releasing a gated family
> is a separate, deliberate change.

> **An `eu/agent-platform` endpoint takes `EU_AGENT_PLATFORM_ENDPOINT_FILTER`, never `{}`.**
> Dust-managed EU hosting is sold to credit-priced plans and to workspaces carrying
> `use_vertex_for_supported_models`; that rule lives once, in
> `front/lib/llms/utils/endpoint_filters.ts`, and every `*_eu_agent_platform.ts` dust wrapper
> assigns it verbatim:
>
> ```ts
> static readonly endpointFilter = EU_AGENT_PLATFORM_ENDPOINT_FILTER;
> ```
>
> Copy the constant, not a sibling's inline literal — a hand-written copy is how six Gemini
> Flash EU endpoints ended up on `{}`, routing legacy workspaces to EU hosting nobody had
> promised them while the picker showed no EU flag. The client mirrors the same constant in
> `useRunsOnRegionalHosting` (`front/hooks/useRunsOnRegionalHosting.ts`) to decide whether to
> show a workspace its hosting region, so an endpoint that opts out makes that indicator lie.
>
> A model-specific gate composes with it rather than replacing it — `{ and: [FILTER, { featureFlags: … }] }`.
> This is about `region = EUROPE` **on `host = AGENT_PLATFORM`** only: provider-hosted EU
> endpoints (`*_eu_openai_responses`, `*_eu_mistral`) run on the provider's own EU
> infrastructure, are available to everyone, and keep `endpointFilter = {}`.

### C. `model_constructors` — the endpoint classes (stream)

| File | What to add |
|------|-------------|
| `front/lib/model_constructors/providers/{provider}/models/{model}.ts` | **Config mixin** `WithXConfig(Base)` exposing `static model`, `static configSchema`, `static contextSize`, `static maxOutputTokens`. Reuse the provider's shared `inputConfig`/`reasoning_efforts`/`shared` helpers. **`contextSize`/`maxOutputTokens` are the REAL provider values** — caps belong in the dust layer. |
| `front/lib/model_constructors/stream/endpoints/{provider}_{model}_{region}_{api}.ts` | One class per available `(region, provider-api)`, extending `WithXConfig(BaseClient)`. Set `static tokenPricing` (per-endpoint, region-adjusted), `region`, `regionalEndpoint`, and `static id = this.buildId()`. Base clients live in `stream/clients/*`. |
| `front/lib/model_constructors/stream/index.ts` | Import + register each **available** endpoint in `STREAM_ENDPOINTS`. |

### D. `model_constructors` — tests (TDD, see below)

| File | What to add |
|------|-------------|
| `front/lib/model_constructors/test/endpoints/{...}.test.ts` | One `StreamSetup` per endpoint. Copy the sibling's **key set**, but start every case at `null` — never copy its expected values (see the TDD loop). |
| `front/lib/model_constructors/test/endpoints/setups.ts` | Import + register each **registered** endpoint's setup (`satisfies Record<StreamEndpointId, StreamSetup>` forces completeness). |

### E. `llms` — the dust layer (stream)

| File | What to add |
|------|-------------|
| `front/lib/llms/providers/{provider}/models/{model}.ts` | **Dust config mixin** `WithDustXConfig(Base)` — `Object.assign`es the legacy `X_MODEL_CONFIG` onto the class and overrides `displayName`/`description`/`byok` (and any caps). |
| `front/lib/llms/stream/endpoints/{...}.ts` | One thin dust wrapper per endpoint extending the `model_constructors` class via the dust mixin; call `defineDustStreamEndpoint(...)`. This is where `endpointFilter` lives — `EU_AGENT_PLATFORM_ENDPOINT_FILTER` on every `*_eu_agent_platform.ts`, `{}` otherwise. |
| `front/lib/llms/stream/index.ts` | Register each **available** dust endpoint in `DUST_STREAM_ENDPOINTS` (`satisfies Record<StreamEndpointId, ...>`). |

### F. SDK + UI

| File | What to add |
|------|-------------|
| `sdks/js/src/types.ts` | Add the id to the `KnownModelLLMId` union. **Then rebuild the SDK types** (`cd sdks/js && npm run build:types`) — `front`'s `sdk_drift.test.ts` type-imports the built `@dust-tt/client`, so `tsgo` reads stale declarations until you do. |
| `front/types/assistant/models/used_model_configs.ts` | Add config to `USED_MODEL_CONFIGS` **at the right position** (see below), and **evict the family's older versions down to two** (see below). |

> **Array order is picker order.** Insert into the provider's block by release date, then by
> strength — newest generation on top, strongest first within it (Sol → Terra → Luna,
> Pro → Flash → Flash Lite). Appending puts the new model *below* the one it supersedes.
>
> **At most two versions of a family in `USED_MODEL_CONFIGS`.** The picker groups by maker,
> so every version left in the list is another near-identical row a user has to read past
> ("Gemini 3.5 Flash / 3.6 Flash / 3.7 Flash / 3.8 Flash"). When you add a model, keep only
> it and its immediate predecessor; drop the rest of the family from `USED_MODEL_CONFIGS`.
> Count families by product line, not by provider — Gemini Flash, Gemini Flash Lite and
> Gemini Pro are three families, each allowed two.
>
> Everything a dropped model needs to stay *callable* lives elsewhere
> (`SUPPORTED_MODEL_CONFIGS`, the endpoint classes, pricing), so the eviction only removes it
> from the picker and the agent builder. Then finish the deprecation properly, or the model
> rots into a stale default years later:
>
> - Set `isLegacy: true` + `isLatest: false` on each evicted config. `isLegacy` is also what
>   drops it from the public credits page, so an evicted-but-not-flagged model keeps being
>   advertised while being unpickable.
> - **Repoint every hardcoded reference to it.** `grep -rn X_MODEL_CONFIG front front-api` and
>   fix the ladders and defaults that name it: `ORDERED_FAST_MODEL_CONFIGS` /
>   `ORDERED_SMALL_MODEL_CONFIGS` / `ORDERED_LARGE_MODEL_CONFIGS` in
>   `front/lib/api/assistant/models.ts`, `getFastModelConfig` in
>   `front/lib/api/assistant/conversation/title.ts`, and `MODEL_STREAMS` candidates in
>   `front/types/assistant/models/auto.ts`. These are hand-maintained lists that no type
>   checks — nothing goes red when they point at a legacy model.
> - **Leave global agents alone** — see [Global agents are out of scope](#global-agents-are-out-of-scope).
>
> A legacy model still referenced by one of those lists is the failure mode this rule exists
> for: conversation titles ran on Gemini 3.5 Flash for three releases after 3.6/3.7/3.8
> shipped, purely because `getFastModelConfig` was never revisited.

### Global agents are out of scope

**Never modify a global agent as part of adding, deprecating or removing a model.** That
covers everything under `front/lib/api/assistant/global_agents/`: the `dust-*` agents'
`preferredModelConfiguration` (`configurations/dust/dust.ts`), the deep-dive model routing
(`configurations/dust/deep-dive.ts`), the descriptions in `global_agent_metadata.ts`,
`RETIRED_GLOBAL_AGENTS_SID`, and their tests. Which model a global agent runs is a product
decision owned separately, so it ships in its own change.

A global agent pinned to a model you are marking `isLegacy` keeps working, so leave it
there. Instead, list the global agents still pointing at the old model in your final
report, and in the PR description, so the owners can decide.

> **No marketing mirror.** The public credits page fetches `/api/marketing/model-credits`,
> which `front/lib/api/marketing/model_credits.ts` derives at request time from
> `SUPPORTED_MODEL_CONFIGS` + `MODEL_PRICING`. Nothing to copy into `marketing/` — but the
> model only appears there once it has a `MODEL_PRICING` entry, is not `isLegacy`, and is
> released (no `availableIfOneOf.featureFlag`).

> **Batch** endpoints (`.../batch/...`) are a curated subset — only add them if the model
> needs batch. They are NOT completeness-enforced. Set `supportsBatchProcessing` to the real
> capability regardless.

## The TDD loop (steps to actually run)

The endpoint classes derive their behavior from a shared integration test harness. **Let the
live API tell you the input contract — never infer it from the sibling model.** Sibling
expectations are the single biggest source of wrong config: two models in the same family
routinely differ on temperature, reasoning efforts, and forced tool use.

**The config schema must ALWAYS mirror the API's real behavior as closely as possible.** It
describes what the provider accepts — not what Dust happens to send today, and not what would
be convenient. If the API accepts a value, the schema accepts it; if the API rejects a value,
the schema rejects it. Never narrow past the API because an upstream layer already strips the
field (the `dropTemperature` / `dropTemperatureWhenReasoning` config parsers in `lib/llms` are
a *product* policy and belong there, not in the endpoint schema), and never widen past it to
avoid a union. Concretely: Anthropic reasoning models accept exactly `temperature: 1`, so the
field is `z.literal(1).optional().default(1)` — not `z.undefined()`, even though the Dust layer
drops it before the endpoint ever sees it.

When a divergence from the API is genuinely wanted (exposing a narrower effort set to control
cost, say), it is a **policy choice** — write it as a comment stating that the API allows more
and why Dust doesn't, so the next reader doesn't mistake it for a provider constraint.

**Reasoning efforts must ALWAYS mirror the model's official documentation**, not merely whatever
the endpoint happens to accept. This is the one place where "what the API tolerates" is the wrong
source of truth, because gateways are routinely looser than the models they serve:

- The **Fireworks** gateway validates `reasoning_effort` against low/medium/high/xhigh/max/none
  for *every* model it hosts, so a live run "passes" on efforts the model never defined.
- **DeepSeek** documents disabled/high/max and says low/medium are *mapped to* high and xhigh to
  max — accepting them would silently rewrite the caller's choice.
- **Kimi K3** is documented low/high/max by Moonshot; `medium` works through Fireworks but is not
  a K3 effort.
- **Kimi K2.6** has binary thinking; the graded values are accepted and do nothing (measured:
  `low` produced *more* reasoning than `medium`).
- **grok-4.5** silently accepts `minimal` and `xhigh`, which xAI documents only for other models.

So: find the **model author's** doc (not just the host's), expose exactly the efforts it lists,
and link it in a comment. Where host and author docs disagree, follow the author unless the host
documents a model-specific override — generic host guidance is not a contradiction. Then confirm
each documented effort actually works on the live endpoint, and record any effort the endpoint
accepts but the docs omit, with a note that undocumented efforts can change without notice.

The product vocabulary covers the full range (`none`, `minimal`, `low`, `medium`, `high`, `xhigh`,
`maximal`; the legacy `light` is read as `low`), and the picker offers exactly the efforts a model
marks supported. So **an effort the model does not have is marked `false` in
`supportedReasoningEfforts` — never remapped to another one.** `configParsers` must not rewrite
`reasoning.effort` (`effort-sent-as-selected` contract in `front/lib/llms/CONTRACTS`); the only
exceptions are `disableReasoningWhenForcingTool` and `dropReasoning`. No schema `.transform()`
either, and no widening the endpoint schema to swallow it.

When the new model replaces one whose efforts differ (e.g. Sonnet 5.5 drops `none`, which Sonnet 5
supports), repointing agents to it needs a `reasoningEffort` migration too
(`replacement-model-preserves-reasoning-effort` contract).

### 1. Widen

Write the config mixin with `configSchema` set to the broad `inputConfigSchema`
(`front/lib/model_constructors/types/input/configuration.ts`), marked `// TDD SCAFFOLD`. Every
case must reach the API instead of being short-circuited by a guessed schema.

### 2. Write the test with every case `null`

Copy the sibling's **key set** (so coverage matches) but **not** its expected values. `null`
runs the case with its default checkers. Starting from the sibling's
`INPUT_CONFIGURATION_ERROR` markers hides exactly the differences you are trying to find, and
lets stale expectations survive — a suite whose expectations were never run green will happily
assert things the schema makes impossible.

### 3. Red run — the whole suite, no `--bail`

You want every failure at once in order to characterize the contract:

```bash
cd front
NODE_ENV=test RUN_LLM_TEST=true DUST_MANAGED_{PROVIDER}_API_KEY=... \
  npm run test -- --config lib/model_constructors/test/vite.config.js \
  lib/model_constructors/test/endpoints/{...}.test.ts
```

Env-var names live in the sibling's `createInstance` (`DUST_MANAGED_ANTHROPIC_API_KEY`,
`DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY`, …). Agent-platform/Vertex endpoints need
`VERTEX_AI_PROJECT_ID` plus GCP credentials — a `GOOGLE_APPLICATION_CREDENTIALS` service-account
key works and needs no `gcloud auth application-default login`. Add `--bail 1` or
`-t "<substring>"` only later, when iterating on a single case.

A Vertex 404 *"Publisher model … was not found or your project does not have access to it"* on
**every** location (`global` included), while the sibling model works on the same project, means
the model is not enabled in the project's Model Garden yet, not that the region lacks it. Ask
for it to be enabled before concluding anything about EU availability — and until its suite
runs green, keep that endpoint **unregistered**. A deploy-plan step ("enable it, then re-run")
does not count: registered means routable, and the router will send traffic to a 404.

**When a run fails for this reason, report it with the big warning below — every time, not
once.** Put it at the top of your reply, before any other result, and repeat it in every later
summary of the work until that endpoint's suite runs green or the endpoint is unregistered. A
one-line mention in a results list is how this was missed for Haiku 5.5.

```
> [!WARNING]
> ## ⚠️⚠️⚠️ MODEL NOT ENABLED — `{endpoint}` IS NOT LIVE ⚠️⚠️⚠️
> The live suite for `{endpoint}` fails with a 404 *"Publisher model … not found"* on
> `{project}`: the model is **not enabled** in that project's Model Garden.
> **If this endpoint is registered and merged, every workspace routed to it will fail.**
> Enable the model and re-run the suite, or keep the endpoint unregistered.
```

### 4. Sort every failure into one of three buckets

The bucket decides the fix:

| Last event | Meaning | What to do |
|---|---|---|
| `error` carrying a provider message (`invalid_request_error`, …) | Real API constraint | The schema **must** encode it |
| `error` of type `input_configuration_error` | Our own zod rejected it before any request | With the widest schema this means a converter or base client still rejects it |
| The case **passes** | The API accepts this input | Whether to *allow* it is a **policy choice** — match the sibling unless there's a reason to diverge, and state which you chose and why |

A passing case is evidence. It disproves any assumption that the model rejects that input —
including assumptions already written down. Do not keep an `INPUT_CONFIGURATION_ERROR` because
a code comment says the model doesn't support something: **the run outranks the comment.**

### 5. Narrow — including the defaults

Rewrite `configSchema` to the real contract, with a doc URL + date in a comment next to each
value. Three things to pin deliberately, not by inheritance:

- **`reasoning` default effort — read it off the official doc, every time.** The `.default(...)`
  is load-bearing: an absent `reasoning` sends *no* thinking config, so the provider's own default
  applies, and that differs per model (adaptive-on for Fable 5 / Opus 5 / Sonnet 5; thinking-*off*
  for Opus 4.8/4.7/4.6 and Sonnet 4.6; no thinking for Haiku 4.5; `max` for Kimi K3 and GLM-5.2).
  **Never carry over a sibling's default or invent one for cost reasons** — Kimi K3 sat at `low`
  when Moonshot documents `max`. Mirror the documented default and cite the page; if the product
  wants a cheaper default, that belongs in `defaultReasoningEffort` on the llms model config, not
  in the endpoint schema.
- **`temperature` handling.** Sweep actual values against the API rather than assuming — the
  rule is per-model. Anthropic reasoning models accept only `1` while thinking is on and any
  value while thinking is off; some reject the field outright.
- **Effort set and `forceTool` compatibility.** Which efforts are genuinely accepted, and
  whether a forced `tool_choice` may coexist with reasoning.

### 6. Green run

Mark the genuinely-rejected cases `INPUT_CONFIGURATION_ERROR`, re-run the **full** suite until
every case passes, then delete the `// TDD SCAFFOLD` comment.

### 7. Re-run every endpoint sharing the mixin

A config mixin is shared across regions and provider APIs (e.g. `global/anthropic` +
`eu/agent-platform`), so narrowing it changes all of them. Run each one.

**Every registered endpoint must have its own green run before merge.** A green
`global/anthropic` run says nothing about `eu/agent-platform` — different project, different
Model Garden, different access. If an endpoint's suite is red for an access reason (404, 403,
quota), unregister it from `stream/index.ts`, `setups.ts` and `llms/stream/index.ts` and ship
the rest; register it in a follow-up once it runs green. (Haiku 5.5 shipped its EU endpoint on
a known-404 suite with "enable in Model Garden" as a deploy step, and EU workspaces hit it.)

### 8. Push the new behavior *up* into the family's shared config

Shared configs are **per family** — Opus, Sonnet, Haiku each have their own; a family with a
single member (Fable 5) just keeps a standalone config. A family's shared config should
**track the latest member of that family**, because the next model in it is far likelier to
repeat the newest behavior than the oldest. So when characterizing a model reveals that its
family's shared config was wrong, **fix the shared config and put the override on the older
models** — never special-case the newest one.

The reflex to resist is the opposite: leaving the shared config alone and giving the new model
a bespoke schema. That makes every future model in the family inherit stale behavior, and it
is how a restriction that only ever applied to one old model ends up applied to all of them.
(Worked example: `forceTool: z.undefined()` sat in the shared Opus config because *extended*
thinking forbids a forced `tool_choice`. Opus 4.7, 4.8 and 5 all use *adaptive* thinking and
all accept it — verified live — so the fix was to drop it from the shared config, not to
override it on Opus 5.)

Do not merge families that happen to agree today. Fable 5 and Opus 5 share every value except
one (Fable 5 cannot disable thinking), but they are different families, so they keep separate
configs and the coincidence is allowed to drift.

Then re-run the suites of every model in the family (§7), since they all moved.

If you cannot run the live suite (no key / non-interactive), narrow the config from the
sibling model in the same family and **say so explicitly** — flag every expectation as
unverified; the live run must still happen before merge.

Without `NODE_ENV=test`+`RUN_LLM_TEST`, the test file loads but its cases are skipped; that
still validates it compiles and is registered.

## Commit gate — not-enabled endpoints (mandatory)

When the user asks to commit (or to open the PR), **before running `git commit`**, check every
endpoint the change registers (`stream/index.ts`, `setups.ts`, `llms/stream/index.ts`). If any
of them has a red live run for a not-enabled reason (Vertex 404 *"Publisher model … not
found"*, 403, model not in Model Garden), or has no live run at all, **stop and call
`AskUserQuestion`** — never commit on your own judgment, and never treat an earlier "go ahead
and commit" as confirmation for this. Shape the question like this:

- `header`: `⚠️ NOT LIVE`
- `question`: start with `⚠️⚠️⚠️ WARNING: {endpoint} IS NOT ENABLED — registering it routes
  real traffic to a 404. ⚠️⚠️⚠️`, then name the failing endpoint(s), the error and the GCP
  project, then ask what to do.
- `options`, in this order:
  1. `Unregister it and commit (Recommended)`: commit the rest; the endpoint class stays
     defined but unregistered, and is registered in a follow-up once its suite runs green.
  2. `Don't commit yet`: wait until the model is enabled and the suite re-run green.
  3. `Commit it registered anyway`: the user accepts that workspaces routed to it will fail
     until the model is enabled.

Show the big warning from §3 in the same reply, above the question. If the user picks option 3,
put the same warning at the top of the PR description's **Risk** section, not just a line in
**Tests**.

## Verify (non-live checks that must pass)

```bash
cd front
npx tsgo --noEmit                        # whole-project type check
NODE_ENV=test npm run test -- \
  types/assistant/models/sdk_drift.test.ts \
  types/assistant/models/types.test.ts \
  types/assistant/models/model_tiers.test.ts
```

- `tsgo` clean over the files you touched (the `satisfies Record<...>` maps and `STREAM_ENDPOINT_SETUPS` are your completeness guardrails).
- `sdk_drift.test.ts` is a **compile-time** guard: its `it()` body always passes, and the
  `Exclude<StaticModelIdType, KnownModelLLMId>` assertion only fails under `tsgo`. So a green
  vitest run proves nothing here — `tsgo` is what enforces front ⊆ SDK. Rebuild the SDK types
  first, or `tsgo` reads a stale `@dust-tt/client` and passes on a drifted id.
- `model_tiers.test.ts` green ⇒ reasoning-effort maps and tier maps in sync with the configs.

## Deprecating or removing an old model

Adding a model is normally paired with retiring the one it supersedes. There are two
distinct paths — pick by whether the provider still serves the old model.

### Path 1: deprecate (superseded, but still served)

Hide it from new work and leave everything else standing, so agents already pinned to it
keep working and historical token accounting stays exact. Worked example: Kimi K2.6
added / K2.5 deprecated (`f2824da5c5e`, #28834).

| File | What to change |
|------|----------------|
| `front/types/assistant/models/{provider}.ts` | Set `isLegacy: true` + `isLatest: false` on the old config, and strip "flagship"/"latest" from its `description`. |
| `front/types/assistant/models/used_model_configs.ts` | Remove it from `USED_MODEL_CONFIGS` — that is what drops it from the model picker, the workspace model-providers page, and `workspace_capabilities`. |
| `front/types/assistant/models/auto.ts` | Replace it in any `MODEL_STREAMS` candidate list with the new model. |
| `front/lib/api/assistant/models.ts` | Replace it in `ORDERED_FAST_MODEL_CONFIGS` / `ORDERED_SMALL_MODEL_CONFIGS` / `ORDERED_LARGE_MODEL_CONFIGS` — the whitelisted-model ladders behind `getFastestWhitelistedModel` & co. |
| `front/lib/api/assistant/conversation/title.ts` | Replace it in `getFastModelConfig`, the per-provider ladder picking the model that names conversations. |

Do not touch global agents (`dust-*`, deep-dive, or a model's own agent) — see
[Global agents are out of scope](#global-agents-are-out-of-scope). Report the ones still
pinned to the old model instead.

**Keep** the id in `STATIC_MODEL_IDS`, `SUPPORTED_MODEL_CONFIGS`, `CURRENT_MODEL_PRICING`,
`STATIC_MODEL_TIERS`, `STATIC_MODEL_SUPPORTED_REASONING_EFFORTS`, and keep its endpoint
classes registered. Nothing to do for marketing: `isLegacy` is what excludes it from the
public credits list (`front/lib/api/marketing/model_credits.ts`).

A deprecated model needs no agent-config migration — that is the point of the path.

### Path 2: remove (provider decommissioned it)

Nothing can run on the model any more, so its serving code comes out of the codebase **and
every agent still pinned to it must be repointed**. Its id and config stay: stored runs still
reference the id, and consumption attribution prices and tokenizes them from it (the
`retain-retired-model-ids` and `tokenizer-for-every-static-model` contracts). Worked example:
GLM-5.2 retirement (the `glm-5p2` entries in `fireworks.ts`). Do Path 1's picker
repointing first, then:

- **Model config + registry**: remove `X_MODEL_CONFIG` from `SUPPORTED_MODEL_CONFIGS` in
  `front/types/assistant/models/models.ts` and add it to `HISTORICAL_TOKENIZATION_MODEL_CONFIGS`
  in `front/lib/api/assistant/agent_message_consumption_attribution/tool_footprint.ts`. **Keep**
  the `X_MODEL_ID` const, the `X_MODEL_CONFIG` export (with `isLegacy: true`), the id in
  `STATIC_MODEL_IDS`, and its entries in `CURRENT_MODEL_PRICING`, `STATIC_MODEL_TIERS` and
  `STATIC_MODEL_SUPPORTED_REASONING_EFFORTS`. `tool_footprint.test.ts` fails for any static id
  that resolves to no tokenizer config.
- **`model_constructors` + `llms`**: delete the endpoint classes, config mixins, and
  `test/endpoints/*.test.ts`; unregister from `stream/index.ts`, `setups.ts` and
  `llms/stream/index.ts`; drop the id from the `MODELS` array in
  `front/lib/model_constructors/types/models.ts`.
- **Global agents pinned to it**: do not repoint, retire or delete them here (see
  [Global agents are out of scope](#global-agents-are-out-of-scope)). A global agent on a
  removed model breaks, so **stop and tell the user which agents it is** before shipping the
  removal. Don't work around it.
- **Feature flag**: drop the model's flag from `front/types/shared/feature_flags.ts` once
  nothing else references it.
- **SDK**: keep the id in `KnownModelLLMId` in `sdks/js/src/types.ts`. `sdk_drift.test.ts`
  requires every `STATIC_MODEL_IDS` entry there, and removing it would narrow a public API
  type, a breaking change.

### Migrating agent configurations

A removal orphans every `AgentConfiguration` row still pinned to the dead model, so ship a
repoint script in the same PR: `front/migrations/YYYYMMDD_migrate_<model>_models.ts`, built
on `makeScript`. Template: `front/migrations/20260608_migrate_deepseek_r1_models.ts`.

- **Hardcode both source and target model ids as string literals when the source config is
  being deleted in this PR.** The script must stay a frozen snapshot: importing the consts
  breaks the moment they are gone, and importing a "latest model" pointer would silently
  retarget the migration when the next model lands. (A pure repoint that leaves the model in
  the codebase — e.g. `20260810_migrate_sonnet46_medium_to_auto.ts` — can import the consts.)
- Scan with `AgentConfigurationModel.findAll({ where: { modelId, status: "active" } })`
  through a `ModelStaticWorkspaceAware` alias, with
  `dangerouslyBypassWorkspaceIsolationSecurity: true` plus the `WORKSPACE_ISOLATION_BYPASS`
  comment and `oxlint-disable-next-line dust/noUnverifiedWorkspaceBypass` the linter requires —
  migrations run across all workspaces.
- Log every matched agent (`sId`, `version`, `workspaceId`, from → to) on the dry run, and
  gate all writes on `execute`.
- **Write once, batched**: a single
  `update({ providerId, modelId }, { where: { id: agents.map((a) => a.id) } })` over the ids
  already gathered — not `agent.update()` per row. Scoped to those ids, the update needs no
  isolation bypass of its own (the cross-workspace scan already happened in the `findAll`).
- Set `providerId` alongside `modelId` — the replacement often sits on a different provider.
  Reset `reasoningEffort` too if the target does not support the effort the agent was on.

## Model config properties (quick ref)

| Property | Notes |
|----------|-------|
| `contextSize` / `generationTokensCount` | Real provider values (legacy config). Caps go in the dust layer. |
| `supportsVision` | Can process images. |
| `supportsResponseFormat` | Structured output (JSON). Often incompatible with tool use — verify. |
| `supportedReasoningEfforts` | `{ none, minimal, low, medium, high, xhigh, maximal }`. Must match `static_model_reasoning_efforts.ts`. |
| `defaultReasoningEffort` | Default effort. |
| `isLatest` / `isLegacy` | Exactly one `isLatest` per family; flip the previous one to `false`. |
| `regionalAvailability` | `{ "us-central1", "europe-west1" }` — reflect real availability. |
| `tokenizer` | Tokenizer for token counting. |

## Checklist

- [ ] Specs + pricing confirmed against official docs, URLs in comments
- [ ] Host/region availability confirmed; only available endpoints registered
- [ ] Model config added; previous family model `isLatest: false`
- [ ] `STATIC_MODEL_IDS` + `SUPPORTED_MODEL_CONFIGS` + `model_constructors/types/models.ts`
- [ ] Pricing/tiers/reasoning trio updated (compile-forced)
- [ ] `EU_UPLIFT_MODEL_IDS` updated if a registered EU endpoint prices above its global sibling
      (NOT compile-forced — a miss silently bills EU traffic at global rates)
- [ ] `model_constructors`: config mixin + endpoint class(es) + `stream/index.ts`
- [ ] Tests: `.test.ts` per endpoint + `setups.ts`
- [ ] TDD loop run live: widened schema → all cases `null` → full red run → narrowed schema
      with reasoning-default and temperature confirmed against docs → green run → scaffold removed
- [ ] Config schema mirrors the API: every value the API accepts is accepted, every value it
      rejects is rejected; deliberate divergences commented as policy, not as provider limits
- [ ] New behavior pushed up into the family's shared config, with overrides on the *older*
      models rather than a bespoke schema on the new one
- [ ] Every endpoint sharing the config mixin re-run green (all regions / provider APIs)
- [ ] Every **registered** endpoint has its own green live run — a red or unrun suite (e.g.
      Vertex 404, model not enabled) means unregistered, never "fix in the deploy plan"
- [ ] Commit gate run: any not-enabled endpoint confirmed via `AskUserQuestion` with the big
      warning before `git commit`
- [ ] `llms` dust layer: dust mixin + endpoint(s) + `llms/stream/index.ts`
- [ ] Every `*_eu_agent_platform.ts` added carries `EU_AGENT_PLATFORM_ENDPOINT_FILTER` (NOT
      compile-forced — `{}` silently routes ineligible workspaces to EU hosting and makes the
      picker's region flag lie)
- [ ] UI `used_model_configs.ts`; SDK union updated **and types rebuilt before `tsgo`**
- [ ] New config inserted in `USED_MODEL_CONFIGS` by release date then strength, not appended
- [ ] `USED_MODEL_CONFIGS` holds at most two versions of the family; every model evicted by
      that rule is `isLegacy: true` + `isLatest: false` and no longer named by any hardcoded
      ladder (`ORDERED_*_MODEL_CONFIGS`, `getFastModelConfig`, `MODEL_STREAMS`)
- [ ] No file under `front/lib/api/assistant/global_agents/` modified; global agents still
      pinned to the superseded model listed in the report / PR description
- [ ] `tsgo` clean; `types` / `model_tiers` tests green
- [ ] Live endpoint test passes (or limitation flagged for follow-up)

Retiring the superseded model (same PR):

- [ ] Superseded model `isLegacy: true` + `isLatest: false`, dropped from `USED_MODEL_CONFIGS`
- [ ] `MODEL_STREAMS` candidates repointed to the new model (global agents untouched)
- [ ] If **decommissioned**: endpoints + feature flag removed; config moved from
      `SUPPORTED_MODEL_CONFIGS` to `HISTORICAL_TOKENIZATION_MODEL_CONFIGS`; id, config export,
      pricing, tiers and reasoning efforts kept
- [ ] Agent-config repoint migration written with hardcoded ids, batched update, dry-run
      output reviewed before `--execute`

## Troubleshooting

- **`tsgo` fails on `sdk_drift.test.ts` naming your id** → add it to `KnownModelLLMId` in `sdks/js/src/types.ts`, then `cd sdks/js && npm run build:types` (it type-imports the built `@dust-tt/client` declarations, so the rebuild must come first).
- **`tsgo` on `setups.ts` / index files** → you added an endpoint to `STREAM_ENDPOINTS` without a matching setup, or vice-versa. Register both.
- **`model_tiers.test.ts` fails** → `static_model_reasoning_efforts.ts` disagrees with the config's `supportedReasoningEfforts`, or `STATIC_MODEL_TIERS` is missing an effort the config supports.
- **Model not in UI** → missing from `USED_MODEL_CONFIGS`.
- **Model sorted below the one it replaces** → appended to `USED_MODEL_CONFIGS` instead of inserted at the top of its provider block.
- **Live test rejects a config** → check the bucket first (§4). A provider `invalid_request_error` means narrow `configSchema` and mark the case `INPUT_CONFIGURATION_ERROR`; an `input_configuration_error` under the widened scaffold means a converter or base client is rejecting it, not the API.
- **A case you expected to fail passes** → the model accepts that input. Fix the expectation (and any comment claiming otherwise) rather than keeping the marker.
- **Live suite 401s** → check the key you actually exported. A shell profile can define the same `DUST_MANAGED_*_API_KEY` twice; the last export wins interactively, so grepping for the first match can hand you a stale key.
