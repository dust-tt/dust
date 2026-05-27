import {
  CardBrandIcon,
  formatBrandName,
} from "@app/components/checkout/PaymentMethodRow";
import type {
  BillingAddress,
  BillingPaymentMethod,
} from "@app/lib/api/billing/info";
import { useBillingInfo } from "@app/lib/swr/workspaces";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ActionMailIcon,
  ActionMapPinIcon,
  ActionNumbersIcon,
  Button,
  Icon,
  Spinner,
  UserIcon,
} from "@dust-tt/sparkle";

interface BillingInformationProps {
  owner: LightWorkspaceType;
}

function formatAddress(address: BillingAddress | null): string | null {
  if (!address) {
    return null;
  }

  const street = [address.line1, address.line2].filter(Boolean).join(", ");
  const cityLine = [address.city, address.state, address.postalCode]
    .filter(Boolean)
    .join(" ");

  return [street, cityLine, address.country].filter(Boolean).join(", ") || null;
}

function formatPaymentMethod(
  paymentMethod: BillingPaymentMethod | null
): string {
  if (!paymentMethod) {
    return "No payment method on file";
  }

  if (paymentMethod.type === "card") {
    return paymentMethod.last4
      ? `${formatBrandName(paymentMethod.brand ?? "Unknown")} •••• ${paymentMethod.last4}`
      : formatBrandName(paymentMethod.brand ?? "Unknown");
  }

  if (paymentMethod.type === "sepa_debit") {
    return paymentMethod.last4
      ? `SEPA Direct Debit •••• ${paymentMethod.last4}`
      : "IBAN";
  }

  if (paymentMethod.type === "us_bank_account") {
    return paymentMethod.last4
      ? `Bank account ${paymentMethod.last4}`
      : "Bank account";
  }

  return paymentMethod.last4
    ? `Payment method ${paymentMethod.last4}`
    : "Payment method";
}

export function BillingInformation({ owner }: BillingInformationProps) {
  const { billingInfo, isBillingInfoLoading } = useBillingInfo({
    workspaceId: owner.sId,
  });

  if (isBillingInfoLoading) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-foreground dark:text-foreground-night">
          Billing information
        </h2>
        <div className="w-full rounded-lg bg-muted-background p-6 dark:bg-muted-background-night">
          <Spinner />
        </div>
      </div>
    );
  }

  const portalHref = `/w/${owner.sId}/subscription/manage`;
  const address = formatAddress(billingInfo?.profile.address ?? null);
  const addressRows = [
    { icon: UserIcon, value: billingInfo?.profile.name },
    { icon: ActionMailIcon, value: billingInfo?.profile.email },
    { icon: ActionNumbersIcon, value: billingInfo?.profile.phone },
    { icon: ActionMapPinIcon, value: address },
  ].filter((row) => row.value);
  const paymentMethod = billingInfo?.paymentMethod ?? null;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-foreground dark:text-foreground-night">
        Billing information
      </h2>

      <div className="relative flex flex-col gap-2 rounded-lg bg-muted-background p-4 dark:bg-muted-background-night">
        <h3 className="text-base font-semibold text-foreground dark:text-foreground-night">
          Billing contact
        </h3>

        {addressRows.length > 0 ? (
          <>
            <Button
              label="Change"
              variant="ghost"
              size="sm"
              href={portalHref}
              target="_blank"
              className="absolute right-4 top-3"
            />
            <div className="flex flex-col gap-2 text-xs text-muted-foreground dark:text-muted-foreground-night">
              {addressRows.map(({ icon, value }) => (
                <div key={value} className="flex items-center gap-2">
                  <Icon
                    visual={icon}
                    size="xs"
                    className="shrink-0 text-foreground dark:text-foreground-night"
                  />
                  <span>{value}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
            No billing address on file.
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted-background p-4 dark:bg-muted-background-night">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-6 w-[34px] shrink-0 items-center justify-center overflow-hidden rounded">
            <CardBrandIcon
              brand={paymentMethod?.brand ?? "generic"}
              width={34}
              height={22}
            />
          </div>
          <div className="truncate text-sm font-semibold text-foreground dark:text-foreground-night">
            {formatPaymentMethod(paymentMethod)}
          </div>
        </div>
        {paymentMethod && (
          <Button
            label="Change"
            variant="ghost"
            size="sm"
            href={portalHref}
            target="_blank"
          />
        )}
      </div>
    </div>
  );
}
