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
export const getPublicErrorMessage = (error: {
  message: string;
  type: string;
}): string => {
  if (error.type == "multi_actions_error") {
    if (error.message.includes("AnthropicError")) {
      if (
        error.message.includes("overloaded_error") ||
        error.message.includes("503 Service Unavailable")
      ) {
        return "Anthropic (provider of Claude) is currently overloaded. Please try again later.";
      } else if (
        error.message.includes("at least one message is required") ||
        error.message.includes("exceed context limit")
      ) {
        return "Your conversation content is too big and has exceeded the context window of the model. Try to reduce the amount of data you are sending or start a new conversation.";
      } else if (error.message.includes("Internal server error")) {
        return "Anthropic (provider of Claude) encountered an internal server error. Please try again.";
      }
    } else if (error.message.includes("OpenAIError")) {
      if (error.message.includes("maximum context length")) {
        return "Your conversation content is too big and has exceeded the context window of the model. Try to reduce the amount of data you are sending or start a new conversation.";
      } else if (error.message.includes("Invalid schema for response_format")) {
        const contextPart = error.message.split("In context=")[1];
        return `Your agent is configured to return a response in a format that is not supported by the model: ${contextPart}. Please update your agent configuration in Instructions > Advanced Settings > Structured Response Format.`;
      } else if (error.message.includes("server_error")) {
        return "OpenAI (provider of GPT) encountered an internal server error. Please try again.";
      }
    } else if (error.message.includes("Error streaming chunks")) {
      return "There was an error streaming the answer to your query. Please try again.";
    }
  }
  // Original message is used as a fallback.
  return `Error running agent: [${error.type}] ${error.message}`;
};
