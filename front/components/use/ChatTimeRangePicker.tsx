import { RadioGroup, Transition } from "@headlessui/react";
import { ClockIcon } from "@heroicons/react/24/outline";
import { Fragment, useState } from "react";

import { classNames } from "@app/lib/utils";
import { ChatTimeRange } from "@app/types/chat";

export const timeRanges = [
  // { name: "1 day", id: "day", ms: 86400000},
  { name: "1 week", id: "week", ms: 604800000, description: "Last 7 days" },
  // 31 days in ms, and 366 days in ms so that we do not miss any documents
  { name: "1 month", id: "month", ms: 2678400000, description: "Last 31 days" },
  { name: "1 year", id: "year", ms: 31622400000, description: "Last 366 days" },
  { name: "all time", id: "all", ms: 0, description: "All time" },
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
    <div className="flex flex-row-reverse items-center sm:flex-row">
      <Transition
        show={open}
        as={Fragment}
        leave="transition ease-in duration-200"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
      >
        <RadioGroup
          as="div"
          className="relative ml-1 flex flex-row items-end justify-start text-left sm:ml-0 sm:mr-1 sm:justify-end"
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
                    className="group mr-1 rounded-full sm:ml-1 sm:mr-0"
                  >
                        <div
                          className={classNames(
                            tr.id == timeRange.id ? "hidden" : "text-gray-600 ring-gray-400",
                            "group relative w-full cursor-pointer whitespace-nowrap rounded-md bg-violet-50 bg-white px-2 py-0.5 text-left text-xs text-violet-800 shadow-sm hover:bg-violet-100"
                          )}
                        >
                          {tr.name}
                        </div>
                  </RadioGroup.Option>
                );
              })}
            </>
          ) : null}
        </RadioGroup>
      </Transition>
      <div
        className="group relative w-full cursor-pointer rounded-md bg-violet-200 py-0.5 pl-2 pr-2 text-left text-xs font-semibold text-violet-800"
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center">
          <ClockIcon className="mr-0.5 inline-block h-3 w-3" />
          <span className="ml-0.5 block truncate">{timeRange.name}</span>
        </span>
      </div>
    </div>
  );
}
