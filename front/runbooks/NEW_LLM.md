# LLM Model Runbook: Adding Support for a New AI Model

This runbook provides step-by-step instructions for adding support to a newly released LLM in the Dust codebase and integrating it into the application.

---

## Prerequisites

### Model Provider Information

Before adding a new model, ensure you have:

- **Model ID**: The exact identifier used by the provider (e.g., `gpt-4-turbo-2024-04-09`)
- **Model Configuration**: Context window size, capabilities, pricing information (check provider documentation)
- **Tokenizer Information**: Compatible tokenizer for accurate token counting (check provider documentation)
- **Provider API Access**: Credentials and API endpoint access
- **Model Specifications**: Input/output token limits, supported features

### Environment Setup

Model configurations are managed across multiple services:

- **Front**: Model definitions, pricing, UI configuration
- **Core**: Token counting
- **SDKs**: Shared types for API compatibility

---

## Overview of Current Architecture

### Key Files Structure

Model support requires changes across these key areas:

```
front/
├── types/assistant/models/
│   ├── openai.ts              # OpenAI-specific model configurations
│   ├── anthropic.ts           # Anthropic-specific model configurations
│   ├── models.ts              # Central model registry
│   └── ...                    # Other provider files
├── lib/api/assistant/
│   └── token_pricing.ts       # Token pricing information
├── lib/api/llm/clients/
│   └── openai/types.ts        # Provider client type definitions
├── components/providers/
│   └── types.ts               # UI model configurations
└── lib/api/llm/tests/
    └── llm.test.ts            # Model validation tests

sdks/js/src/
└── types.ts                   # Shared type definitions

core/
└── src/providers/
    └── ...                    # Core LLM execution logic
```

---

## Step-by-Step: Adding a New OpenAI Model

### Step 1: Add Model Configuration

Add the model configuration in [front/types/assistant/models/openai.ts](front/types/assistant/models/openai.ts):

```typescript
// Add model ID constant
export const GPT_4_TURBO_2024_04_09_MODEL_ID =
  "gpt-4-turbo-2024-04-09" as const;

// Add model configuration
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

**Model Configuration Properties:**

- `providerId`: Provider identifier (e.g., "openai", "anthropic")
- `modelId`: Exact model identifier used by the provider
- `displayName`: Human-readable name for UI display
- `contextSize`: Total context window size in tokens
- `recommendedTopK`: Recommended number of top documents for retrieval
- `recommendedExhaustiveTopK`: Maximum number of documents for exhaustive retrieval
- `largeModel`: Boolean indicating if this is a large/expensive model
- `description`: Full description of model capabilities and use cases
- `shortDescription`: Brief description for UI tooltips
- `isLegacy`: Whether this is a legacy model (affects UI display)
- `isLatest`: Whether this is the latest/newest model from provider
- `generationTokensCount`: Maximum output tokens for generation
- `supportsVision`: **Important:** Whether model can process images/vision tasks
- `minimumReasoningEffort`: **Important:** Minimum reasoning effort level ("none", "low", "medium", "high")
- `maximumReasoningEffort`: **Important:** Maximum reasoning effort level ("none", "low", "medium", "high")
- `defaultReasoningEffort`: **Important:** Default reasoning effort level ("none", "low", "medium", "high")
- `supportsResponseFormat`: **Important:** Whether model supports structured output formats (JSON, etc.)
- `tokenizer`: **Important:** Tokenizer configuration for accurate token counting ({ type: "tiktoken", base: "cl100k_base" })

### Step 2: Add Pricing Information

Update token pricing in [front/lib/api/assistant/token_pricing.ts](front/lib/api/assistant/token_pricing.ts):

```typescript
const CURRENT_MODEL_PRICING: Record<BaseModelIdType, PricingEntry> = {
  // ... existing pricing
  "gpt-4-turbo-2024-04-09": {
    input: 10.0, // Price per million input tokens in USD
    output: 30.0, // Price per million output tokens in USD
    cache_read_input_tokens: 1.0, // Optional: Price per million cached input tokens read
    cache_creation_input_tokens: 12.5, // Optional: Price per million tokens when creating cache
  },
};
```

**Pricing Guidelines:**

- Prices are per **million tokens** in USD (not per individual token)
- Check provider documentation for current pricing
- Input and output tokens often have different prices
- **Cached token pricing** (optional):
  - `cache_read_input_tokens`: Cost per million tokens when reading from cache (typically much cheaper than regular input)
  - `cache_creation_input_tokens`: Cost per million tokens when writing/creating cache entries (typically slightly more expensive than regular input)
  - Used by providers like Anthropic and some OpenAI models for prompt caching features
  - If not specified, defaults to regular input pricing

### Step 3: Register Model in Central Registry

Add model support in [front/types/assistant/models/models.ts](front/types/assistant/models/models.ts):

```typescript
// Add the model ID to the MODEL_IDS array
export const MODEL_IDS = [
  // ... existing model IDs
  GPT_4_TURBO_2024_04_09_MODEL_ID, // Add your new model ID here
  // ... other model IDs
] as const;

