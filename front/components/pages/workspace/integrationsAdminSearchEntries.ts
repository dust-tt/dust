import { EXTENSION_MCP_TOOLS_LABEL } from "@app/components/workspace/extension_mcp_tools_metadata";
import { DUST_MCP_SERVER_LABEL } from "@app/components/workspace/settings/DustMcpServerSettingsItem";
import { EMAIL_AGENTS_LABEL } from "@app/components/workspace/settings/EmailAgentsToggle";
import { MESSAGING_APP_METADATA } from "@app/components/workspace/settings/MessagingAppToggles";
import { SLACK_PERSONAL_FOOTER_REMOVAL_LABEL } from "@app/components/workspace/settings/SlackPersonalFooterRemovalToggle";
import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";

const I = ADMIN_SECTION_IDS.integrations;
const PAGE = "integrations" as const;

/** Search entries for Integrations (messaging, email, clients & tools). */
export const INTEGRATIONS_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(
    PAGE,
    I.messaging,
    [
      ...Object.values(MESSAGING_APP_METADATA).map((app) => {
        const keywords =
          app.name === "Slack Bot"
            ? "slack reconnect"
            : app.name === "Microsoft Teams Bot"
              ? "teams"
              : "discord reconnect";
        return [app.name, keywords] as [string, string];
      }),
      [
        SLACK_PERSONAL_FOOTER_REMOVAL_LABEL,
        "remove footer user credentials sent via agent",
      ],
    ],
    "messaging"
  ),
  ...adminSearchEntries(
    PAGE,
    I.email,
    [[EMAIL_AGENTS_LABEL, "reach agents by email AGENT_NAME@dust.team"]],
    "email"
  ),
  ...adminSearchEntries(
    PAGE,
    I.clients,
    [
      [DUST_MCP_SERVER_LABEL, "external mcp clients connect manage"],
      [EXTENSION_MCP_TOOLS_LABEL, "list read browser tabs extension"],
    ],
    "clients"
  ),
];
