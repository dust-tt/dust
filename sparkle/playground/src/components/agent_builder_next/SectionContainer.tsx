import {
  ChevronDown,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Icon,
  Label,
} from "@dust-tt/sparkle";
import { type ReactNode, useEffect, useState } from "react";

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

  useEffect(() => {
    if (defaultOpen) {
      setIsOpen(true);
    }
  }, [defaultOpen]);

  if (!collapsible) {
    return (
      <section className="flex flex-col gap-3">
        <SectionHeader
          title={<h2 className="heading-lg text-foreground">{title}</h2>}
          description={description}
          headerActions={headerActions}
        />
        {children}
      </section>
    );
  }

  // Folded row: title and description are the trigger. The right side holds
  // the summary while folded and the actions while open, then the chevron, so
  // the body only ever holds the section's content.
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <section className="flex flex-col py-4">
        <div className="flex items-center gap-3">
          <CollapsibleTrigger
            hideChevron
            className="min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
          >
            <span className="heading-lg text-foreground">{title}</span>
            {description ? (
              <span className="text-sm text-muted-foreground">
                {description}
              </span>
            ) : null}
          </CollapsibleTrigger>
          {summary && !isOpen ? (
            <span className="shrink-0 text-sm text-muted-foreground">
              {summary}
            </span>
          ) : null}
          {headerActions && isOpen ? (
            <div className="flex shrink-0 items-center gap-2">
              {headerActions}
            </div>
          ) : null}
          <CollapsibleTrigger
            hideChevron
            aria-label={isOpen ? `Collapse ${title}` : `Expand ${title}`}
            className="w-auto shrink-0 rounded-lg p-1 text-muted-foreground hover:text-foreground"
          >
            <Icon
              visual={ChevronDown}
              size="sm"
              className="transition-transform duration-200 group-data-[state=open]/col:rotate-180 motion-reduce:transition-none"
            />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent className="motion-reduce:transition-none">
          <div className="flex flex-col gap-3 pt-3">{children}</div>
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
          <p className="text-sm text-muted-foreground">{description}</p>
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
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-6 py-2">
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
