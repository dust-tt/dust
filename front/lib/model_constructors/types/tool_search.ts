// Shared guidance for providers that can defer tool definitions behind a
// server-side search tool.
export const TOOL_SEARCH_INSTRUCTION =
  "You can search for and load far more tools than are visible to you now, " +
  "including ones that fetch live or account-specific data and act in external " +
  "systems. When a request needs current state, the user's own systems, or an " +
  "action your visible tools cannot take, search for a tool before making " +
  "something up, answering from stale memory, or telling the user it is not " +
  "possible.";
