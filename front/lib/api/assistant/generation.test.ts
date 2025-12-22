import { describe, expect, it } from "vitest";

import {
  GET_MENTION_MARKDOWN_TOOL_NAME,
  SEARCH_AVAILABLE_USERS_TOOL_NAME,
} from "@app/lib/actions/constants";
import { constructGuidelinesSection } from "@app/lib/api/assistant/generation";
import type { AgentConfigurationType, UserMessageType } from "@app/types";

describe("constructGuidelinesSection", () => {
  describe("MENTIONING USERS section with Slack/Teams origin handling", () => {
    const baseAgentConfiguration: Pick<
      AgentConfigurationType,
      "actions" | "name"
    > = {
      actions: [],
      name: "test-agent",
    };

    it("should include mention tools for web origin", () => {
      const userMessage = {
        context: {
          origin: "web" as const,
          timezone: "UTC",
        },
      } as UserMessageType;

      const result = constructGuidelinesSection({
        agentConfiguration: baseAgentConfiguration as AgentConfigurationType,
        userMessage,
      });

      // For web origin, should use the tool-based approach
      expect(result).toContain(
        `Use the \`${SEARCH_AVAILABLE_USERS_TOOL_NAME}\` tool to search for users`
      );
      expect(result).toContain(
        `Use the \`${GET_MENTION_MARKDOWN_TOOL_NAME}\` tool to get the markdown directive`
      );

      // Should NOT tell to use simple @username
      expect(result).not.toContain("Use a simple @username to mention users");
    });

    it("should use simple @username for Slack origin", () => {
      for (const origin of ["slack", "teams"] as const) {
        const userMessage = {
          context: {
            origin: origin,
            timezone: "UTC",
          },
        } as UserMessageType;

        const result = constructGuidelinesSection({
          agentConfiguration: baseAgentConfiguration as AgentConfigurationType,
          userMessage,
        });

        // For Slack, should explicitly tell NOT to use the tools
        expect(result).toContain(
          `Do not use the \`${SEARCH_AVAILABLE_USERS_TOOL_NAME}\` or the \`${GET_MENTION_MARKDOWN_TOOL_NAME}\` tools to mention users.`
        );
        expect(result).toContain(
          "Use a simple @username to mention users in your messages in this conversation."
        );

        // Should NOT contain instructions to use the tools
        expect(result).not.toContain(
          `Use the \`${SEARCH_AVAILABLE_USERS_TOOL_NAME}\` tool to search for users that are available`
        );
        expect(result).not.toContain(
          `Use the \`${GET_MENTION_MARKDOWN_TOOL_NAME}\` tool to get the markdown directive to use`
        );
      }
    });
  });
});
