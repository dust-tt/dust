import { createPlugin } from "@app/lib/api/poke/types";
import { updateWorkspaceMetadata } from "@app/lib/api/workspace";
import { Err, Ok } from "@app/types/shared/result";

export const toggleSlackPersonalFooterRemovalPlugin = createPlugin({
  manifest: {
    id: "toggle-slack-personal-footer-removal",
    name: "Toggle Slack Personal Footer Removal",
    description:
      "Allow or prevent agents from omitting the 'Sent via Dust' footer in Slack messages posted via the personal Slack integration. " +
      "When disabled (default), the footer is always appended and agents cannot suppress it. " +
      "When enabled, agents can set show_sent_by_footer=false to omit the footer.",
    resourceTypes: ["workspaces"],
    args: {
      allowed: {
        type: "boolean",
        label: "Allow footer removal",
        description:
          "When checked, agents can omit the 'Sent via Dust' footer. When unchecked (default), the footer is always forced.",
      },
    },
    requiredRoles: ["support"],
  },
  execute: async (auth, workspace, args) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const { allowed } = args;

    const result = await updateWorkspaceMetadata(workspace, {
      slackPersonalAllowFooterRemoval: allowed,
    });

    if (result.isErr()) {
      return new Err(result.error);
    }

    return new Ok({
      display: "text",
      value: allowed
        ? `Footer removal is now ALLOWED for workspace "${workspace.name}". Agents can set show_sent_by_footer=false to omit the attribution.`
        : `Footer removal is now DISABLED for workspace "${workspace.name}". The 'Sent via Dust' footer will always be appended.`,
    });
  },
});
