---
name: dust-llm-class-tdd
description: Implement a new LLM endpoint class (provider/api/region/model) in the `model_constructors` router with the integration test harness, test-first. Use when adding a stream (or batch) endpoint class for a model on a specific provider API + region during the LLM router refactoring.
---

# Implementing an LLM Endpoint Class with TDD

This skill guides you through adding **one endpoint class** in `front/lib/model_constructors`
using the integration test harness, test-first.

## Context: the refactoring

We are moving the LLM router from **one class per provider** to **one class per endpoint**,
where an *endpoint* is the cross-product:

```
endpoint = providerId × providerApi × region × modelId
id = `${providerId}/${providerApi}/${region}/${modelId}`
       e.g. "anthropic/agent-platform/eu/claude-sonnet-4-6"
```

The same model is reachable through several endpoints (e.g. Claude Sonnet 4.6 via the direct
Anthropic API global, and via the agent-platform/Vertex API in `eu`). Each gets its own class
with its own pricing, region, and — crucially — its own **validated input config schema**.

This skill is **not** about registering a brand-new model in the legacy system (that is
`dust-llm`). It is about adding an endpoint class on top of the new `model_constructors`
framework and characterizing its real input contract against the live API.

## Architecture (where things live)

```
front/lib/model_constructors/
├── configuration.ts                 # BaseModelConfiguration (id, providerId, api, modelId,
│                                     #   region, contextSize, maxOutputTokens, configSchema, tokenPricing)
├── client.ts                        # Client base: metadata(), static buildId()
├── types/                           # model_ids, provider_ids, provider_apis, regions,
│                                     #   credentials, token_pricing, input/, output/
├── providers/<provider>/
│   ├── converters/input/            # WithXInputConverter mixin → buildRequestPayload()
│   ├── converters/output/           # WithXOutputConverter mixin → rawStreamOutputToEvents()
│   └── models/<model>.ts            # WithXModelConfig mixin: modelId, configSchema,
│                                     #   contextSize, maxOutputTokens
├── stream/
│   ├── endpoint.ts                  # StreamEndpoint<I, O> abstract base
│   ├── configuration.ts             # StreamEndpointConstructor
│   ├── clients/<api>.ts             # abstract per-API client: providerId, api, base configSchema,
│   │                                #   constructor(credentials), streamRaw, rawStreamOutputToEvents
│   └── endpoints/<api>_<region>_<model>.ts   # THE CONCRETE ENDPOINT CLASS (what you add)
└── test/
    ├── cases.ts                     # shared TEST_CASES matrix + checkers
    ├── runner.ts                    # runStreamEndpointTests(ModelClass, setup)
    ├── setup.ts                     # StreamSetup type
    ├── stream.ts                    # runStream() — validates config, then hits the API
    └── endpoints/<api>_<region>_<model>.test.ts   # THE TEST FILE (what you add)
```

A concrete endpoint class is tiny — it composes existing mixins and sets the per-endpoint
statics:

```typescript
// stream/endpoints/anthropic_global_claude_sonnet_four_dot_six.ts
export class AnthropicGlobalClaudeSonnetFourDotSixStream extends WithAnthropicClaudeSonnetFourDotSixConfig(
  AnthropicStream
) {
  static readonly tokenPricing = { cacheCreated: 3.75, cacheHit: 0.3, standardInput: 3.0, standardOutput: 15.0 };
  static readonly region = GLOBAL;
  static readonly id = this.buildId();
}
AnthropicGlobalClaudeSonnetFourDotSixStream satisfies StreamEndpointConstructor;
```

The class chain is: **endpoint** → `With<Model>Config` mixin → **API client** (`AnthropicStream`,
`AgentPlatformStream`) → converter mixins → `StreamEndpoint` → `Client`.

> ⚠️ **Static shadowing.** `configSchema` is a static. The model-config mixin (`With<Model>Config`)
> sets `configSchema`, and it sits *above* the API client in the chain, so it **shadows** any
> `configSchema` the client/base defines. `runStreamEndpointTests` reads `ModelClass.configSchema`,
> i.e. whichever class **closest to the endpoint** defines it. To change the effective schema for
> an endpoint, define `static readonly configSchema` **on the endpoint class itself** (it wins).

## Step 0 — Confirm the provider layer exists (scope check)

The endpoint class is ~15 lines, but it composes a **provider layer** (converters + API client +
model-config mixin). Mid-refactor, that layer often does **not** exist yet for the provider you
want. Check before promising a quick endpoint:

```bash
ls lib/model_constructors/providers/<provider>/ lib/model_constructors/stream/clients/
```

