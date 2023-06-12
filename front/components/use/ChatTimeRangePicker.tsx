import { Menu } from "@headlessui/react";
import { ChevronDownIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useEffect, useState } from "react";

import { useDataSources } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import { WorkspaceType } from "@app/types/user";
import { ChatTimeRange } from "@app/types/chat";

export const timeRanges = [
  { name: "All time", id: "all", ms: 0},
  { name: "1d ago", id: "day", ms: 86400000},
  { name: "1w ago", id: "week", ms: 604800000},
  // 31 days in ms, and 366 days in ms so that we do not miss any documents
  { name: "1m ago", id: "month", ms: 2678400000}, 
  { name: "1y ago", id: "year", ms: 31622400000},
];

export const defaultTimeRange = timeRanges[0];

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
        <Menu as="div" className="relative inline-block text-left">
          <div>
            <Menu.Button
              className={classNames(
                "inline-flex items-center rounded-md text-xs font-normal text-gray-700",
                name && name.length > 0 ? "px-0" : "border px-3",
                "border-orange-400 text-gray-700",
                "focus:outline-none focus:ring-0"
              )}
            >
              {name && name.length > 0 ? (
                <>
                  <div className="mr-1 text-xs text-violet-600">{name}</div>
                  <ChevronDownIcon className="mt-0.5 h-4 w-4 hover:text-gray-700" />
                </>
              ) : (
                "Select Time"
              )}
            </Menu.Button>
          </div>

          {(timeRanges || []).length > 0 ? (
            <Menu.Items
              className={classNames(
                "bottom-5 ml-2 absolute z-10 mt-1 w-max origin-top-left rounded-md bg-white shadow-sm ring-1 ring-black ring-opacity-5 focus:outline-none",
                name && name.length > 0 ? "-left-4" : "left-1"
              )}
            >
              <div className="py-1">
                {(timeRanges || []).map((tr) => {
                  return (
                    <Menu.Item key={tr.name}>
                      {({ active }) => (
                        <span
                          className={classNames(
                            active
                              ? "bg-gray-50 text-gray-900"
                              : "text-gray-700",
                            "block cursor-pointer px-4 py-2 text-xs"
                          )}
                          onClick={() => onTimeRangeUpdate(tr)}
                        >
                          {tr.name}
                        </span>
                      )}
                    </Menu.Item>
                  );
                })}
              </div>
            </Menu.Items>
          ) : null}
        </Menu>
      </div>
    </div>
  );
}
