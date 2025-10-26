import type { AgentErrorCategory } from "@app/types";

const CONTEXT_WINDOW_EXCEEDED_TITLE = "Context window exceeded";
const CONTEXT_WINDOW_EXCEEDED_MESSAGE =
  "Your message or retrieved data is too large. " +
  "Break your request into smaller parts or reduce agent output.";

/**
 * Get a user-friendly error message from an API error.
 * This function handles various error cases from different model providers (Anthropic, OpenAI)
 * and returns appropriate messages that can be shown to end users.
 *
 * For a full list of possible errors and their frequency, see:
 * https://app.datadoghq.eu/logs?query=%40error.code%3Amulti_actions_error%20message%3A%22Error%20running%20multi-actions%20agent.%22
 *
 * Common error cases handled:
 * - Anthropic overload/503 errors
 * - Context window exceeded (both providers)
 * - Internal server errors (both providers)
 * - Invalid response format configuration
 * - Streaming errors
 *
 * @param error - The error object containing message and type
 **/
export const categorizeAgentErrorMessage = (error: {
  message: string;
  code: string;
}): {
  category: AgentErrorCategory;
  errorTitle: string;
  publicMessage: string;
} => {
  if (error.code === "multi_actions_error") {
    if (error.message.includes("AnthropicError")) {
      if (
        error.message.includes("overloaded_error") ||
        error.message.includes("503 Service Unavailable")
      ) {
        return {
          category: "retryable_model_error",
          errorTitle: "Anthropic service disruption",
          publicMessage:
            "Anthropic is currently experiencing issues and cannot process requests for " +
            "this model. You can temporarily switch to a different model such as GPT-4.1.",
        };
      } else if (
        error.message.includes("at least one message is required") ||
        error.message.includes("exceed context limit")
      ) {
        return {
          category: "context_window_exceeded",
          errorTitle: CONTEXT_WINDOW_EXCEEDED_TITLE,
          publicMessage: CONTEXT_WINDOW_EXCEEDED_MESSAGE,
        };
      } else if (error.message.includes("Internal server error")) {
        return {
          category: "provider_internal_error",
          errorTitle: "Anthropic server error",
          publicMessage:
            "Anthropic (Claude's provider) encountered an error. Please try again.",
        };
      }
    } else if (
      error.message.includes("OpenAIError") ||
      error.message.includes("OpenAI: Response failed")
    ) {
      if (error.message.includes("maximum context length")) {
        return {
          category: "context_window_exceeded",
          errorTitle: CONTEXT_WINDOW_EXCEEDED_TITLE,
          publicMessage: CONTEXT_WINDOW_EXCEEDED_MESSAGE,
        };
      } else if (error.message.includes("Invalid schema for response_format")) {
        const contextPart = error.message.split("In context=")[1];
        return {
          category: "invalid_response_format_configuration",
          errorTitle: "Invalid response format",
          publicMessage:
            "Your agent is configured to return a response in a format that is not supported by " +
            `the model: ${contextPart}. Please update your agent configuration in Instructions > ` +
            "Advanced Settings > Structured Response Format.",
        };
      } else if (error.message.includes("server_error")) {
        return {
          category: "provider_internal_error",
          errorTitle: "OpenAI server error",
          publicMessage: "OpenAI encountered an error. Please try again.",
        };
      } else if (
        error.message.includes(
          "An error occurred while processing your request."
        ) &&
        error.message.includes(
          "contact us through our help center at help.openai.com if the error persists"
        )
      ) {
        return {
          category: "retryable_model_error",
          errorTitle: "OpenAI server error",
          publicMessage: "OpenAI encountered an error. Please try again.",
        };
      }
    } else if (
      error.message.includes("Error streaming chunks") ||
      error.message.includes("Error parsing error")
    ) {
      return {
        category: "stream_error",
        errorTitle: "Streaming error",
        publicMessage:
          "Connection interrupted while receiving your answer. Please try again.",
      };
    }
  }
  // The original message is used as a fallback.
  return {
    category: "unknown_error",
    errorTitle: "Agent error",
    publicMessage: `Error running agent: [${error.code}] ${error.message}`,
  };
};

/**
 * Get a user-friendly error message from a conversation render error.
 *
 * Only use-case so far is when the context window is exceeded.
 */
export const categorizeConversationRenderErrorMessage = (error: {
  message: string;
}): {
  category: "context_window_exceeded";
  errorTitle: string;
  publicMessage: string;
} | null => {
  if (error.message.includes("Context window exceeded")) {
    return {
      category: "context_window_exceeded",
      errorTitle: CONTEXT_WINDOW_EXCEEDED_TITLE,
      publicMessage: CONTEXT_WINDOW_EXCEEDED_MESSAGE,
    };
  }

  return null;
};
