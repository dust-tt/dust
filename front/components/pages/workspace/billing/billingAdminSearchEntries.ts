import type { AdminSettingEntry } from "@app/lib/admin/adminSearchTypes";
import { adminSearchEntries } from "@app/lib/admin/adminSearchTypes";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { msg } from "@lingui/core/macro";

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
        msg`Subscription`,
        msg`plan status frequency next billing date amount cancel subscription`,
      ],
      [msg`Seats by type`, msg`pro max platform yearly seats assigned credits`],
      [msg`Billing contact`, msg`email`],
      [msg`Address`, msg`billing address`],
      [msg`Payment method`, msg`card visa`],
    ],
    "billing-information"
  ),
  ...adminSearchEntries(
    PAGE,
    B.invoices,
    [[msg`Invoices`, msg`download invoice pdf`]],
    "invoices"
  ),
  ...adminSearchEntries(
    PAGE,
    B.coupons,
    [[msg`Coupons`, msg`redeemed coupon codes`]],
    "coupons"
  ),
];
