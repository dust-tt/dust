import { z } from "zod";
import { ValidationError } from "./errors";
import { logger } from "./logger";

/**
 * Supported AI provider types
 */
export type Provider = "openai" | "anthropic";

/**
 * Interface for AI model configuration
 */
export interface ModelConfig {
  /** The AI provider (openai, anthropic) */
  provider: Provider;
  /** The model name to use */
  model: string;
  /** API key for the provider */
  apiKey: string;
  /** Maximum tokens to generate (defaults based on provider) */
  maxTokens?: number;
  /** Temperature setting for generation (defaults based on provider) */
  temperature?: number;
}

/**
 * Supported OpenAI models
 */
export const OPENAI_MODELS = [
  "gpt-4o",
  "gpt-4-turbo",
  "gpt-4",
  "gpt-3.5-turbo",
] as const;

/**
 * Supported Anthropic models
 */
export const ANTHROPIC_MODELS = [
  // Latest models
  "claude-3-7-sonnet-20250219",
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  // Previous models
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "claude-3-haiku-20240307",
] as const;

/**
 * Zod schema for validating OpenAI models
 */
const openAIModelSchema = z.enum(OPENAI_MODELS);

/**
 * Zod schema for validating Anthropic models
 */
const anthropicModelSchema = z.enum(ANTHROPIC_MODELS);

/**
 * Default configuration values for each provider
 */
export const DEFAULT_CONFIGS: Record<Provider, Omit<ModelConfig, "apiKey">> = {
  openai: {
    provider: "openai",
    model: "gpt-4o",
    temperature: 0.0,
    maxTokens: 4096,
  },
  anthropic: {
    provider: "anthropic",
    model: "claude-3-7-sonnet-20250219", // Updated to latest model
    temperature: 0.0,
    maxTokens: 4096,
  },
};

/**
 * Loads model configuration from environment variables with sensible defaults
 * @returns A validated ModelConfig object
 */
export function loadModelConfig(): ModelConfig {
  // Determine provider from environment variable or default to OpenAI
  const provider = (process.env.AI_PROVIDER?.toLowerCase() || "openai") as Provider;
  
  if (provider !== "openai" && provider !== "anthropic") {
    throw new ValidationError(`Invalid AI provider: ${provider}. Must be one of: openai, anthropic`)
      .addContext({
        supportedProviders: ["openai", "anthropic"],
        providedValue: provider
      });
  }
  
  // Get API key based on provider
  const apiKey = provider === "openai" 
    ? process.env.OPENAI_API_KEY 
    : process.env.ANTHROPIC_API_KEY;
  
  if (!apiKey) {
    throw new ValidationError(`Missing API key for ${provider}`)
      .addContext({
        provider,
        requiredEnvVar: provider === "openai" ? "OPENAI_API_KEY" : "ANTHROPIC_API_KEY"
      });
  }
  
  // Get model from environment variable or use default
  const modelFromEnv = process.env.AI_MODEL;
  let model: string;
  
  // Validate model based on provider
  if (modelFromEnv) {
    if (provider === "openai") {
      const result = openAIModelSchema.safeParse(modelFromEnv);
      if (!result.success) {
        logger.warn(`Invalid OpenAI model: ${modelFromEnv}. Using default: ${DEFAULT_CONFIGS.openai.model}`);
        model = DEFAULT_CONFIGS.openai.model;
      } else {
        model = result.data;
      }
    } else {
      const result = anthropicModelSchema.safeParse(modelFromEnv);
      if (!result.success) {
        logger.warn(`Invalid Anthropic model: ${modelFromEnv}. Using default: ${DEFAULT_CONFIGS.anthropic.model}`);
        model = DEFAULT_CONFIGS.anthropic.model;
      } else {
        model = result.data;
      }
    }
  } else {
    // Use default model for the provider
    model = DEFAULT_CONFIGS[provider].model;
  }
  
  // Parse temperature if provided
  const temperatureFromEnv = process.env.AI_TEMPERATURE 
    ? parseFloat(process.env.AI_TEMPERATURE) 
    : undefined;
  
  const temperature = temperatureFromEnv !== undefined
    ? Math.max(0, Math.min(1, temperatureFromEnv)) // Clamp between 0 and 1
    : DEFAULT_CONFIGS[provider].temperature;
  
  // Parse max tokens if provided
  const maxTokensFromEnv = process.env.AI_MAX_TOKENS 
    ? parseInt(process.env.AI_MAX_TOKENS, 10) 
    : undefined;
  
  const maxTokens = maxTokensFromEnv !== undefined && !isNaN(maxTokensFromEnv)
    ? maxTokensFromEnv
    : DEFAULT_CONFIGS[provider].maxTokens;
  
  return {
    provider,
    model,
    apiKey,
    temperature,
    maxTokens,
  };
}