// Add the model configuration to SUPPORTED_MODEL_CONFIGS array
export const SUPPORTED_MODEL_CONFIGS: ModelConfigurationType[] = [
  // ... existing configurations
  GPT_4_TURBO_2024_04_09_MODEL_CONFIG, // Add your model config here
  // ... other configurations
];
```

### Step 4: Update LLM Router Types

Whitelist the model in the provider client types [front/lib/api/llm/clients/openai/types.ts](front/lib/api/llm/clients/openai/types.ts):

```typescript
export const OPENAI_WHITELISTED_MODEL_IDS = [
  // ... existing models
  GPT_4_TURBO_2024_04_09_MODEL_ID,
] as const;
```

**Important:** The router validates models against this list. Models not included here cannot be used for inference.

### Step 5: Update SDK Types

Add the model to the schema in [sdks/js/src/types.ts](sdks/js/src/types.ts):

```typescript
const ModelLLMIdSchema = FlexibleEnumSchema<// ... existing model IDs
"gpt-4-turbo-2024-04-09">(); // Add your new model ID here
// ... other model IDs
```

**SDK Guidelines:**

- SDK types are shared between front and connectors
- Changes here affect public API compatibility
- Use exact model ID strings, not computed values

---

## Step-by-Step: Adding Agent Builder Support (Optional)

If you want the model available in the agent builder UI:

### Step 1: Add to UI Model Configurations

Update [front/components/providers/types.ts](front/components/providers/types.ts):

```typescript
export const USED_MODEL_CONFIGS: readonly ModelConfig[] = [
  // ... existing UI models
  GPT_4_TURBO_2024_04_09_MODEL_CONFIG,
] as const;
```

**UI Configuration:**

- Simply add your model configuration constant to the `USED_MODEL_CONFIGS` array
- The model configuration already contains all necessary UI properties (displayName, description, etc.)
- No need to duplicate configuration - just reference the exported model config

---

## Step-by-Step: Testing the Model (MANDATORY)

### Step 1: Add Test Configuration

First, make sure to import your new model ID at the top of [front/lib/api/llm/tests/llm.test.ts](front/lib/api/llm/tests/llm.test.ts), then add model information:

```typescript
const MODELS: Record<
  | OpenAIWhitelistedModelId
  | AnthropicWhitelistedModelId
  | GoogleAIStudioWhitelistedModelId
  | MistralWhitelistedModelId,
  { runTest: boolean; providerId: ModelProviderIdType }
> = {
  // ... existing models
  [GPT_4_TURBO_2024_04_09_MODEL_ID]: {
    runTest: true, // IMPORTANT: Set to true for initial testing
    providerId: "openai",
  },
};
```

### Step 2: Run the Test

Execute the LLM test to validate the model configuration:

```bash
RUN_LLM_TEST=true npx vitest --config lib/api/llm/tests/vite.config.js lib/api/llm/tests/llm.test.ts --run
```

**What the test validates:**

- Model API connectivity
- Token counting accuracy
- Response format compliance
- Error handling

### Step 3: Disable Test After Validation

**IMPORTANT:** Once the test passes, set `runTest: false` to avoid running expensive tests in CI:

```typescript
const MODELS: Record<
  | OpenAIWhitelistedModelId
  | AnthropicWhitelistedModelId
  | GoogleAIStudioWhitelistedModelId
  | MistralWhitelistedModelId,
  { runTest: boolean; providerId: ModelProviderIdType }
