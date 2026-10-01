import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";

const M = ADMIN_SECTION_IDS.modelProviders;
const PAGE = "model_providers" as const;

/** Search entries for Model Providers. */
export const MODEL_PROVIDERS_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(PAGE, M.providers, [
    ["Model Providers", "ai models llm openai anthropic google"],
    ["EU-hosted models only", "regional data residency europe"],
    ["Make all providers available", "enable all providers"],
    ["Provider list", "toggle enable disable models"],
    ["Embedding model", "default embedding provider"],
  ]),
];
