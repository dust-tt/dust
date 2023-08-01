import { Button } from "@dust-tt/sparkle";
import { TrashIcon } from "@heroicons/react/24/solid";
import { ComponentType } from "react";

export function AppLayoutTitle({
  readOnly,
  title,
  onDelete,
  action,
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
      </div>
    </div>
  );
}
