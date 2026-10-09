import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { msg } from "@lingui/core/macro";

const M = ADMIN_SECTION_IDS.modelProviders;
const A = ADMIN_SECTION_IDS.appCredentials;
const PAGE = "models" as const;

/** Search entries for Models (providers, access tiers, members, groups, apps). */
export const MODEL_PROVIDERS_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(
    PAGE,
    M.providers,
    [
      [msg`Model Providers`, msg`ai models llm openai anthropic google`],
      [msg`EU-hosted models only`, msg`regional data residency europe`],
      [msg`Make all providers available`, msg`enable all providers`],
      [msg`Provider list`, msg`toggle enable disable models`],
      [msg`Embedding model`, msg`default embedding provider`],
    ],
    "providers"
  ),
  ...adminSearchEntries(
    PAGE,
    M.tiers,
    [
      [
        msg`Workspace model tiers`,
        msg`model tiers workspace access tier standard advanced frontier`,
      ],
      [msg`Models tier`, msg`model tiers workspace defaults`],
      [
        msg`Workspace access`,
        msg`model tiers highest workspace access standard advanced frontier`,
      ],
      [
        msg`Published agents`,
        msg`model tiers run above member tier published agents`,
      ],
    ],
    "tiers"
  ),
  ...adminSearchEntries(
    PAGE,
    M.members,
    [
      [
        msg`Members model tiers`,
        msg`model tiers member access tier per user standard advanced frontier`,
      ],
    ],
    "members"
  ),
  ...adminSearchEntries(
    PAGE,
    M.groups,
    [
      [
        msg`Group model tiers`,
        msg`model tiers group access tier per group standard advanced frontier`,
      ],
    ],
    "groups"
  ),
  ...adminSearchEntries(
    PAGE,
    A.modelProviders,
    [
      [
        msg`App Credentials`,
        msg`dust apps providers api keys openai azure anthropic`,
      ],
      [msg`Model Providers for Dust Apps`, msg`api key openai azure anthropic`],
    ],
    "apps"
  ),
  ...adminSearchEntries(
    PAGE,
    A.serviceProviders,
    [
      [
        msg`Service Providers`,
        msg`serpapi serper browserless google search web scrape`,
      ],
    ],
    "apps"
  ),
  // Anchor wrapper around the App Credentials tab content.
  ...adminSearchEntries(
    PAGE,
    M.apps,
    [[msg`App Credentials tab`, msg`legacy dust apps credentials`]],
    "apps"
  ),
];