If the converters/client/model-config are missing, building them is a **separate, multi-file
job** (mirroring the sibling provider and porting from the legacy `lib/api/llm/` integration) —
effectively the equivalent of several PRs, not a single TDD loop.
**Stop and confirm scope with the user** before building a whole provider; don't silently expand a
"add an endpoint" request into a provider port. Once the layer exists, the per-endpoint TDD loop
below is the small final step.

## Prerequisites

Before writing the endpoint class, these building blocks must already exist (add them first, or
in a prior PR, mirroring an existing provider — see Step 0):

- [ ] `modelId` registered in `types/model_ids.ts`
- [ ] `providerId` in `types/provider_ids.ts`, `api` in `types/provider_apis.ts`, `region` in `types/regions.ts`
- [ ] credential field in `types/credentials.ts` (e.g. `ANTHROPIC_API_KEY`, `AGENT_PLATFORM_PROJECT_ID`)
- [ ] input + output converter mixins under `providers/<provider>/converters/`
- [ ] model-config mixin `providers/<provider>/models/<model>.ts` (`WithXModelConfig`) — **only if
  the model is reachable through multiple endpoints** and the config is worth sharing. If the model
  has a single endpoint, skip the mixin and set the statics (`modelId`, `configSchema`,
  `contextSize`, `maxOutputTokens`) directly on the endpoint class.
- [ ] API client `stream/clients/<api>.ts` (abstract; constructor takes `Credentials`)

**Test credentials / env** (the harness reads `process.env`, defaulting to `""`):

| API | Credential field | Env var used in test | Extra |
|-----|------------------|----------------------|-------|
| `anthropic` | `ANTHROPIC_API_KEY` | `DUST_MANAGED_ANTHROPIC_API_KEY` | — |
| `openai-responses` | `OPENAI_API_KEY` | `DUST_MANAGED_OPENAI_API_KEY` | — |
| `agent-platform` (Vertex) | `AGENT_PLATFORM_PROJECT_ID` | `VERTEX_AI_PROJECT_ID` | needs `gcloud auth application-default login` (ADC) |

If a run fails with `oauth2.googleapis.com/token → 400 invalid_grant / invalid_rapt`, your gcloud
ADC is stale — have the user run `! gcloud auth application-default login`.

## The TDD loop

The whole point: **let the real API tell you what the input contract is**, rather than guessing
the schema. Start with the widest schema so every case reaches the API, characterize what passes
/ fails, then narrow the schema to match reality.

### Step 1 — Create the endpoint class with the WIDEST schema (red scaffold)

Add `stream/endpoints/<api>_<region>_<model>.ts`. Set pricing/region/regionalEndpoint, then
**temporarily override `configSchema` to the most permissive schema** (`inputConfigSchema`) so the
mixin's strict schema doesn't short-circuit cases before they hit the API:

```typescript
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";

export class AgentPlatformEuropeClaudeSonnetFourDotSixStream extends WithAnthropicClaudeSonnetFourDotSixConfig(
  AgentPlatformStream
) {
  // TDD scaffold — REMOVE before finishing. Widest schema so every test case
  // reaches the API instead of being caught by the mixin's strict union.
  static readonly configSchema = inputConfigSchema;

  static readonly tokenPricing = { /* from the provider's regional pricing page (link it) */ };
  static readonly region = "eu";
  static readonly regionalEndpoint = "europe-west1"; // agent-platform only
  static readonly id = this.buildId();
}
AgentPlatformEuropeClaudeSonnetFourDotSixStream satisfies StreamEndpointConstructor;
```

**Verify every model static against the official documentation** (`modelId`, `contextSize`,
`maxOutputTokens`, supported reasoning efforts, pricing) and leave a comment linking the page you
read — these values drift and a stale guess silently mis-prices or mis-truncates:

```typescript
// Verified against https://docs.anthropic.com/en/docs/about-claude/models/overview (2026-06-16)
static readonly contextSize = 1_000_000;
```

| Provider | Docs URL |
|----------|----------|
| OpenAI | `https://developers.openai.com/api/docs/models/{model-id}` |
| Anthropic | `https://docs.anthropic.com/en/docs/about-claude/models/overview` |
| Google | `https://ai.google.dev/gemini-api/docs/models` |
| Mistral | `https://docs.mistral.ai/getting-started/models/models_overview/` |

### Step 2 — Create the test file, every case `null`

Add `test/endpoints/<api>_<region>_<model>.test.ts`. Mirror the closest sibling endpoint test,
wiring the right credential, and set **every** case to `null` (run with default checkers):

