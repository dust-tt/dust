import React from "react";
import { classNames } from "../lib/utils";

export function Logo({ animated, green, orange }) {
  return (
    <div
      className={classNames(
        "flex flex-row items-center",
        animated ? "animate-pulse" : ""
      )}
    >
      <div className="flex rotate-[30deg]">
        <div
          className={classNames(
            "h-3 w-[5px] rounded-xl",
            green ? "bg-green-600" : orange ? "bg-orange-600" : "bg-gray-400"
          )}
        ></div>
        <div className="h-2 w-[2px] bg-transparent"></div>
        <div
          className={classNames(
            "h-4 w-[5px] rounded-xl",
            green ? "bg-green-600" : orange ? "bg-orange-600" : "bg-gray-400"
          )}
        ></div>
      </div>
    </div>
  );
}
