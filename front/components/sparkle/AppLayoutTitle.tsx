import { Button } from "@dust-tt/sparkle";
import { TrashIcon } from "@heroicons/react/24/solid";
import React, { ComponentType } from "react";

import { classNames } from "@app/lib/utils";

export function AppLayoutTitle({
  readOnly,
  title,
  onDelete,
  action,
  toggle,
}: {
  readOnly?: boolean;
  title: string;
  onDelete?: () => void;
  action?: {
    label: string;
    labelVisible: boolean;
    icon?: ComponentType;
    onAction: () => void;
  };
  toggle?: {
    labelChecked: string;
    labelUnchecked: string;
    onToggle: () => void;
    isChecked: boolean;
  };
}) {
  return (
    <div className="flex h-full flex-row items-center">
      <div className="flex flex-initial">
        <div className="w-48 flex-initial overflow-hidden truncate px-10 font-bold sm:w-96 lg:w-auto lg:px-0">
          {title}
        </div>
      </div>
      <div className="flex flex-1"></div>
      <div className="-ml-8 flex flex-initial space-x-1 lg:ml-0">
        {!readOnly && onDelete && (
          <div className="flex flex-initial">
            <Button
              labelVisible={false}
              type="secondaryWarning"
              label="Delete"
              icon={TrashIcon}
              onClick={onDelete}
            />
          </div>
        )}
        {!readOnly && action && (
          <div className="flex flex-initial">
            <Button
              labelVisible={action.labelVisible}
              type="secondary"
              label={action.label}
              icon={action.icon}
              onClick={action.onAction}
            />
          </div>
        )}
        {!readOnly && toggle && (
          <>
            <label className="relative inline-flex cursor-pointer select-none items-center justify-center rounded-full border border-gray-300 bg-gray-200">
              <input
                type="checkbox"
                className="sr-only"
                checked={toggle.isChecked}
                onChange={toggle.onToggle}
              />
              <span
                className={classNames(
                  "flex items-center space-x-[6px] rounded-full px-[10px] py-2 text-sm",
                  toggle.isChecked
                    ? "bg-white font-semibold text-action-500"
                    : "s-opacity-50"
                )}
              >
                {toggle.labelChecked}
              </span>
              <span
                className={classNames(
                  "flex items-center space-x-[6px] rounded-full px-[10px] py-2 text-sm",
                  !toggle.isChecked
                    ? "bg-white font-semibold text-action-500"
                    : "s-opacity-50"
                )}
              >
                {toggle.labelUnchecked}
              </span>
            </label>
          </>
        )}
      </div>
    </div>
  );
}
