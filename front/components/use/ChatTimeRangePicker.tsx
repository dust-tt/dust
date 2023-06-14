import { Listbox, RadioGroup, Transition } from "@headlessui/react";
import Link from "next/link";
import { Fragment, useEffect, useState } from "react";

import { useDataSources } from "@app/lib/swr";
import { classNames } from "@app/lib/utils";
import { WorkspaceType } from "@app/types/user";
import { ChatTimeRange } from "@app/types/chat";

export const timeRanges = [
  // { name: "1 day", id: "day", ms: 86400000},
  { name: "1 week", id: "week", ms: 604800000, description: "Last 7 days" },
  // 31 days in ms, and 366 days in ms so that we do not miss any documents
  { name: "1 month", id: "month", ms: 2678400000, description: "Last 31 days" },
  { name: "1 year", id: "year", ms: 31622400000, description: "Last 366 days" },
  { name: "All time", id: "all", ms: 0, description: "All time" },
];

export const defaultTimeRange = timeRanges[3];

export default function TimeRangePicker({
  timeRange,
  onTimeRangeUpdate,
}: {
  timeRange: ChatTimeRange;
  onTimeRangeUpdate: (timeRange: ChatTimeRange) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center flex-row-reverse sm:flex-row">
      <Transition
        show={open}
        as={Fragment}
        leave="transition ease-in duration-200"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <RadioGroup
          as="div"
          className="relative flex flex-row items-end text-left ml-1 justify-start sm:justify-end sm:mr-1 sm:ml-0"
          onChange={(tr) => {
            setOpen(false);
            onTimeRangeUpdate(tr);
          }}
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
                    className="group mr-1 sm:ml-1 sm:mr-0 rounded-full"
                    defaultChecked={tr.id === timeRange.id}
                  >
                    {({ checked }) => (
                      <>
                        <div
                          className={classNames(
                            checked ? "hidden" : "text-gray-600 ring-gray-400",
                            "group relative w-full cursor-default whitespace-nowrap rounded-md bg-white py-0.5 pl-1 pr-4 text-left text-xs shadow-sm ring-1 ring-inset hover:text-gray-600 hover:outline-none hover:ring-1 hover:ring-violet-700"
                          )}
                        >
                          {" "}
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className="mr-1 inline-block h-3 w-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke={checked ? "currentColor" : "none"}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                          {tr.name}
                        </div>
                        <div className="absolute bottom-5 hidden rounded border bg-white py-1 pr-1 group-hover:block">
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
      </Transition>
      <div
        className="group relative w-full cursor-default rounded-md bg-white py-0.5 pl-1 pr-3 text-left text-xs text-gray-600 shadow-sm ring-1 ring-inset ring-gray-400 hover:outline-none hover:ring-1 hover:ring-violet-700"
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-4 w-4 group-hover:text-violet-700"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="ml-2 block truncate">{timeRange.name}</span>
        </span>
      </div>
    </div>
  );
}
