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
e.g. `google_ai_studio_gemini_3_6_flash_global_agent_platform.ts`. The class name is the
PascalCase of the same, with numbers spelled out:
`GoogleAiStudioGeminiThreeDotSixFlashGlobalAgentPlatformStream`.

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
| `front/lib/model_constructors/test/endpoints/{...}.test.ts` | One `StreamSetup` per endpoint (mirror the sibling's expected cases). |
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

The endpoint classes derive their behavior from a shared integration test harness. The proper
flow:

1. Write the config mixin with `configSchema` set to the **broad default**
   `inputConfigSchema` (from `front/lib/model_constructors/types/input/configuration.ts`).
2. Write the endpoint class + its `.test.ts` (mirror the sibling's setup).
3. Run the endpoint's test **live** against the real provider:
   ```bash
   cd front
   NODE_ENV=test RUN_LLM_TEST=true DUST_MANAGED_{PROVIDER}_API_KEY=... \
     npm run test -- --config lib/model_constructors/test/vite.config.js --bail 1 \
     lib/model_constructors/test/endpoints/{...}.test.ts
   ```
   (The exact env-var names are in the sibling's `createInstance`, e.g.
   `DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY`, `VERTEX_AI_PROJECT_ID`.)
4. From the failures, **narrow** `configSchema` to what the model actually accepts (reasoning
   efforts, temperature handling, response-format vs tool-use, etc.) and mark the rejected
   cases with `INPUT_CONFIGURATION_ERROR` in the test. Re-run until green.

If you cannot run the live suite (no key / non-interactive), narrow the config from the
sibling model in the same family (same tier ⇒ same input contract) and **say so explicitly** —
the live run should still be done before merge.

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
- [ ] Tests: `.test.ts` per endpoint + `setups.ts`; live TDD run to narrow the config
- [ ] `llms` dust layer: dust mixin + endpoint(s) + `llms/stream/index.ts`
- [ ] SDK union updated **and rebuilt**; UI `model_configs.ts`; marketing mirror
- [ ] `tsgo` clean; `sdk_drift` / `types` / `tiers` tests green
- [ ] Live endpoint test passes (or limitation flagged for follow-up)

## Troubleshooting

- **`sdk_drift.test.ts` names your id** → add it to `KnownModelLLMId` in `sdks/js/src/types.ts`, then `cd sdks/js && npm run build:types` (the test reads the built `@dust-tt/client`).
- **`tsgo` on `setups.ts` / index files** → you added an endpoint to `STREAM_ENDPOINTS` without a matching setup, or vice-versa. Register both.
- **`tiers.test.ts` fails** → `static_model_reasoning_efforts.ts` disagrees with the config's `supportedReasoningEfforts`.
- **Model not in UI** → missing from `USED_MODEL_CONFIGS`.
- **Live test rejects a config** → narrow `configSchema` and mark the case `INPUT_CONFIGURATION_ERROR`.