```typescript
// @vitest-environment node
import { AgentPlatformEuropeClaudeSonnetFourDotSixStream } from "@app/lib/model_constructors/stream/endpoints/agent_platform_eu_claude_sonnet_four_dot_six";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

const setup: StreamSetup = {
  createInstance: () =>
    new AgentPlatformEuropeClaudeSonnetFourDotSixStream({
      AGENT_PLATFORM_PROJECT_ID: process.env.VERTEX_AI_PROJECT_ID ?? "",
    }),
  tests: {
    "simple/no-tools/t-default/r-default": null,
    // ... all the keys you intend to cover, each `null`
  },
};

runStreamEndpointTests(AgentPlatformEuropeClaudeSonnetFourDotSixStream, setup);
```

- `null` → the case runs with its `defaultCheckers` from `cases.ts`.
- A `ResponseChecker[]` → overrides those checkers (use for expected errors).
- Only keys present in `tests` run. Copy the sibling's full key set so coverage matches.

### Step 3 — Run RED: full suite against the live API

```bash
NODE_ENV=test RUN_LLM_TEST=true npm run test -- \
  --config lib/model_constructors/test/vite.config.js \
  lib/model_constructors/test/endpoints/<api>_<region>_<model>.test.ts
```

Add `--bail 1` to stop at the first failure, or `-t "<substring>"` to run a subset. The suite is
gated on `NODE_ENV=test` + `RUN_LLM_TEST=true` so CI never burns tokens. Per-case timeout is 20s.

### Step 4 — Characterize each failure

A failing case is the *last emitted event not matching the checker*. Sort failures into three
buckets:

1. **Real API error** — last event is `{ type: "error", content: { type: "invalid_request_error" | ... } }`
   with a provider message. Example we hit: adaptive thinking + `temperature` 0/0.1 →
   *"`temperature` may only be set to 1 when thinking is enabled or in adaptive mode."* The schema
   **must** prevent this (e.g. coerce `temperature → 1` when reasoning is adaptive). This is a real
   constraint, not a choice.
2. **Local schema rejection** — last event is `{ type: "error", content: { type: "input_configuration_error" }}`.
   This is *our* zod failing in `runStream` before any request. With the widest schema you should
   see almost none; if you do, the base/converter still rejects it.
3. **Accepted-but-you-might-not-want-it** — the case *succeeds* at the API. Example: on Anthropic,
   `minimal` reasoning and `forceTool` without `reasoning: none` both succeed (the converter
   degrades unsupported efforts and undefined reasoning to `thinking: { type: "disabled" }`).
   Whether to *reject* these is a **policy choice**, not an API limit — match the sibling endpoint
   for consistency ([GEN1]) unless there's a reason to diverge.

**The same case can land in different buckets per provider — characterize against the actual
endpoint, never assume from a sibling.** Worked example (Claude Sonnet 4.6 vs GPT-5.4, identical
test matrix):

| Case | Anthropic Sonnet 4.6 | OpenAI GPT-5.4 |
|------|----------------------|----------------|
| `minimal` effort | accepted, degrades to thinking-disabled (policy reject) | **real API error** — `'minimal' is not supported` (only none/low/medium/high/xhigh) |
| `maximal` effort | maps to native `max` | maps to native `xhigh` |
| `temperature` + reasoning | **must be `1`** — mixin coerces temp→1 | **must be absent** — mixin strips temp entirely (reasoning model) |
| `forceTool` without `reasoning: none` | **input error** (forced tool requires reasoning none) | accepted — normal tool call |

So three of four behaviors differ between two models of the same vintage. The widest-schema red run
is what tells you which; the schema then encodes *that* provider's contract.

**Inspect what was actually sent.** Set `debug: true` on the `StreamSetup` and re-run a narrowed
subset. `runStream` then writes four artifacts per case to the cwd:
`*_1_input.json` (payload+config), `*_2_payload.json` (the exact provider request),
`*_3_raw_output.json`, `*_4_converted_output.json`. Read `*_2_payload.json` to confirm how the
converter mapped your config (thinking config, tool_choice, temperature). **Delete the artifacts
and unset `debug` when done.**

### Step 5 — Narrow the schema + set expected outputs (green)

Now make the schema reflect the real contract:

- If the **model-config mixin's** schema already encodes the real contract (it usually does — e.g.
  it coerces `temperature → 1` for adaptive thinking and rejects `minimal`), then just **delete the
  Step 1 scaffold override** and let the mixin stand. Prefer this — it keeps sibling endpoints
  consistent ([GEN1]).
