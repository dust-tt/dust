import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { msg } from "@lingui/core/macro";

const S = ADMIN_SECTION_IDS.subscription;
const PAGE = "subscription" as const;

/** Search entries for Subscription (non credit-priced workspaces). */
export const SUBSCRIPTION_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(PAGE, S.plan, [
    [msg`Subscription`, msg`plan manage billing`],
    [msg`Your plan`, msg`current plan seats`],
    [msg`Cancel subscription`, msg`churn end billing period`],
    [msg`Resume subscription`, msg`undo cancel`],
    [msg`Billing portal`, msg`invoices payment method stripe`],
    [msg`Choose a plan`, msg`upgrade pro business enterprise`],
    [msg`Upgrade to Enterprise seat-based plan`, msg`business upsell`],
  ]),
];
