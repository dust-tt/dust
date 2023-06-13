import { RadioGroup } from "@headlessui/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useDataSources } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import { WorkspaceType } from "@app/types/user";
import { ChatTimeRange } from "@app/types/chat";

export const timeRanges = [
  // { name: "1 day", id: "day", ms: 86400000},
  { name: "week", id: "week", ms: 604800000, description: "Last 7 days" },
  // 31 days in ms, and 366 days in ms so that we do not miss any documents
  { name: "month", id: "month", ms: 2678400000, description: "Last 31 days"},
  { name: "year", id: "year", ms: 31622400000, description: "Last 366 days"},
  { name: "all", id: "all", ms: 0, description: "All time"},
];

export const defaultTimeRange = timeRanges[3];

export default function TimeRangePicker({
  timeRange,
  onTimeRangeUpdate,
}: {
  timeRange: ChatTimeRange;
  onTimeRangeUpdate: (timeRange: ChatTimeRange) => void;
}) {
  const name = timeRange.name;
  return (
    <div className="flex items-center">
      <div className="flex items-center">
        <RadioGroup
          as="div"
          className="relative flex flex-row items-end text-left"
          onChange={onTimeRangeUpdate}
          value={timeRange}
        >
          <RadioGroup.Label className="sr-only">Time Range</RadioGroup.Label>
          {(timeRanges || []).length > 0 ? (
            <>
              {(timeRanges || []).map((tr) => {
                return (
                  <RadioGroup.Option
                    key={tr.id}
                    value={tr}
                    className="rounded-full group"
                  >
                    {({ checked }) => (
                      <>
                        <div
                          className={classNames(
                            checked
                              ? "border-gray-600 bg-gray-200 text-gray-600"
                              : "text-gray-400",
                            "ml-2 block cursor-pointer rounded-md border border-gray-400 bg-gray-100 px-2 text-xs"
                          )}
                        >
                          {" "}
                          {checked && (
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              className="mr-1 inline-block h-3 w-3"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth="2"
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          )}
                          {tr.name}
                        </div>
                        <div className="absolute bottom-5 rounded border bg-white px-1 py-1 hidden group-hover:block">
                          <span className="text-gray-600">
                            {tr.description ? ` ${tr.description}` : null}
                          </span>
                        </div>
                      </>
                    )}
                  </RadioGroup.Option>
                );
              })}
            </>
          ) : null}
        </RadioGroup>
      </div>
    </div>
  );
}