- If this endpoint's API genuinely differs from its siblings, write a dedicated `configSchema` on
  the endpoint (or a new model-config variant) that matches *this* API's behavior.

Then set expected outputs for the policy/known-error cases, e.g.:

```typescript
import { INPUT_CONFIGURATION_ERROR } from "@app/lib/model_constructors/test/cases";
// ...
"simple/no-tools/t-default/r-minimal": [INPUT_CONFIGURATION_ERROR],
"calc/calc/t-default/r-default/force-tool": [INPUT_CONFIGURATION_ERROR],
```

### Step 6 — Green run + cleanup

- Re-run the full suite → all cases pass.
- Confirm the Step 1 scaffold override is gone (`git diff` the endpoint file — ideally it matches
  the sibling's shape with only pricing/region/id differing).
- **If the model is reachable through multiple endpoints**, check whether the final `configSchema`
  can be mutualized one level up (into the model-config mixin or another shared spot) instead of
  living on each endpoint. Hoist it if so, then re-run the full suite to confirm nothing regressed.
- Remove any `debug: true` and stray `*_input.json` / `*_payload.json` / `*_output.json` artifacts.
- `npx tsgo --noEmit 2>&1 | grep -v node_modules` is clean; `npm run format:changed` from the repo root.

## Reference

### Available checkers (`test/cases.ts`)

| Checker | Asserts on the last event |
|---------|---------------------------|
| `SUCCESS` / `{ type: "success" }` | stream ended in success |
| `{ type: "error", contentType }` | error of that `ErrorType` (`INPUT_CONFIGURATION_ERROR` is the `input_configuration_error` shorthand) |
| `TOOL_CALL_CALCULATOR` / `{ type: "tool_call", name }` | aggregated events contain that tool call |
| `TEXT_CONTAINS_HI` / `{ type: "text_contains", value }` | last text block contains the substring |
| `HAS_REASONING` / `HAS_NO_REASONING` | reasoning present / absent in aggregated events |
| `VALID_OUTPUT_FORMAT` / `{ type: "valid_output_format", format }` | last text block is JSON matching the schema |

### Test-key matrix

Keys encode `<scenario>/<tools>/t-<temperature>/r-<reasoning>[/force-tool...]`. The full set lives
in `TEST_KEYS` in `cases.ts`; copy the relevant subset from the closest sibling endpoint test so
coverage is comparable. Reasoning efforts: `default | none | minimal | low | medium | high | maximal`.

### Gotchas

- **Schema shadowing**: only a `configSchema` defined on the endpoint class beats the model-config
  mixin. The client's/base's `configSchema` is dead once a mixin redefines it.
- **Converters can degrade silently**: some providers map unsupported reasoning efforts to a
  no-reasoning mode and *accept* them (Anthropic), while others hard-reject (OpenAI GPT-5.4 on
  `minimal`). Don't assume — characterize.
- **Reasoning ↔ temperature is provider-specific**: Anthropic needs `temperature: 1` with adaptive
  thinking (mixin coerces →1); OpenAI GPT-5.4 rejects any explicit temperature (mixin strips it).
  Each reasoning model's mixin encodes its own rule — copy the *mechanism* (transform in the
  model-config schema), not the value.
- **Don't leave the widest schema in.** It's a scaffold to discover the contract, removed in Step 5.
- **tsgo + SDK `.d.mts` noise**: the OpenAI/Metronome SDKs emit `node_modules/**/*.d.mts` parse
  errors under `tsgo` that are unrelated to your code. Check your work with
  `npx tsgo --noEmit 2>&1 | grep -v node_modules` — that should be empty.
- **CI safety**: never commit `runTest`-style always-on flags; the harness is already gated on
  `RUN_LLM_TEST`, and runs are local-only.

## Checklist

- [ ] Prerequisite mixins/types/client exist (or added first)
- [ ] Endpoint class added with pricing/region/id; scaffold widest `configSchema`
- [ ] Test file added, sibling key set, all `null`
- [ ] Red run hits the live API for every case
- [ ] Failures characterized (API error vs local rejection vs accepted-policy), payloads inspected with `debug`
- [ ] Schema narrowed (scaffold removed / mixin stands / bespoke schema), expected outputs set
- [ ] Green: full suite passes
- [ ] `debug` off, artifacts deleted, `tsgo` clean, formatted

## Related skills

- `dust-llm` — register a model in the legacy model system (config, pricing, registry, SDK types).
- `dust-test` — general Dust testing conventions.
- `claude-api` — Claude model ids, params, thinking/extended-thinking constraints.
