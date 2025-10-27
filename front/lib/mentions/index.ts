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

// Types
export type {
  AgentMention,
  MentionType,
  RichAgentMention,
  RichMention,
  RichUserMention,
  UserMention,
} from "./types";
export {
  isAgentMention,
  isRichAgentMention,
  isRichUserMention,
  toMentionType,
  toRichMention,
} from "./types";

// Format utilities
export {
  extractFromEditorJSON,
  mentionFormat,
  parseMentions,
  replaceMentionsWithAt,
  serializeMention,
} from "./format";

// UI components
export { MentionDisplay } from "./ui/MentionDisplay";
export { MentionDropdown } from "./ui/MentionDropdown";

// Editor utilities
export {
  filterAgentSuggestions,
  mentionSuggestions,
} from "./editor/suggestion";
export { editorMentionUtils } from "./editor/utils";

// Markdown plugins
export {
  agentMentionDirective,
  getAgentMentionPlugin,
} from "./markdown/plugin";
