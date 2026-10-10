import {
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  Card,
  Chip,
  Page,
  Plus,
  SliderToggle,
  XClose,
} from "@dust-tt/sparkle";
import { cn } from "@sparkle/lib/utils";
import {
  Children,
  type ComponentType,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useContext,
  useState,
} from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@dust-tt/sparkle";

// ── Page scaffolding ──────────────────────────────────────────────────────────

/** One admin page: header (title + the question it answers) and stacked sections. */
export function AdminPage({
  title,
  question,
  action,
  children,
}: {
  title: string;
  /** Page description, worded like the live admin. */
  question: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-8 pb-24 pt-10">
      <div className="flex items-start justify-between gap-6">
        <Page.Header title={title} description={question} noTopPadding />
        {action && <div className="pt-1 shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

type AdminTabProps = {
  value: string;
  label: string;
  /** Small counter shown in the tab trigger. */
  count?: string;
  children: ReactNode;
};

/** One tab of an admin page. Only meaningful as a direct child of AdminTabs. */
export function AdminTab({ children }: AdminTabProps) {
  return <>{children}</>;
}

/** Splits a page into digestible blocks: a tab row under the header, one topic per tab. */
export function AdminTabs({
  children,
  storageKey,
}: {
  children: ReactNode;
  /** Remember the active tab across reloads. */
  storageKey: string;
}) {
  const tabs = Children.toArray(children).filter(
    (c): c is ReactElement<AdminTabProps> => isValidElement(c) && c.type === AdminTab
  );
  const key = `sparkle-playground-admin-tab-${storageKey}`;
  const [value, setValue] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved && tabs.some((t) => t.props.value === saved) ? saved : tabs[0]?.props.value ?? "";
    } catch {
      return tabs[0]?.props.value ?? "";
    }
  });
  const onChange = (v: string) => {
    setValue(v);
    try {
      localStorage.setItem(key, v);
    } catch {
      // ignore
    }
  };
  return (
    <Tabs value={value} onValueChange={onChange} className="-mt-4">
      <TabsList className="mb-8">
        {tabs.map((t) => (
          <TabsTrigger
            key={t.props.value}
            value={t.props.value}
            label={t.props.label}
            isCounter={!!t.props.count}
            counterValue={t.props.count}
          />
        ))}
      </TabsList>
      {tabs.map((t) => (
        <TabsContent key={t.props.value} value={t.props.value} className="flex flex-col gap-10">
          {t.props.children}
        </TabsContent>
      ))}
    </Tabs>
  );
}

/** A titled block on an admin page; the border card holds divided rows or free content. */
export function AdminSection({
  icon: _icon,
  title,
  description,
  action,
  children,
  plain,
}: {
  /** Accepted for call-site compatibility; section headings render without an icon. */
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  /** Render children without the bordered card (for tables and KPI grids). */
  plain?: boolean;
}) {
  return (
    <section
      data-admin-section={title}
      className="flex w-full scroll-mt-6 flex-col gap-4 rounded-2xl transition-shadow duration-700 [&.is-target]:shadow-[0_0_0_4px_var(--color-highlight-300)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-0.5">
          <Page.H variant="h5">{title}</Page.H>
          {description && (
            <Page.P variant="secondary" size="sm">
              {description}
            </Page.P>
          )}
        </div>
        {action}
      </div>
      {plain ? (
        children
      ) : (
        <div className="w-full divide-y divide-border rounded-2xl border border-border">
          {children}
        </div>
      )}
    </section>
  );
}

