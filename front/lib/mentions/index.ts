/**
 * Centralized mention handling module.
 *
 * This module provides a unified API for working with mentions across
 * the Dust application, including types, formatting, UI components,
 * editor integration, and markdown rendering.
 *
 * Usage:
 *   import { RichMention, mentionFormat, MentionDisplay } from "@app/lib/mentions";
 */

// Format utilities
export {
  extractFromEditorJSON,
  // TODO(rcs): remove this indirection
  serializeMention as mentionAgent,
  mentionFormat,
  parseMentions,
  // TODO(rcs): remove this indirection
  replaceMentionsWithAt as replaceMentionsByAt,
} from "./format";

// UI components
export { MentionDisplay } from "./ui/MentionDisplay";
export { MentionDropdown } from "./ui/MentionDropdown";

// Editor utilities
export {
  filterAgentSuggestions,
  filterUserSuggestions,
  mentionSuggestions,
} from "./editor/suggestion";
export { editorMentionUtils } from "./editor/utils";

// Markdown plugins
export {
  agentMentionDirective,
  getAgentMentionPlugin,
} from "./markdown/plugin";
