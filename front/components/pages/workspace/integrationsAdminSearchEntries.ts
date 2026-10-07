import type { MESSAGING_APP_METADATA } from "@app/components/workspace/settings/settings_metadata";
import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

const I = ADMIN_SECTION_IDS.integrations;
const PAGE = "integrations" as const;

const MESSAGING_APP_SEARCH_ITEMS: Record<
  keyof typeof MESSAGING_APP_METADATA,
  [MessageDescriptor, MessageDescriptor]
> = {
  slack_bot: [msg`Slack Bot`, msg`slack reconnect`],
  microsoft_bot: [msg`Microsoft Teams Bot`, msg`teams`],
};

/** Search entries for Integrations (messaging, email, clients & tools). */
export const INTEGRATIONS_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(
    PAGE,
    I.messaging,
    [
      ...Object.values(MESSAGING_APP_SEARCH_ITEMS),
      [
        msg`"Sent via Agent" Slack footer`,
        msg`remove footer user credentials sent via agent`,
      ],
    ],
    "messaging"
  ),
  ...adminSearchEntries(
    PAGE,
    I.email,
    [[msg`Email agents`, msg`reach agents by email AGENT_NAME@dust.team`]],
    "email"
  ),
  ...adminSearchEntries(
    PAGE,
    I.clients,
    [
      [msg`MCP server`, msg`external mcp clients connect manage`],
      [msg`Browser Extension Tools`, msg`list read browser tabs extension`],
    ],
    "clients"
  ),
];
