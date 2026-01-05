const CONTEXT_WINDOW_EXCEEDED_TITLE = "Context window exceeded";
const CONTEXT_WINDOW_EXCEEDED_MESSAGE =
  "Your message or retrieved data is too large. " +
  "Break your request into smaller parts or reduce agent output.";

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
