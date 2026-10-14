import { Button, Icon, LayoutAlt02, ReverseLeft } from "@dust-tt/sparkle";

// A version of a document, at the end of the conversation message that made
// it (Figma, Co-edition 305:2025, "Bridge between conversation and doc"; the
// roll-back icon is the "versioning" variant). Opens the document on that
// version.

export function DocumentEditCard({
  title,
  subtitle,
  onClick,
  onRollBack,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
  /** Rolls the document back to this version; absent on the current one. */
  onRollBack?: () => void;
}) {
  return (
    <div className="relative w-full max-w-sm">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-background p-4 text-left transition-colors hover:bg-muted-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border-dark bg-muted-background">
          <Icon visual={LayoutAlt02} size="sm" className="text-foreground" />
        </span>
        <span className="flex min-w-0 flex-col pr-8">
          <span className="truncate text-base font-medium text-foreground">
            {title}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {subtitle}
          </span>
        </span>
      </button>
      {onRollBack && (
        <Button
          size="xs"
          variant="ghost"
          icon={ReverseLeft}
          tooltip="Roll back to this version"
          className="absolute bottom-3 right-3"
          onClick={onRollBack}
        />
      )}
    </div>
  );
}
