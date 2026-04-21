import {
  Button,
  Checkbox,
  ContentMessage,
  ContextItem,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  GoogleSpreadsheetLogo,
  Hoverable,
  Icon,
  Pagination,
} from "@dust-tt/sparkle";
import { DownloadIcon } from "lucide-react";
import { useState } from "react";

interface ActivityReportProps {
  monthOptions: string[];
  downloadingMonth: string | null;
  handleDownload: (selectedMonth: string | null) => void;
  includeInactive: boolean;
  onIncludeInactiveChange: (value: boolean) => void;
}

const maxItemsPerPage = 4;

const ANALYTICS_EXPORT_DOCS_URL =
  "https://docs.dust.tt/reference/get_api-v1-w-wid-analytics-export";

export function ActivityReport({
  monthOptions,
  downloadingMonth,
  handleDownload,
  includeInactive,
  onIncludeInactiveChange,
}: ActivityReportProps) {
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: maxItemsPerPage,
  });
  const [pendingMonth, setPendingMonth] = useState<string | null>(null);

  const toPrettyDate = (date: string) => {
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const [year, monthIndex] = date.split("-");
    return `${months.at(Number(monthIndex) - 1)} ${year} `;
  };
  const { pageIndex, pageSize } = pagination;
  const startIndex = pageIndex * pageSize;
  const endIndex = startIndex + pageSize;
  const currentItems = monthOptions.slice(startIndex, endIndex);
  return (
    <>
      {!!monthOptions.length && (
        <div className="flex-grow rounded-lg border border-border bg-card p-4 dark:border-border-night">
          <div className="flex flex-col gap-3">
            <h3 className="text-base font-medium text-foreground dark:text-foreground-night">
              Detailed activity report
            </h3>
            <p className="text-xs text-muted-foreground dark:text-muted-foreground-night">
              Download workspace activity details.
            </p>
            <div className="flex flex-row items-center gap-2">
              <Checkbox
                aria-label="Include inactive users and assistants"
                checked={includeInactive}
                onCheckedChange={() => {
                  onIncludeInactiveChange(!includeInactive);
                }}
              />
              <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                Include members and agents without messages.
              </div>
            </div>
          </div>
          <div className="flex h-full flex-col">
            <ContextItem.List>
              {currentItems.map((item, index) => (
                <ContextItem
                  key={index}
                  title={toPrettyDate(item)}
                  visual={<Icon visual={GoogleSpreadsheetLogo} size="sm" />}
                  action={
                    <Button
                      icon={DownloadIcon}
                      variant="ghost"
                      size="xs"
                      tooltip="Download"
                      onClick={() => {
                        setPendingMonth(item);
                      }}
                      disabled={downloadingMonth !== null}
                      isLoading={downloadingMonth === item}
                    />
                  }
                ></ContextItem>
              ))}
            </ContextItem.List>
            <div className="mt-2">
              <Pagination
                rowCount={monthOptions.length}
                pagination={pagination}
                setPagination={setPagination}
                size="xs"
              />
            </div>
          </div>
        </div>
      )}
      <Dialog
        open={pendingMonth !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingMonth(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deprecated download</DialogTitle>
          </DialogHeader>
          <DialogContainer>
            <ContentMessage variant="warning" title="Scheduled for removal">
              This activity report download will be removed on June 1st, 2026.
              Switch to the new analytics export API before then.{" "}
              <Hoverable
                variant="highlight"
                href={ANALYTICS_EXPORT_DOCS_URL}
                target="_blank"
              >
                View documentation
              </Hoverable>
              .
            </ContentMessage>
            <DialogDescription>
              Do you want to continue and download the report for{" "}
              {pendingMonth ? toPrettyDate(pendingMonth).trim() : ""}?
            </DialogDescription>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: () => setPendingMonth(null),
            }}
            rightButtonProps={{
              label: "Download anyway",
              variant: "warning",
              onClick: () => {
                const month = pendingMonth;
                setPendingMonth(null);
                handleDownload(month);
              },
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
