import {
  Button,
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
  isDownloading: boolean;
  handleDownload: (selectedMonth: string | null) => void;
}

const maxItemsPerPage = 4;

export function ActivityReport({
  monthOptions,
  isDownloading,
  handleDownload,
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
            <Page.H variant="h6">Full activity report</Page.H>
            <Page.P variant="secondary">
              Download workspace activity details.
            </Page.P>
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
                      variant="tertiary"
                      size="xs"
                      label="Download"
                      labelVisible={false}
                      onClick={() => {
                        handleDownload(item);
                      }}
                      disabled={isDownloading}
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
