import { RadioGroup, Transition } from "@headlessui/react";
import { ClockIcon } from "@heroicons/react/24/outline";
import { Fragment, useState } from "react";

import { classNames } from "@app/lib/utils";

export type GensTimeRange = {
  count: number;
  unit: "day" | "week" | "month" | "year" | "all";
};

export const gensTimeRanges: GensTimeRange[] = [
  { count: 1, unit: "week" },
  { count: 1, unit: "month" },
  { count: 1, unit: "year" },
  { count: 0, unit: "all" },
];

export const gensDefaultTimeRange = gensTimeRanges[3];

export const msForTimeRange = (timeRange: GensTimeRange) => {
  switch (timeRange.unit) {
    case "day":
      return timeRange.count * 86400000;
    case "week":
      return timeRange.count * 604800000;
    case "month":
      return timeRange.count * 2678400000;
    case "year":
      return timeRange.count * 31622400000;
    case "all":
      return 0;
  }
};

export const nameForTimeRange = (timeRange: GensTimeRange) => {
  if (timeRange.unit == "all") return "all time";
  if (timeRange.count === 1) {
    return `${timeRange.count} ${timeRange.unit}`;
  }
  return `${timeRange.count} ${timeRange.unit}s`;
};

export const idForTimeRange = (timeRange: GensTimeRange) => {
  if (timeRange.unit == "all") return "all_time";
  return `${timeRange.count}_${timeRange.unit}`;
};

export default function GensTimeRangePicker({
  timeRange,
  onTimeRangeUpdate,
}: {
  timeRange: GensTimeRange;
  onTimeRangeUpdate: (timeRange: GensTimeRange) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="select-none flex flex-row-reverse items-center sm:flex-row">
      <div
        className="group relative w-full cursor-pointer rounded-md bg-violet-200 py-0.5 pl-2 pr-2 text-left text-xs font-semibold text-violet-800"
        onClick={() => setOpen(!open)}
      >
        <span className="flex items-center">
          <ClockIcon className="mr-0.5 inline-block h-3 w-3" />
          <span className="ml-0.5 block truncate">
            {nameForTimeRange(timeRange)}
          </span>
        </span>
        {/**
        <div className="absolute bottom-6 left-0 hidden w-max rounded border bg-white px-1 py-1 group-hover:block sm:left-auto sm:right-0">
          <span className="font-normal text-gray-600">
            <span className="font-semibold">time range</span>
            &nbsp; retrieve documents created within the selected range
          </span>
        </div>
       */}
      </div>
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
          {gensTimeRanges.length > 0 ? (
            <>
              {gensTimeRanges.map((tr) => {
                return (
                  <RadioGroup.Option
                    key={idForTimeRange(tr)}
                    value={tr}
                    className="group mr-1 rounded-full sm:ml-1
                     sm:mr-0"
                  >
                    <div
                      className={classNames(
                        idForTimeRange(tr) == idForTimeRange(timeRange)
                          ? "hidden"
                          : "text-gray-600 ring-gray-400",
                        "group relative w-full cursor-pointer whitespace-nowrap rounded-md bg-violet-50 px-2 py-0.5 text-left text-xs text-violet-800 shadow-sm hover:bg-violet-100"
                      )}
                    >
                      {nameForTimeRange(tr)}
                    </div>
                  </RadioGroup.Option>
                );
              })}
            </>
          ) : null}
        </RadioGroup>
      </Transition>
    </div>
  );
}
