import {
  Button,
  Checkbox,
  ContextItem,
  GoogleSpreadsheetLogo,
  Icon,
  Page,
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
        <div className="flex-grow">
          <div className="flex flex-col gap-3">
            <Page.H variant="h6">Detailed activity report</Page.H>
            <Page.P variant="secondary">
              Download workspace activity details.
            </Page.P>
            <div className="flex flex-row items-center gap-2">
              <Checkbox
                label="Include inactive users and assistants"
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
                        handleDownload(item);
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
    </>
  );
}
