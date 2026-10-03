import {
  CardBrandIcon,
  formatBrandName,
} from "@app/components/checkout/PaymentMethodRow";
import { useBillingInfo } from "@app/lib/swr/workspaces";
import type {
  BillingAddress,
  BillingPaymentMethod,
} from "@app/types/api/billing/info";
import {
  Button,
  Hash01,
  Icon,
  Mail01,
  MarkerPin01,
  Spinner,
  User01,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useSubscriptionContext } from "./SubscriptionContext";

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

function PaymentMethodLabel({
  paymentMethod,
}: {
  paymentMethod: BillingPaymentMethod | null;
}): string {
  const { t } = useLingui();

  if (!paymentMethod) {
    return t`No payment method on file`;
  }

  const last4 = paymentMethod.last4;

  if (paymentMethod.type === "card") {
    const brand =
      paymentMethod.brand === null
        ? t`Unknown`
        : formatBrandName(paymentMethod.brand);
    return last4 ? `${brand} •••• ${last4}` : brand;
  }

  if (paymentMethod.type === "sepa_debit") {
    return last4 ? t`SEPA Direct Debit •••• ${last4}` : t`IBAN`;
  }

  if (paymentMethod.type === "us_bank_account") {
    return last4 ? t`Bank account ${last4}` : t`Bank account`;
  }

  return last4 ? t`Payment method ${last4}` : t`Payment method`;
}

export function BillingInformation() {
  const { t } = useLingui();
  const { owner } = useSubscriptionContext();
  const { billingInfo, isBillingInfoLoading } = useBillingInfo({
    workspaceId: owner.sId,
  });

  if (isBillingInfoLoading) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-foreground">
          <Trans>Billing information</Trans>
        </h2>
        <div className="w-full rounded-lg bg-muted-background p-6">
          <Spinner />
        </div>
      </div>
    );
  }

  const portalHref = `/w/${owner.sId}/subscription/manage`;
  const address = formatAddress(billingInfo?.profile.address ?? null);
  const addressRows = [
    { icon: User01, value: billingInfo?.profile.name },
    { icon: Mail01, value: billingInfo?.profile.email },
    { icon: Hash01, value: billingInfo?.profile.phone },
    { icon: MarkerPin01, value: address },
  ].filter((row) => row.value);
  const paymentMethod = billingInfo?.paymentMethod ?? null;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-foreground">
        <Trans>Billing information</Trans>
      </h2>

      <div className="relative flex flex-col gap-2 rounded-lg bg-muted-background p-4">
        <h3 className="text-base font-semibold text-foreground">
          <Trans>Billing contact</Trans>
        </h3>

        {addressRows.length > 0 ? (
          <>
            <Button
              label={t`Change`}
              variant="ghost"
              size="sm"
              href={portalHref}
              target="_blank"
              className="absolute right-4 top-3"
            />
            <div className="flex flex-col gap-2 text-xs text-muted-foreground">
              {addressRows.map(({ icon, value }) => (
                <div key={value} className="flex items-center gap-2">
                  <Icon
                    visual={icon}
                    size="xs"
                    className="shrink-0 text-foreground"
                  />
                  <span>{value}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">
            <Trans>No billing address on file.</Trans>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 rounded-lg bg-muted-background p-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-6 w-[34px] shrink-0 items-center justify-center overflow-hidden rounded">
            <CardBrandIcon
              brand={paymentMethod?.brand ?? "generic"}
              width={34}
              height={22}
            />
          </div>
          <div className="truncate text-sm font-semibold text-foreground">
            <PaymentMethodLabel paymentMethod={paymentMethod} />
          </div>
        </div>
        {paymentMethod && (
          <Button
            label={t`Change`}
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
