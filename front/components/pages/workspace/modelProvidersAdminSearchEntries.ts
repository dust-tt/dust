import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";

const M = ADMIN_SECTION_IDS.modelProviders;
const A = ADMIN_SECTION_IDS.appCredentials;
const PAGE = "models" as const;

/** Search entries for Models (providers, access tiers, app credentials). */
export const MODEL_PROVIDERS_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(
    PAGE,
    M.providers,
    [
      ["Model Providers", "ai models llm openai anthropic google"],
      ["EU-hosted models only", "regional data residency europe"],
      ["Make all providers available", "enable all providers"],
      ["Provider list", "toggle enable disable models"],
      ["Embedding model", "default embedding provider"],
    ],
    "providers"
  ),
  ...adminSearchEntries(
    PAGE,
    M.tiers,
    [
      [
        "Workspace model tiers",
        "model tiers workspace access tier standard advanced frontier",
      ],
      ["Models tier", "model tiers workspace defaults"],
      [
        "Workspace access",
        "model tiers highest workspace access standard advanced frontier",
      ],
      [
        "Published agents",
        "model tiers run above member tier published agents",
      ],
    ],
    "tiers"
  ),
  ...adminSearchEntries(
    PAGE,
    A.modelProviders,
    [
      [
        "App Credentials",
        "dust apps providers api keys openai azure anthropic",
      ],
      ["Model Providers for Dust Apps", "api key openai azure anthropic"],
    ],
    "apps"
  ),
  ...adminSearchEntries(
    PAGE,
    A.serviceProviders,
    [
      [
        "Service Providers",
        "serpapi serper browserless google search web scrape",
      ],
    ],
    "apps"
  ),
  // Anchor wrapper around the App Credentials tab content.
  ...adminSearchEntries(
    PAGE,
    M.apps,
    [["App Credentials tab", "legacy dust apps credentials"]],
    "apps"
  ),
];
