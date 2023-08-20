import { Button, CheckCircleIcon } from "@dust-tt/sparkle";
import { LinkIcon } from "@heroicons/react/24/outline";
import { TrashIcon } from "@heroicons/react/24/solid";
import React, { ComponentType, useState } from "react";

import { classNames } from "@app/lib/utils";

export function AppLayoutTitle({
  readOnly,
  title,
  shareLink,
  onDelete,
  action,
  toggle,
}: {
  readOnly?: boolean;
  title: string;
  shareLink?: string;
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
    iconChecked: React.JSX.Element;
    iconUnchecked: React.JSX.Element;
    onToggle: () => void;
    isChecked: boolean;
  };
}) {
  const [copyLinkSuccess, setCopyLinkSuccess] = useState<boolean>(false);
  const handleClick = async () => {
    await navigator.clipboard.writeText(shareLink || "");
    setCopyLinkSuccess(true);
    setTimeout(() => {
      setCopyLinkSuccess(false);
    }, 1000);
  };

  return (
    <div className="flex h-full flex-row items-center">
      <div className="flex flex-initial pl-10 font-bold">
        {shareLink ? (
          <div
            onClick={() => {
              if (shareLink) {
                void handleClick();
              }
            }}
            className={classNames(
              "w-48 overflow-hidden truncate sm:w-96 lg:w-auto lg:px-0",
              shareLink && "cursor-pointer"
            )}
          >
            <span>{title}</span>
            {shareLink && (
              <span className="pl-1">
                {copyLinkSuccess ? (
                  <CheckCircleIcon className="inline-block h-4 w-4 text-action-500" />
                ) : (
                  <LinkIcon className="inline-block h-4 w-4 text-gray-300 hover:text-action-500" />
                )}
              </span>
            )}
          </div>
        ) : (
          <div className="w-48 overflow-hidden truncate sm:w-96 lg:w-auto lg:px-0">
            {title}
          </div>
        )}
      </div>
      <div className="flex flex-1"></div>
      <div className="-ml-8 hidden flex-initial space-x-1 lg:ml-0 lg:flex">
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
                <span className="lg:flex">
                  <span className="hidden lg:inline">
                    {toggle.labelChecked}
                  </span>
                  <span className="lg:hidden">{toggle.iconChecked}</span>
                </span>
              </span>
              <span
                className={classNames(
                  "flex items-center space-x-[6px] rounded-full px-[10px] py-2 text-sm",
                  !toggle.isChecked
                    ? "bg-white font-semibold text-action-500"
                    : "s-opacity-50"
                )}
              >
                <span className="lg:flex">
                  <span className="hidden lg:inline">
                    {toggle.labelUnchecked}
                  </span>
                  <span className="lg:hidden">{toggle.iconUnchecked}</span>
                </span>
              </span>
            </label>
          </>
        )}
      </div>
    </div>
  );
}