> = {
  // ... existing models
  [GPT_4_TURBO_2024_04_09_MODEL_ID]: {
    runTest: false, // Set back to false after successful test
    providerId: "openai",
  },
};
```

---

## Step-by-Step: Adding Models from Other Providers

### Anthropic Models

Follow the same pattern but update Anthropic-specific files:

1. **Model Config**: Add `CLAUDE_X_MODEL_ID` and `CLAUDE_X_MODEL_CONFIG` to [front/types/assistant/models/anthropic.ts](front/types/assistant/models/anthropic.ts)
2. **Router Types**: Add the model ID to `ANTHROPIC_WHITELISTED_MODEL_IDS` array in [front/lib/api/llm/clients/anthropic/types.ts](front/lib/api/llm/clients/anthropic/types.ts)
3. **Central Registry**: Add to `MODEL_IDS` and `SUPPORTED_MODEL_CONFIGS` in [front/types/assistant/models/models.ts](front/types/assistant/models/models.ts)
4. **Pricing**: Add to `CURRENT_MODEL_PRICING` in [front/lib/api/assistant/token_pricing.ts](front/lib/api/assistant/token_pricing.ts)
5. **SDK Types**: Add string literal to `ModelLLMIdSchema` in [sdks/js/src/types.ts](sdks/js/src/types.ts)
6. **Tests**: Add to `MODELS` configuration in [front/lib/api/llm/tests/llm.test.ts](front/lib/api/llm/tests/llm.test.ts)

### Other Providers

For providers like Google, Mistral, or others:

1. Create new provider-specific files in `front/types/assistant/models/`
2. Add router support in `front/lib/api/llm/clients/`
3. Update central registries and pricing
4. Add comprehensive test coverage

---

## Best Practices

### 1. Model ID Naming

**Use provider's exact model identifiers:**

```typescript
// Good: Use the imported constant
GPT_4_TURBO_2024_04_09_MODEL_ID;

// Bad: Hardcoded string
("gpt-4-turbo-2024-04-09");

// Also bad: Custom naming
("gpt4-turbo");
```

### 2. Pricing Updates

**Regularly verify pricing information:**

- Check provider documentation for current rates
- Monitor for pricing changes that could affect costs
- Consider adding pricing update dates in comments

### 3. Capability Documentation

**Document model capabilities clearly in the model configuration:**

```typescript
export const GPT_4_TURBO_2024_04_09_MODEL_CONFIG: ModelConfigurationType = {
  // ... other properties
  supportsVision: true, // Image understanding
  supportsResponseFormat: true, // Structured output (JSON, etc.)
  // Note: All models support chat and function calling by default
};
```

### 4. Context Window Management

**Set appropriate context sizes:**

- Use exact values from provider documentation
- Consider practical limits vs theoretical maximums
- Account for output token reserves

### 5. Testing Strategy

**Test thoroughly before production:**

- Run integration tests with real API calls
- Validate token counting accuracy
- Test error handling and rate limiting
- Verify pricing calculations

---

## Validation Checklist

Before marking model integration complete:

- [ ] Model configuration added to provider-specific file
- [ ] Pricing information updated
- [ ] Model registered in central registry
- [ ] Router types updated to whitelist model
- [ ] SDK types updated
- [ ] UI configuration added (if supporting agent builder)
- [ ] Integration test passes with `runTest: true`
- [ ] Test disabled with `runTest: false` after validation
- [ ] Code linted and formatted
- [ ] Documentation updated

---

## Troubleshooting

### Common Issues

**Model not available in UI:**

- Check `USED_MODEL_CONFIGS` in [front/components/providers/types.ts](front/components/providers/types.ts)
- Verify model is included in central registry

**API calls failing:**

- Ensure model ID matches provider's exact identifier
- Check router types whitelist configuration
- Verify API credentials and permissions

**Token counting errors:**

- Validate context window sizes in model config
- Check input/output token limits
- Review tokenizer compatibility

**Pricing calculation issues:**

- Verify pricing values in token_pricing.ts
- Check for input vs output token price differences
- Ensure pricing uses correct decimal places

---

## Additional Resources

- **OpenAI Models**: https://platform.openai.com/docs/models
- **Anthropic Models**: https://docs.anthropic.com/en/docs/models-overview
- **Model Pricing**: Check provider documentation for current rates
- **Token Limits**: Provider documentation for context windows and limits

## Examples in Codebase

See existing model configurations:

- [front/types/assistant/models/openai.ts](front/types/assistant/models/openai.ts)
- [front/types/assistant/models/anthropic.ts](front/types/assistant/models/anthropic.ts)
- [front/lib/api/llm/tests/llm.test.ts](front/lib/api/llm/tests/llm.test.ts)
