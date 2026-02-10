import type { AnthropicModel } from "@/providers/anthropic/types";
import type { OpenAIModel } from "@/providers/openai/types";

export type Model = OpenAIModel | AnthropicModel;
