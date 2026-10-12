import {
  ChevronDown,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Icon,
  Label,
} from "@dust-tt/sparkle";
import { type ReactNode, useId, useState } from "react";

/**
 * One top-level block of the builder form: heading, muted description, actions
 * on the right. A collapsible section folds its body behind the heading, shows
 * a short `summary` of its state while folded (and its actions while open),
 * and opens on its own when `defaultOpen` turns true (e.g. the first item
 * added).
 */
export function BuilderSection({
  title,
  description,
  headerActions,
  children,
  collapsible = false,
  defaultOpen = true,
  summary,
}: {
  title: string;
  description?: ReactNode;
  headerActions?: ReactNode;
  children: ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** What the folded row holds, e.g. "2 tools · 1 knowledge". */
  summary?: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  // Open on our own when the section first gains content (`defaultOpen`
  // flips to true). Done during render by remembering the previous prop
  // value, so there is no extra render and no effect to keep in sync.
  const [prevDefaultOpen, setPrevDefaultOpen] = useState(defaultOpen);
  if (defaultOpen !== prevDefaultOpen) {
    setPrevDefaultOpen(defaultOpen);
    if (defaultOpen) {
      setIsOpen(true);
    }
  }
  const titleId = useId();
  const descriptionId = useId();
  const summaryId = useId();

  if (!collapsible) {
    return (
      <section aria-labelledby={titleId} className="flex flex-col gap-3">
        <SectionHeader
          title={
            <h2 id={titleId} className="heading-lg text-foreground">
              {title}
            </h2>
          }
          description={description}
          headerActions={headerActions}
        />
        {children}
      </section>
    );
  }

  // Folded, a section is a status line: title left, current value right, the
  // description hidden. Open, it is title, description and body. The screen
  // reader hears whichever of the two the row shows.
  // The whole header row is one disclosure button: a stretched, otherwise
  // empty trigger sits under the row and takes the click, the hover surface
  // and the focus ring. The visible text is layered above it and lets
  // pointer events fall through, except for links inside the description.
  // Actions, when open, sit above the trigger with their own behaviour, so
  // there is a single tab stop for toggling and no nested buttons.
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <section aria-labelledby={titleId} className="flex flex-col py-2">
        <div className="relative -mx-3 flex min-h-12 items-center gap-3 px-3 py-2">
          <CollapsibleTrigger
            hideChevron
            aria-labelledby={titleId}
            aria-describedby={
              [
                description && isOpen ? descriptionId : null,
                summary && !isOpen ? summaryId : null,
              ]
                .filter(Boolean)
                .join(" ") || undefined
            }
            className="absolute inset-0 rounded-xl transition-colors hover:bg-muted-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring active:bg-muted-background motion-reduce:transition-none"
          />
          <div className="pointer-events-none relative flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 id={titleId} className="heading-lg text-foreground">
              {title}
            </h2>
            {description && isOpen ? (
              <p
                id={descriptionId}
                className="text-pretty text-sm text-muted-foreground [&_a]:pointer-events-auto"
              >
                {description}
              </p>
            ) : null}
          </div>
          {summary && !isOpen ? (
            <span
              id={summaryId}
              className="pointer-events-none relative max-w-[55%] shrink-0 truncate text-sm tabular-nums text-foreground"
            >
              {summary}
            </span>
          ) : null}
          {headerActions && isOpen ? (
            <div className="relative flex shrink-0 items-center gap-2">
              {headerActions}
            </div>
          ) : null}
          <span
            aria-hidden
            className="pointer-events-none relative flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground"
          >
            <Icon
              visual={ChevronDown}
              size="sm"
              className={[
                "transition-transform duration-250 ease-out motion-reduce:transition-none",
                isOpen ? "rotate-180" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          </span>
        </div>
        {/* The body is always mounted and its height is a CSS transition on
            grid rows, not a keyframe: a second click mid-motion retargets
            from the current height instead of restarting from zero. Closed,
            it is inert so nothing inside can take focus. */}
        <CollapsibleContent
          forceMount
          animated={false}
          {...({ inert: isOpen ? undefined : "" } as Record<string, unknown>)}
          className="grid transition-[grid-template-rows,opacity] duration-250 ease-out data-[state=closed]:grid-rows-[0fr] data-[state=closed]:opacity-0 data-[state=open]:grid-rows-[1fr] motion-reduce:transition-none"
        >
          <div className="min-h-0 overflow-hidden">
            <div className="flex flex-col gap-3 pb-2 pt-1">{children}</div>
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  );
}

function SectionHeader({
  title,
  description,
  headerActions,
}: {
  title: ReactNode;
  description?: ReactNode;
  headerActions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        {title}
        {description ? (
          <p className="text-pretty text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {headerActions ? (
        <div className="flex shrink-0 items-center gap-2">{headerActions}</div>
      ) : null}
    </div>
  );
}

/** A labelled subsection: a bold label above its control. */
export function SettingSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={["flex flex-col gap-2", className].filter(Boolean).join(" ")}
    >
      <Label className="text-base font-semibold">{title}</Label>
      {children}
    </div>
  );
}

/** A hairline-separated list of FieldRows, the body of a folded section. */
export function FieldGroup({ children }: { children: ReactNode }) {
  return <div className="flex flex-col divide-y divide-border">{children}</div>;
}

/**
 * One setting inside a folded section: label on the left, control flush
 * right, so every body shares the same two alignment edges.
 */
export function FieldRow({
  label,
  children,
  hint,
  className,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  /** Extra classes on the row, e.g. an enter transition for rows that appear on demand. */
  className?: string;
}) {
  return (
    <div
      className={[
        "flex min-h-12 items-center justify-between gap-6 py-2",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex min-w-0 flex-col">
        <span className="text-sm text-foreground">{label}</span>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {children}
      </div>
    </div>
  );
}
