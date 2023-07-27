import { Button } from "@dust-tt/sparkle";
import {
  ArrowDownOnSquareIcon,
  ArrowUpOnSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";

export function AppLayoutTitle({
  title,
  shared,
  onDelete,
  onShare,
}: {
  title: string;
  shared: boolean;
  onDelete?: () => void;
  onShare?: () => void;
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
            type="tertiary"
            label="Delete"
            icon={TrashIcon}
            onClick={onDelete}
          />
        </div>
      )}
      {onShare && (
        <div className="flex flex-initial text-red-800">
          <Button
            type={shared ? "tertiary" : "primary"}
            label={shared ? "Unshare" : "Share"}
            icon={shared ? ArrowDownOnSquareIcon : ArrowUpOnSquareIcon}
            onClick={onShare}
          />
        </div>
      )}
    </div>
  );
}
