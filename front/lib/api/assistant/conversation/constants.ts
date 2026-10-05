// Maximum depth of recursive run_agent calls (a conversation triggering another
// conversation). Guards against unbounded recursion.
export const MAX_CONVERSATION_DEPTH = 4;

// Conversation titles are stored on the conversation and copied onto audit-log
// targets. Cap them so a PATCH (or an LLM-generated title) cannot skip audit
// emission by overflowing the WorkOS payload limit.
export const MAX_CONVERSATION_TITLE_LENGTH = 512;
