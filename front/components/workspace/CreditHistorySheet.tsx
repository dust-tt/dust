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
} from "@app/components/workspace/CreditsList";
import type { CreditDisplayData, CreditType } from "@app/types/credits";

// Sorting priority for credit types: free -> committed -> payg
const TYPE_SORT_ORDER: Record<CreditType, number> = {
  free: 1,
  committed: 2,
  payg: 3,
};

function sortCredits(credits: CreditDisplayData[]): CreditDisplayData[] {
  return credits.sort((a, b) => {
    if (
      a.expirationDate &&
      b.expirationDate &&
      a.expirationDate !== b.expirationDate
    ) {
      return a.expirationDate - b.expirationDate; // Most recent first
    }

    // Then sort by type priority
    return TYPE_SORT_ORDER[a.type] - TYPE_SORT_ORDER[b.type];
  });
}

interface CreditHistorySheetProps {
  credits: CreditDisplayData[];
  isLoading: boolean;
}

export function CreditHistorySheet({
  credits,
  isLoading,
}: CreditHistorySheetProps) {
  const [isOpen, setIsOpen] = useState(false);

  const sortedCredits = useMemo(() => {
    return sortCredits([...credits]);
  }, [credits]);

  const displayedRows = useMemo(() => {
    return getTableRows(sortedCredits);
  }, [sortedCredits]);

  return (
    <>
      <Button
        label="Show full history"
        variant="outline"
        size="xs"
        onClick={() => setIsOpen(true)}
      />
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent size="xl">
          <SheetHeader>
            <SheetTitle>Credit history (last 6 months)</SheetTitle>
          </SheetHeader>
          <SheetContainer>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size="sm" />
              </div>
            ) : displayedRows.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
                No credits in the last 6 months.
              </p>
            ) : (
              <DataTable data={displayedRows} columns={creditColumns} />
            )}
            <p>
              Any question about your credit history? Reach out to our support
              via{" "}
              <Link href="mailto:support@dust.tt" className="underline">
                support@dust.tt
              </Link>{" "}
            </p>
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </>
  );
}
