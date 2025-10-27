/**
 * Markdown mention block rendering.
 *
 * This file now re-exports from the centralized mention module.
 * The implementation has been moved to @app/lib/mentions/markdown/plugin
 */

export {
  agentMentionDirective,
  getAgentMentionPlugin,
} from "@app/lib/mentions";
