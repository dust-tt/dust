// Maximum depth of recursive run_agent calls (a conversation triggering another
// conversation). Guards against unbounded recursion.
export const MAX_CONVERSATION_DEPTH = 4;

export const EXTENSION_MESSAGE_SOURCE_LABEL = "Browser extension";
