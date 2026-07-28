---
name: dust-llm
description: Step-by-step guide for adding support for a new LLM in Dust. Use when adding a new model, or updating a previous one.
---

# Adding Support for a New LLM Model

This skill guides you through adding a newly released LLM to the **model_constructors +
llms** stack (the endpoint-class router). It replaces the legacy `lib/api/llm/clients/*`
router, which no longer exists.

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
| `front/types/assistant/models/{provider}.ts` | `X_MODEL_ID` const + `X_MODEL_CONFIG`. **Set `isLatest: false` on the previous model in the same family** and drop "latest" from its description. |
| `front/types/assistant/models/models.ts` | Add id to `STATIC_MODEL_IDS` and config to `SUPPORTED_MODEL_CONFIGS` (imports in both alpha blocks). |
| `front/types/assistant/models/auto.ts` | If the model should participate in `auto`/`auto_fast`/`auto_complex` routing, add a `ModelStreamCandidate`. |
| `front/lib/model_constructors/types/models.ts` | Add `export const X = "model-id"` and include it in the `MODELS` array (this is the `model_constructors` id type). |

### B. Pricing / tiers / reasoning (TYPE-ENFORCED over `StaticModelIdType`)

Adding the id to `STATIC_MODEL_IDS` makes these fail to compile until updated:

| File | What to add |
|------|-------------|
| `front/lib/api/assistant/token_pricing/global.ts` | `CURRENT_MODEL_PRICING` entry (input/output/`cache_read_input_tokens` per 1M) + doc URL comment. |
| `front/lib/api/assistant/token_pricing/static_model_reasoning_efforts.ts` | `{ none, light, medium, high }` support map. **Must match the config's `supportedReasoningEfforts`** (enforced by `tiers.test.ts`). |
| `front/lib/api/assistant/token_pricing/tiers.ts` | `STATIC_MODEL_TIERS` entry mapping each supported effort → tier name. |

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
| `front/lib/llms/stream/endpoints/{...}.ts` | One thin dust wrapper per endpoint extending the `model_constructors` class via the dust mixin; call `defineDustStreamEndpoint(...)`. |
| `front/lib/llms/stream/index.ts` | Register each **available** dust endpoint in `DUST_STREAM_ENDPOINTS` (`satisfies Record<StreamEndpointId, ...>`). |

### F. SDK + UI + marketing mirror

| File | What to add |
|------|-------------|
| `sdks/js/src/types.ts` | Add the id to the `KnownModelLLMId` union. **Then rebuild the SDK types** (`cd sdks/js && npm run build:types`) so `front`'s `sdk_drift.test.ts` (which reads the built `@dust-tt/client`) passes. |
| `front/components/providers/model_configs.ts` | Add config to `USED_MODEL_CONFIGS` so it shows in the UI. |
| `marketing/types/assistant/models/models.ts` | Add `{ modelId, displayName, providerId }` snapshot. |
| `marketing/lib/api/assistant/token_pricing.ts` | Add the pricing entry (keep in sync with front). |

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

When the product still offers an effort the model does not have, map it in the **llms layer** with
a `configParsers` entry (`mapReasoningNoneToMinimal`, `mapNonNoneReasoningToHigh`,
`mapReasoningEffortToLowHighMax`, `forceHighReasoningEffort`) — never with a schema `.transform()`, and never by widening the
endpoint schema to swallow it.

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

## Verify (non-live checks that must pass)

```bash
cd front
npx tsgo --noEmit                        # whole-project type check
NODE_ENV=test npm run test -- \
  types/assistant/models/sdk_drift.test.ts \
  types/assistant/models/types.test.ts \
  lib/api/assistant/token_pricing/tiers.test.ts
```

- `tsgo` clean over the files you touched (the `satisfies Record<...>` maps and `STREAM_ENDPOINT_SETUPS` are your completeness guardrails).
- `sdk_drift.test.ts` green ⇒ front ⊆ SDK (rebuild `sdks/js` types if it names your id).
- `tiers.test.ts` green ⇒ reasoning-effort maps in sync with the configs.

## Model config properties (quick ref)

| Property | Notes |
|----------|-------|
| `contextSize` / `generationTokensCount` | Real provider values (legacy config). Caps go in the dust layer. |
| `supportsVision` | Can process images. |
| `supportsResponseFormat` | Structured output (JSON). Often incompatible with tool use — verify. |
| `supportedReasoningEfforts` | `{ none, light, medium, high }`. Must match `static_model_reasoning_efforts.ts`. |
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
- [ ] `model_constructors`: config mixin + endpoint class(es) + `stream/index.ts`
- [ ] Tests: `.test.ts` per endpoint + `setups.ts`
- [ ] TDD loop run live: widened schema → all cases `null` → full red run → narrowed schema
      with reasoning-default and temperature confirmed against docs → green run → scaffold removed
- [ ] Config schema mirrors the API: every value the API accepts is accepted, every value it
      rejects is rejected; deliberate divergences commented as policy, not as provider limits
- [ ] New behavior pushed up into the family's shared config, with overrides on the *older*
      models rather than a bespoke schema on the new one
- [ ] Every endpoint sharing the config mixin re-run green (all regions / provider APIs)
- [ ] `llms` dust layer: dust mixin + endpoint(s) + `llms/stream/index.ts`
- [ ] SDK union updated **and rebuilt**; UI `model_configs.ts`; marketing mirror
- [ ] `tsgo` clean; `sdk_drift` / `types` / `tiers` tests green
- [ ] Live endpoint test passes (or limitation flagged for follow-up)

## Troubleshooting

- **`sdk_drift.test.ts` names your id** → add it to `KnownModelLLMId` in `sdks/js/src/types.ts`, then `cd sdks/js && npm run build:types` (the test reads the built `@dust-tt/client`).
- **`tsgo` on `setups.ts` / index files** → you added an endpoint to `STREAM_ENDPOINTS` without a matching setup, or vice-versa. Register both.
- **`tiers.test.ts` fails** → `static_model_reasoning_efforts.ts` disagrees with the config's `supportedReasoningEfforts`.
- **Model not in UI** → missing from `USED_MODEL_CONFIGS`.
- **Live test rejects a config** → check the bucket first (§4). A provider `invalid_request_error` means narrow `configSchema` and mark the case `INPUT_CONFIGURATION_ERROR`; an `input_configuration_error` under the widened scaffold means a converter or base client is rejecting it, not the API.
- **A case you expected to fail passes** → the model accepts that input. Fix the expectation (and any comment claiming otherwise) rather than keeping the marker.
- **Live suite 401s** → check the key you actually exported. A shell profile can define the same `DUST_MANAGED_*_API_KEY` twice; the last export wins interactively, so grepping for the first match can hand you a stale key.