/** A setting row: label + description on the left, a control on the right, optional body below. */
export function Row({
  title,
  description,
  action,
  children,
  titleSuffix,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
  /** Chips or status shown right after the title, like "Enabled" on SSO. */
  titleSuffix?: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-3 p-4">
      <div className="flex w-full items-center justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="heading-sm flex items-center gap-2 text-foreground">
            {title}
            {titleSuffix}
          </span>
          {description && (
            <span className="copy-sm text-muted-foreground">{description}</span>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}

// ── Controls ──────────────────────────────────────────────────────────────────

/** Everyone / Groups / Admins only. When "Groups" is picked, a chip row appears. */
export function PermissionRow({
  title,
  description,
  defaultScope = "everyone",
  defaultGroups = [],
}: {
  title: string;
  description: string;
  defaultScope?: "everyone" | "groups" | "admins_only";
  defaultGroups?: string[];
}) {
  const [scope, setScope] = useState<string>(defaultScope);
  const [groups, setGroups] = useState<string[]>(defaultGroups);
  return (
    <Row
      title={title}
      description={description}
      action={
        <ButtonsSwitchList size="xs" value={scope} onValueChange={setScope}>
          <ButtonsSwitch value="everyone" label="Everyone" />
          <ButtonsSwitch value="groups" label="Groups" />
          <ButtonsSwitch value="admins_only" label="Admins only" />
        </ButtonsSwitchList>
      }
    >
      {scope === "groups" && (
        <GroupChips groups={groups} onChange={setGroups} />
      )}
    </Row>
  );
}

/** A row whose only control is a list of groups. */
export function GroupsRow({
  title,
  description,
  defaultGroups = [],
}: {
  title: string;
  description: string;
  defaultGroups?: string[];
}) {
  const [groups, setGroups] = useState<string[]>(defaultGroups);
  return (
    <Row title={title} description={description}>
      <GroupChips groups={groups} onChange={setGroups} />
    </Row>
  );
}

const ALL_GROUPS = [
  "team-france",
  "team-us",
  "team-nyc",
  "team-sf",
  "engineering-mdm",
  "support-mdm",
  "security-mdm",
  "Billing",
  "ai-ops",
];

export function GroupChips({
  groups,
  onChange,
}: {
  groups: string[];
  onChange: (groups: string[]) => void;
}) {
  const next = ALL_GROUPS.find((g) => !groups.includes(g));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="xs"
        variant="outline"
        icon={Plus}
        label="Add a group"
        isSelect
        disabled={!next}
        onClick={() => next && onChange([...groups, next])}
      />
      {groups.map((g) => (
        <Chip
          key={g}
          size="xs"
          color="highlight"
          label={g}
          onRemove={() => onChange(groups.filter((x) => x !== g))}
        />
      ))}
    </div>
  );
}

export function ToggleRow({
  title,
  description,
  defaultOn = false,
  extra,
}: {
  title: string;
  description: ReactNode;
  defaultOn?: boolean;
  extra?: ReactNode;
}) {
  const [on, setOn] = useState(defaultOn);
  return (
    <Row
      title={title}
      description={description}
      action={
        <div className="flex items-center gap-2">
          {extra}
          <SliderToggle selected={on} onClick={() => setOn(!on)} />
        </div>
      }
    />
  );
}

export function ActionRow({
  title,
  description,
  label,
  variant = "outline",
  icon,
  children,
}: {
  title: string;
  description: string;
  label: string;
  variant?: "outline" | "primary" | "warning" | "ghost";
  icon?: ComponentType<{ className?: string }>;
  children?: ReactNode;
}) {
  return (
    <Row
      title={title}
      description={description}
      action={<Button size="sm" variant={variant} label={label} icon={icon} />}
    >
      {children}
    </Row>
  );
}

export function ValueRow({
  title,
  description,
  value,
  unit,
  editable = true,
}: {
  title: string;
  description: ReactNode;
  value: string;
  unit?: string;
  editable?: boolean;
}) {
  return (
    <Row
      title={title}
      description={description}
      action={
        editable ? (
          <div className="flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-3">
            <span className="copy-sm tabular-nums text-foreground">{value}</span>
            {unit && <span className="copy-xs text-muted-foreground">{unit}</span>}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="heading-sm text-foreground">{value}</span>
            {unit && <span className="copy-sm text-muted-foreground">{unit}</span>}
          </div>
        )
      }
    />
  );
}

export function SelectRow({
  title,
  description,
  options,
  defaultValue,
}: {
  title: string;
  description: string;
  options: string[];
  defaultValue?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? options[0]);
  return (
    <Row
      title={title}
      description={description}
      action={
        <ButtonsSwitchList size="xs" value={value} onValueChange={setValue}>
          {options.map((o) => (
            <ButtonsSwitch key={o} value={o} label={o} />
          ))}
        </ButtonsSwitchList>
      }
    />
  );
}

// ── Data display ──────────────────────────────────────────────────────────────

export function KpiCard({
  label,
  value,
  hint,
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  className?: string;
}) {
  return (
    <Card size="md" variant="secondary" className={cn("flex-1", className)}>
      <div className="flex flex-col gap-1">
        <span className="copy-xs text-muted-foreground">{label}</span>
        <span className="heading-xl text-foreground">{value}</span>
        {hint && <span className="copy-xs text-muted-foreground">{hint}</span>}
      </div>
    </Card>
  );
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-3">{children}</div>;
}

/** Small pill used inline for status values. */
export function Status({
  label,
  color = "success",
}: {
  label: string;
  color?: "primary" | "success" | "warning" | "info" | "highlight";
}) {
  return <Chip size="xs" color={color} label={label} />;
}

/** Whether "moved from" markers are shown. Off by default so the mock reads as the real product. */
export const ShowOriginsContext = createContext(false);

/** Tiny "moved from" marker so reviewers can trace a card back to the old IA. */
export function MovedFrom({ from }: { from: string }) {
  const show = useContext(ShowOriginsContext);
  if (!show) {
    return null;
  }
  return (
    <span
      className="copy-xs rounded-md bg-muted-background px-1.5 py-0.5 text-muted-foreground"
      title={`Previously under ${from}`}
    >
      ← {from}
    </span>
  );
}

export { XClose };
