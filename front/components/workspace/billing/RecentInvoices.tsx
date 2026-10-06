import { formatTimestampToFriendlyDate } from "@app/lib/client/friendly_date";
import { useRecentBillingInvoices } from "@app/lib/swr/workspaces";
import type { BillingInvoice } from "@app/types/api/billing/invoices";
import { Button, DataTable, Spinner } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { formatAmount } from "./seatTypeUtils";
import { useSubscriptionContext } from "./SubscriptionContext";

interface InvoiceRow {
  label: string;
  dateLabel: string;
  amountLabel: string;
  invoiceUrl: string | null;
  onClick?: () => void;
  menuItems?: never[];
}

function getInvoiceLabel(
  invoice: BillingInvoice,
  fallbackLabel: string
): string {
  return invoice.description ?? invoice.number ?? fallbackLabel;
}

function getInvoiceUrl(invoice: BillingInvoice): string | null {
  return invoice.hostedInvoiceUrl ?? invoice.invoicePdf;
}

export function RecentInvoices() {
  const { t } = useLingui();
  const { owner } = useSubscriptionContext();
  const { billingInvoices, isBillingInvoicesLoading } =
    useRecentBillingInvoices({
      workspaceId: owner.sId,
    });
  const portalHref = `/w/${owner.sId}/subscription/manage`;

  const columns = useMemo<ColumnDef<InvoiceRow>[]>(
    () => [
      {
        accessorKey: "label",
        header: t`Invoice`,
        enableSorting: false,
        meta: { className: "w-[45%]" },
        cell: ({ row }) => (
          <span className="block truncate text-sm">{row.original.label}</span>
        ),
      },
      {
        accessorKey: "dateLabel",
        header: t`Date`,
        enableSorting: false,
        meta: { className: "w-[20%]" },
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {row.original.dateLabel}
          </span>
        ),
      },
      {
        accessorKey: "amountLabel",
        header: t`Amount`,
        enableSorting: false,
        meta: { headerAlign: "right", className: "w-[17%]" },
        cell: ({ row }) => (
          <span className="block text-right text-sm">
            {row.original.amountLabel}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        meta: { className: "w-[18%]" },
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button
              label={t`See invoice`}
              variant="ghost"
              size="sm"
              href={row.original.invoiceUrl ?? "target-blank-placeholder"}
              target="_blank"
              disabled={!row.original.invoiceUrl}
            />
          </div>
        ),
      },
    ],
    [t]
  );

  const rows: InvoiceRow[] = billingInvoices.map((invoice) => ({
    label: getInvoiceLabel(invoice, t`Invoice`),
    dateLabel: formatTimestampToFriendlyDate(invoice.createdAtMs, "short"),
    amountLabel: formatAmount(
      invoice.totalExcludingTaxCents ?? invoice.totalCents,
      invoice.currency
    ),
    invoiceUrl: getInvoiceUrl(invoice),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-foreground">
          <Trans>Past invoices</Trans>
        </h2>
        {billingInvoices.length > 0 && (
          <Button
            label={t`See all`}
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
        <div className="text-sm text-muted-foreground">
          <Trans>No invoices available.</Trans>
        </div>
      ) : (
        <DataTable data={rows} columns={columns} hideRowDivider={false} />
      )}
    </div>
  );
}
