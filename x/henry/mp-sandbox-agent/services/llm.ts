import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { type ModelConfig, type Provider } from "../utils/config";
import { type ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { APIError } from "../utils/errors";
import { logger } from "../utils/logger";

/**
 * Message format common across different providers
 */
export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Response format from LLM providers
 */
export interface LLMResponse {
  content: string;
  totalTokens?: number;
}

/**
 * Service for interacting with various LLM providers
 */
export class LLMService {
  private config: ModelConfig;
  private openaiClient?: OpenAI;
  private anthropicClient?: Anthropic;

  constructor(config: ModelConfig) {
    this.config = config;

    // Initialize the appropriate client based on provider
    if (config.provider === "openai") {
      this.openaiClient = new OpenAI({ apiKey: config.apiKey });
    } else if (config.provider === "anthropic") {
      this.anthropicClient = new Anthropic({ apiKey: config.apiKey });
    }
  }

  /**
   * Converts our internal message format to OpenAI's format
   */
  private toOpenAIMessages(messages: Message[]): ChatCompletionMessageParam[] {
    return messages.map(message => ({
      role: message.role,
      content: message.content,
    }));
  }

  /**
   * Converts our internal message format to Anthropic's format
   */
  private toAnthropicMessages(messages: Message[]): Anthropic.Messages.MessageParam[] {
    // Anthropic requires system message to be separate from the conversation
    const systemMessage = messages.find(m => m.role === "system");
    const nonSystemMessages = messages.filter(m => m.role !== "system");
    
    const anthropicMessages: Anthropic.Messages.MessageParam[] = nonSystemMessages.map(message => ({
      role: message.role === "user" ? "user" : "assistant",
      content: message.content,
    }));
    
    return anthropicMessages;
  }

  /**
   * Generate a completion from the selected LLM provider
   */
  async generateCompletion(messages: Message[]): Promise<LLMResponse> {
    try {
      if (this.config.provider === "openai") {
        return await this.generateOpenAICompletion(messages);
      } else if (this.config.provider === "anthropic") {
        return await this.generateAnthropicCompletion(messages);
      } else {
        throw new APIError(`Unsupported provider: ${this.config.provider}`)
          .addContext({ supportedProviders: ["openai", "anthropic"] });
      }
    } catch (error) {
      // Enhance error reporting with provider-specific details
      throw new APIError(
        `Failed to generate response from ${this.config.provider}`,
        error instanceof Error && 'status' in error ? (error as any).status : undefined,
        { cause: error instanceof Error ? error : undefined }
      ).addContext({
        provider: this.config.provider,
        model: this.config.model,
        messageCount: messages.length,
      });
    }
  }

  /**
   * Generate a completion using OpenAI
   */
  private async generateOpenAICompletion(messages: Message[]): Promise<LLMResponse> {
    if (!this.openaiClient) {
      throw new APIError("OpenAI client not initialized")
        .addContext({ provider: "openai" });
    }

    const openaiMessages = this.toOpenAIMessages(messages);
    
    logger.debug(`Sending request to OpenAI with model: ${this.config.model}`);
    const response = await this.openaiClient.chat.completions.create({
      model: this.config.model,
      messages: openaiMessages,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
    });

    if (!response.choices[0].message.content) {
      throw new APIError("OpenAI returned empty response content")
        .addContext({
          responseId: response.id,
          model: this.config.model
        });
    }

    return {
      content: response.choices[0].message.content,
      totalTokens: response.usage?.total_tokens,
    };
  }

  /**
   * Generate a completion using Anthropic
   */
  private async generateAnthropicCompletion(messages: Message[]): Promise<LLMResponse> {
    if (!this.anthropicClient) {
      throw new APIError("Anthropic client not initialized")
        .addContext({ provider: "anthropic" });
    }

    // Find system message
    const systemMessage = messages.find(m => m.role === "system")?.content || "";
    const anthropicMessages = this.toAnthropicMessages(messages);
    
    logger.debug(`Sending request to Anthropic with model: ${this.config.model}`);
    const response = await this.anthropicClient.messages.create({
      model: this.config.model,
      messages: anthropicMessages,
      system: systemMessage,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens || 4096,
    });

    // Check for text content in the first content block
    const content = response.content[0];
    if (!content || !('text' in content)) {
      throw new APIError("Anthropic returned empty or invalid response content")
        .addContext({
          responseId: response.id,
          model: this.config.model,
          contentType: content ? typeof content : 'undefined'
        });
    }

    return {
      content: content.text,
      totalTokens: response.usage?.input_tokens + response.usage?.output_tokens,
    };
  }
}