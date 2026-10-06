import {
  getCreditColumns,
  getTableRows,
} from "@app/components/workspace/CreditsList";
import type { CreditDisplayData } from "@app/types/credits";
import { CREDIT_TYPE_SORT_ORDER } from "@app/types/credits";
import {
  Button,
  DataTable,
  LinkWrapper,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";

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
    return CREDIT_TYPE_SORT_ORDER[a.type] - CREDIT_TYPE_SORT_ORDER[b.type];
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
  const { t } = useLingui();
  const [isOpen, setIsOpen] = useState(false);
  const [sixMonthsAgo] = useState(() => Date.now() - SIX_MONTHS_MS);
  const sixMonthsCredits = useMemo(() => {
    return credits.filter(
      (credit) =>
        credit.expirationDate !== null && credit.expirationDate >= sixMonthsAgo
    );
  }, [credits, sixMonthsAgo]);

  const displayedRows = useMemo(() => {
    return getTableRows(sortCredits([...sixMonthsCredits]), t);
  }, [sixMonthsCredits, t]);
  const columns = useMemo(() => getCreditColumns(t), [t]);

  return (
    <>
      <Button
        label={t`Past credits`}
        variant="outline"
        size="xs"
        onClick={() => setIsOpen(true)}
      />
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetContent size="xl">
          <SheetHeader>
            <SheetTitle>
              <Trans>Past credits</Trans>
            </SheetTitle>
          </SheetHeader>
          <SheetContainer>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size="sm" />
              </div>
            ) : displayedRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                <Trans>No expired credits in the last 6 months.</Trans>
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  <Trans>Expired credits from the last 6 months.</Trans>
                </p>
                <DataTable data={displayedRows} columns={columns} />
              </>
            )}
            <p className="text-sm text-muted-foreground">
              <Trans>
                For older credits,{" "}
                <LinkWrapper
                  href="mailto:support@dust.tt"
                  className="underline"
                >
                  contact support
                </LinkWrapper>
                .
              </Trans>
            </p>{" "}
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </>
  );
}
