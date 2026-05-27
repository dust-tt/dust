import type { BillingInvoice } from "@app/lib/api/billing/invoices";
import { getPriceAsString } from "@app/lib/client/subscription";
import { useRecentBillingInvoices } from "@app/lib/swr/workspaces";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, Spinner } from "@dust-tt/sparkle";

interface RecentInvoicesProps {
  owner: LightWorkspaceType;
}

function getInvoiceLabel(invoice: BillingInvoice): string {
  return invoice.description ?? invoice.number ?? "Invoice";
}

function getInvoiceUrl(invoice: BillingInvoice): string | null {
  return invoice.hostedInvoiceUrl ?? invoice.invoicePdf;
}

export function RecentInvoices({ owner }: RecentInvoicesProps) {
  const { billingInvoices, isBillingInvoicesLoading } =
    useRecentBillingInvoices({
      workspaceId: owner.sId,
    });
  const portalHref = `/w/${owner.sId}/subscription/manage`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-foreground dark:text-foreground-night">
          Invoices
        </h2>
        {billingInvoices.length > 0 && (
          <Button
            label="See all"
            variant="ghost"
            size="sm"
            href={portalHref}
            target="_blank"
          />
        )}
      </div>
      {isBillingInvoicesLoading ? (
        <div className="w-full p-6">
          <Spinner />
        </div>
      ) : billingInvoices.length === 0 ? (
        <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
          No invoices available.
        </div>
      ) : (
        <div className="flex flex-col">
          <div className="flex flex-col">
            {billingInvoices.map((invoice) => {
              const invoiceUrl = getInvoiceUrl(invoice);

              return (
                <div
                  key={invoice.id}
                  className="grid grid-cols-1 gap-2 border-b border-border py-2 text-sm text-muted-foreground last:border-b-0 dark:border-border-night dark:text-muted-foreground-night md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center md:gap-4"
                >
                  <div className="truncate">{getInvoiceLabel(invoice)}</div>
                  <div>
                    {formatTimestampToFriendlyDate(
                      invoice.createdAtMs,
                      "short"
                    )}
                  </div>
                  <div>
                    {getPriceAsString({
                      currency: invoice.currency,
                      priceInCents: invoice.totalCents,
                    })}
                  </div>
                  <div className="md:justify-self-end">
                    <Button
                      label="See invoice"
                      variant="ghost"
                      size="sm"
                      href={invoiceUrl ?? "target-blank-placeholder"}
                      target="_blank"
                      disabled={!invoiceUrl}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
