---
name: dust-llm
description: Step-by-step guide for adding support for a new LLM in Dust. Use when adding a new model, or updating a previous one.
---

# Adding Support for a New LLM Model

This skill guides you through adding support for a newly released LLM.

## Quick Reference

### Files to Modify

| File | Purpose |
|------|---------|
| `front/types/assistant/models/{provider}.ts` | Model ID + configuration |
| `front/lib/api/assistant/token_pricing.ts` | Pricing per million tokens |
| `front/types/assistant/models/models.ts` | Central registry |
| `front/lib/api/llm/clients/{provider}/types.ts` | Router whitelist |
| `sdks/js/src/types.ts` | SDK types |
| `front/components/providers/types.ts` | UI availability (optional) |
| `front/lib/api/llm/tests/llm.test.ts` | Integration tests |

### Prerequisites

Before adding, gather:
- **Model ID**: Exact provider identifier (e.g., `gpt-4-turbo-2024-04-09`)
- **Context size**: Total context window in tokens
- **Pricing**: Input/output cost per million tokens
- **Capabilities**: Vision, structured output, reasoning effort levels
- **Tokenizer**: Compatible tokenizer for token counting

## Step-by-Step: Adding an OpenAI Model

### Step 1: Add Model Configuration

Edit `front/types/assistant/models/openai.ts`:

```typescript
export const GPT_4_TURBO_2024_04_09_MODEL_ID = "gpt-4-turbo-2024-04-09" as const;

export const GPT_4_TURBO_2024_04_09_MODEL_CONFIG: ModelConfigurationType = {
  providerId: "openai",
  modelId: GPT_4_TURBO_2024_04_09_MODEL_ID,
  displayName: "GPT 4 turbo",
  contextSize: 128_000,
  recommendedTopK: 32,
  recommendedExhaustiveTopK: 64,
  largeModel: true,
  description: "OpenAI's GPT 4 Turbo model for complex tasks (128k context).",
  shortDescription: "OpenAI's second best model.",
  isLegacy: false,
  isLatest: false,
  generationTokensCount: 2048,
  supportsVision: true,
  minimumReasoningEffort: "none",
  maximumReasoningEffort: "none",
  defaultReasoningEffort: "none",
  supportsResponseFormat: false,
  tokenizer: { type: "tiktoken", base: "cl100k_base" },
};
```

### Step 2: Add Pricing

Edit `front/lib/api/assistant/token_pricing.ts`:

```typescript
const CURRENT_MODEL_PRICING: Record<BaseModelIdType, PricingEntry> = {
  // ... existing
  "gpt-4-turbo-2024-04-09": {
    input: 10.0,  // USD per million input tokens
    output: 30.0, // USD per million output tokens
    cache_read_input_tokens: 1.0,      // Optional: cached reads
    cache_creation_input_tokens: 12.5, // Optional: cache creation
  },
};
```

### Step 3: Register in Central Registry

Edit `front/types/assistant/models/models.ts`:

```typescript
export const MODEL_IDS = [
  // ... existing
  GPT_4_TURBO_2024_04_09_MODEL_ID,
] as const;

export const SUPPORTED_MODEL_CONFIGS: ModelConfigurationType[] = [
  // ... existing
  GPT_4_TURBO_2024_04_09_MODEL_CONFIG,
];
```

### Step 4: Update Router Whitelist

Edit `front/lib/api/llm/clients/openai/types.ts`:

```typescript
export const OPENAI_WHITELISTED_MODEL_IDS = [
  // ... existing
  GPT_4_TURBO_2024_04_09_MODEL_ID,
] as const;
```

### Step 5: Update SDK Types

Edit `sdks/js/src/types.ts`:

```typescript
const ModelLLMIdSchema = FlexibleEnumSchema<
  // ... existing
  | "gpt-4-turbo-2024-04-09"
>();
```

### Step 6: Add to UI (Optional)

Edit `front/components/providers/types.ts`:

```typescript
export const USED_MODEL_CONFIGS: readonly ModelConfig[] = [
  // ... existing
  GPT_4_TURBO_2024_04_09_MODEL_CONFIG,
] as const;
```

### Step 7: Test (Mandatory)

Edit `front/lib/api/llm/tests/llm.test.ts`:

```typescript
const MODELS = {
  // ... existing
  [GPT_4_TURBO_2024_04_09_MODEL_ID]: {
    runTest: true,  // Enable for testing
    providerId: "openai",
  },
};
```

Run test:
```bash
RUN_LLM_TEST=true npx vitest --config lib/api/llm/tests/vite.config.js lib/api/llm/tests/llm.test.ts --run
```

**After test passes**, set `runTest: false` to avoid expensive CI runs.

## Adding Anthropic Models

Same pattern with Anthropic-specific files:

1. `front/types/assistant/models/anthropic.ts` - Add `CLAUDE_X_MODEL_ID` and config
2. `front/lib/api/llm/clients/anthropic/types.ts` - Add to `ANTHROPIC_WHITELISTED_MODEL_IDS`
3. `front/types/assistant/models/models.ts` - Register in central registry
4. `front/lib/api/assistant/token_pricing.ts` - Add pricing
5. `sdks/js/src/types.ts` - Update SDK types
6. Test and validate

## Model Configuration Properties

| Property | Description |
|----------|-------------|
| `supportsVision` | Can process images |
| `supportsResponseFormat` | Supports structured output (JSON) |
| `minimumReasoningEffort` | Min reasoning level ("none", "low", "medium", "high") |
| `maximumReasoningEffort` | Max reasoning level |
| `defaultReasoningEffort` | Default reasoning level |
| `tokenizer` | Tokenizer config for token counting |

## Validation Checklist

- [ ] Model config added to provider file
- [ ] Pricing updated (input, output, cache if applicable)
- [ ] Registered in central registry (`MODEL_IDS` + `SUPPORTED_MODEL_CONFIGS`)
- [ ] Router whitelist updated
- [ ] SDK types updated
- [ ] UI config added (if needed)
- [ ] Integration test passes
- [ ] Test disabled after validation

## Troubleshooting

**Model not in UI**: Check `USED_MODEL_CONFIGS` in `front/components/providers/types.ts`

**API calls failing**: Verify model ID matches provider's exact identifier, check router whitelist

**Token counting errors**: Validate context size and tokenizer configuration

**Pricing issues**: Ensure prices are per million tokens in USD

## Reference

- See `front/types/assistant/models/openai.ts` and `anthropic.ts` for examples
- Provider docs: OpenAI, Anthropic, Google, Mistral
