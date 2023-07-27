import { Button } from "@dust-tt/sparkle";
import { TrashIcon } from "@heroicons/react/24/solid";

export function AppLayoutTitle({
  title,
  onDelete,
}: {
  title: string;
  onDelete?: () => void;
}) {
  return (
    <div className="flex h-full flex-row items-center">
      <div className="flex flex-initial">
        <div className="w-56 flex-initial overflow-hidden truncate px-10 font-bold sm:w-96 lg:w-auto lg:px-0">
          {title}
        </div>
      </div>
      <div className="flex flex-1"></div>
      {onDelete && (
        <div className="flex flex-initial text-red-800">
          <Button
            labelVisible={false}
            type="secondaryWarning"
            label="Delete"
            icon={TrashIcon}
            onClick={onDelete}
          />
        </div>
      )}
    </div>
  );
}
