import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";

const S = ADMIN_SECTION_IDS.subscription;
const PAGE = "subscription" as const;

/** Search entries for Subscription (non credit-priced workspaces). */
export const SUBSCRIPTION_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(PAGE, S.plan, [
    ["Subscription", "plan manage billing"],
    ["Your plan", "current plan seats"],
    ["Cancel subscription", "churn end billing period"],
    ["Resume subscription", "undo cancel"],
    ["Billing portal", "invoices payment method stripe"],
    ["Choose a plan", "upgrade pro business enterprise"],
    ["Upgrade to Enterprise seat-based plan", "business upsell"],
  ]),
];
