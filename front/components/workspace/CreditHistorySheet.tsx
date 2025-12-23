import {
  Button,
  DataTable,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";
import Link from "next/link";
import React, { useMemo, useState } from "react";

import {
  creditColumns,
  getTableRows,
  TYPE_SORT_ORDER,
} from "@app/components/workspace/CreditsList";
import type { CreditDisplayData } from "@app/types/credits";

function sortCredits(credits: CreditDisplayData[]): CreditDisplayData[] {
  return [...credits].sort((a, b) => {
    if (
      a.expirationDate &&
      b.expirationDate &&
      a.expirationDate !== b.expirationDate
    ) {
      return b.expirationDate - a.expirationDate; // Most recent first
    }

    // Then sort by type priority
    return TYPE_SORT_ORDER[a.type] - TYPE_SORT_ORDER[b.type];
  });
}

interface CreditHistorySheetProps {
  credits: CreditDisplayData[];
  isLoading: boolean;
}

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;

export function CreditHistorySheet({
  credits,
  isLoading,
}: CreditHistorySheetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sixMonthsAgo] = useState(() => Date.now() - SIX_MONTHS_MS);
  const sixMonthsCredits = useMemo(() => {
    return credits.filter(
      (credit) =>
        credit.expirationDate !== null && credit.expirationDate >= sixMonthsAgo
    );
  }, [credits, sixMonthsAgo]);

  const displayedRows = useMemo(() => {
    return getTableRows(sortCredits([...sixMonthsCredits]));
  }, [sixMonthsCredits]);

  return (
    <>
      <Button
        label="Past credits"
        variant="outline"
        size="xs"
        onClick={() => setIsOpen(true)}
      />
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent size="xl">
          <SheetHeader>
            <SheetTitle>Past credits</SheetTitle>
          </SheetHeader>
          <SheetContainer>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size="sm" />
              </div>
            ) : displayedRows.length === 0 ? (
              <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                No expired credits in the last 6 months.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                  Expired credits from the last 6 months.
                </p>
                <DataTable data={displayedRows} columns={creditColumns} />
              </>
            )}
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              For older credits,{" "}
              <Link href="mailto:support@dust.tt" className="underline">
                contact support
              </Link>
              .
            </p>{" "}
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </>
  );
}
