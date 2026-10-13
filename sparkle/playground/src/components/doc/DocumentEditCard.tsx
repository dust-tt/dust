import { Icon, LayoutAlt02 } from "@dust-tt/sparkle";

// The document an agent message edited, at the end of the message (Figma,
// Co-edition 305:2025, "Bridge between conversation and doc"). Opens the
// document on the edit's changes.

export function DocumentEditCard({
  title,
  subtitle,
  onClick,
}: {
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-border bg-background p-4 text-left transition-colors hover:bg-muted-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border-dark bg-muted-background">
        <Icon visual={LayoutAlt02} size="sm" className="text-foreground" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-base font-medium text-foreground">
          {title}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {subtitle}
        </span>
      </span>
    </button>
  );
}
