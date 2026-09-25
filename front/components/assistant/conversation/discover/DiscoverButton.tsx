import { classNames } from "@app/lib/utils";
import { Icon, Stars02 } from "@dust-tt/sparkle";

interface DiscoverButtonProps {
  onClick: () => void;
  isOpening: boolean;
}

export function DiscoverButton({ onClick, isOpening }: DiscoverButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        "group relative inline-flex h-9 items-center gap-2 rounded-full pl-3 pr-4",
        "border border-border bg-background text-foreground",
        "shadow-[0px_1px_1px_-0.5px_rgba(0,0,0,0.05),0px_2px_4px_-2px_rgba(0,0,0,0.06)]",
        "transition-[color,background-color,border-color,box-shadow,scale,translate] duration-[160ms] ease-emphasized",
        "[@media(hover:hover)_and_(pointer:fine)]:hover:-translate-y-px",
        "[@media(hover:hover)_and_(pointer:fine)]:hover:shadow-[0px_2px_2px_-1px_rgba(0,0,0,0.06),0px_6px_10px_-4px_rgba(0,0,0,0.10)]",
        "active:translate-y-0 active:scale-[0.97] motion-reduce:active:scale-100",
        isOpening &&
          "border-highlight-200 bg-highlight-50 text-highlight-700 dark:border-highlight-800"
      )}
    >
      <span
        aria-hidden
        className={classNames(
          "relative flex transition-[color,rotate] duration-300 ease-emphasized motion-reduce:rotate-0",
          isOpening ? "rotate-90 text-highlight-500" : "text-muted-foreground",
          "[@media(hover:hover)_and_(pointer:fine)]:group-hover:text-highlight-500"
        )}
      >
        <Icon visual={Stars02} size="xs" />
      </span>
      <span className="relative grid heading-sm">
        <span
          aria-hidden={isOpening}
          className={classNames(
            "col-start-1 row-start-1 transition-[opacity,translate,filter] duration-200 ease-emphasized motion-reduce:transition-opacity",
            isOpening &&
              "-translate-y-1 opacity-0 blur-[2px] motion-reduce:translate-y-0 motion-reduce:blur-none"
          )}
        >
          Discover Skills and agents
        </span>
        <span
          aria-hidden={!isOpening}
          className={classNames(
            "col-start-1 row-start-1 transition-[opacity,translate,filter] duration-200 ease-emphasized motion-reduce:transition-opacity",
            !isOpening &&
              "translate-y-1 opacity-0 blur-[2px] motion-reduce:translate-y-0 motion-reduce:blur-none"
          )}
        >
          Opening Discover
        </span>
      </span>
    </button>
  );
}
