import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";

const B = ADMIN_SECTION_IDS.billing;
const PAGE = "billing" as const;

/**
 * Search entries for Billing. Tab targets match BillingPage `?tab=` values.
 */
export const BILLING_SEARCH_ENTRIES: AdminSettingEntry[] = [
  ...adminSearchEntries(
    PAGE,
    B.information,
    [
      [
        "Subscription",
        "plan status frequency next billing date amount cancel subscription",
      ],
      ["Seats by type", "pro max platform yearly seats assigned credits"],
      ["Billing contact", "email"],
      ["Address", "billing address"],
      ["Payment method", "card visa"],
    ],
    "billing-information"
  ),
  ...adminSearchEntries(
    PAGE,
    B.invoices,
    [["Invoices", "download invoice pdf"]],
    "invoices"
  ),
  ...adminSearchEntries(
    PAGE,
    B.coupons,
    [["Coupons", "redeemed coupon codes"]],
    "coupons"
  ),
];
