import type React from "react";
import {
  ArrowDownOnSquareIcon,
  Avatar,
  BarChartIcon,
  BracesIcon,
  Button,
  ButtonsSwitch,
  ButtonsSwitchList,
  CardIcon,
  Checkbox,
  Cog6ToothIcon,
  ContextItem,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  GlobeAltIcon,
  GoogleSpreadsheetLogo,
  Icon,
  LockIcon,
  NavigationList,
  NavigationListCollapsibleSection,
  NavigationListItem,
  Page,
  Pagination,
  ScrollableDataTable,
  ShapesIcon,
  SidebarLayout,
  type SidebarLayoutRef,
  SidebarLeftCloseIcon,
  SidebarLeftOpenIcon,
  UserIcon,
  ValueCard,
} from "@dust-tt/sparkle";
import type { CellContext, ColumnDef } from "@tanstack/react-table";
import { useMemo, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DEFAULT_PERIOD,
  getMockAdoptionByDepartment,
  getMockWorkspaceHealth,
  getMockImpactClassification,
  getMockImpactOverTime,
  getMockMonthOptions,
  getMockOverview,
  getMockSourceData,
  getMockToolUsage,
  getMockTopAgents,
  getMockTopBuildersExtended,
  getMockTopUsers,
  getMockUsageMetrics,
  type PeriodDays,
} from "../data/analytics";

const PERIOD_OPTIONS: PeriodDays[] = [7, 14, 30, 90];

const CHART_HEIGHT = 180;

const CARD_CLASS =
  "s-rounded-2xl s-bg-background s-p-6 sm:s-p-8 s-border s-border-border/50 dark:s-bg-background-night dark:s-border-border-night/50";
const SECTION_LABEL =
  "s-text-[11px] s-font-medium s-tracking-[0.2em] s-uppercase s-text-muted-foreground/70 dark:s-text-muted-foreground-night/70";

const USAGE_PALETTE = {
  messages: "s-text-golden-500 dark:s-text-golden-500-night",
  conversations: "s-text-blue-500 dark:s-text-blue-500-night",
} as const;

const ACTIVE_USERS_PALETTE = {
  dau: "s-text-blue-500 dark:s-text-blue-500-night",
  wau: "s-text-violet-500 dark:s-text-violet-500-night",
  mau: "s-text-golden-500 dark:s-text-golden-500-night",
} as const;

const INDEXED_COLORS = [
  "s-text-orange-500 dark:s-text-orange-500-night",
  "s-text-golden-500 dark:s-text-golden-500-night",
  "s-text-green-500 dark:s-text-green-500-night",
  "s-text-violet-500 dark:s-text-violet-500-night",
  "s-text-rose-500 dark:s-text-rose-500-night",
] as const;

function ChartTooltipCard({
  title,
  rows,
}: {
  title?: string;
  rows: { label: string; value: string; colorClassName?: string }[];
}) {
  return (
    <div
      role="tooltip"
      className="s-min-w-32 s-rounded-xl s-border s-border-border/60 s-bg-background s-px-3 s-py-2 s-text-xs s-leading-relaxed s-shadow-lg dark:s-border-border-night/60 dark:s-bg-background-night"
    >
      {title && (
        <div className="s-mb-1 s-font-medium s-text-foreground dark:s-text-foreground-night">
          {title}
        </div>
      )}
      <ul className="s-space-y-1.5">
        {rows.map((r) => (
          <li key={r.label} className="s-flex s-items-center s-gap-2">
            {r.colorClassName && (
              <span
                aria-hidden
                className={`s-inline-block s-h-2.5 s-w-2.5 s-rounded-sm s-bg-current ${r.colorClassName}`}
              />
            )}
            <span className="s-text-muted-foreground dark:s-text-muted-foreground-night">
              {r.label}
            </span>
            <span className="s-ml-auto s-font-mono s-font-medium s-tabular-nums s-text-foreground dark:s-text-foreground-night">
              {r.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function mockExport(chartTitle: string) {
  alert(`Export: "${chartTitle}" (mock — no file downloaded in playground).`);
}

function ChartCard({
  title,
  description,
  legendItems,
  height = CHART_HEIGHT,
  children,
  additionalControls,
  onExport,
}: {
  title: string;
  description: string;
  legendItems?: { key: string; label: string; colorClassName: string }[];
  height?: number;
  children: React.ReactElement;
  additionalControls?: React.ReactNode;
  onExport?: () => void;
}) {
  return (
    <div className={`s-relative s-z-0 s-isolate s-h-full s-flex s-flex-col s-transition-[z-index] hover:s-z-10 ${CARD_CLASS}`}>
      <div className="s-flex s-shrink-0 s-items-start s-justify-between s-gap-4">
        <div className="s-min-w-0">
          <h3 className="s-text-sm s-font-semibold s-tracking-tight s-text-foreground dark:s-text-foreground-night">{title}</h3>
          {description && (
            <p className="s-mt-1 s-text-xs s-leading-relaxed s-text-muted-foreground dark:s-text-muted-foreground-night">{description}</p>
          )}
        </div>
        <div className="s-flex s-shrink-0 s-items-center s-gap-2">
          {additionalControls}
          {onExport != null && (
            <Button variant="tertiary" size="xs" icon={ArrowDownOnSquareIcon} label="Export" onClick={onExport} />
          )}
        </div>
      </div>
      <div className="s-relative s-z-0 s-mt-3 s-flex-1 s-min-h-0 s-w-full" style={{ width: "100%", minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%" minHeight={height}>
          {children}
        </ResponsiveContainer>
      </div>
      {legendItems && legendItems.length > 0 && (
        <div className="s-shrink-0 s-mt-3 s-flex s-flex-wrap s-items-center s-gap-x-5 s-gap-y-1.5">
          {legendItems.map((item) => (
            <div key={item.key} className="s-flex s-items-center s-gap-2">
              <span aria-hidden className={`s-inline-block s-h-2 s-w-2 s-rounded-full s-bg-current ${item.colorClassName}`} />
              <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">{item.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InsightCardsRow({ period }: { period: number }) {
  const overview = getMockOverview(period);
  return (
    <div className="s-grid s-w-full s-grid-cols-2 s-gap-4">
      <ValueCard
        title="Members"
        className="s-h-24 s-w-full s-min-w-0"
        content={
          <div className="s-flex s-flex-col s-gap-1 s-text-2xl">
            <div className="s-truncate s-text-foreground dark:s-text-foreground-night">
              {overview.totalMembers.toLocaleString()}
            </div>
          </div>
        }
      />
      <ValueCard
        title="Active users"
        className="s-h-24 s-w-full s-min-w-0"
        content={
          <div className="s-flex s-flex-col s-gap-1 s-text-2xl">
            <div className="s-truncate s-text-foreground dark:s-text-foreground-night">
              {overview.activeUsers.toLocaleString()}
            </div>
          </div>
        }
      />
    </div>
  );
}

const WORKSPACE_HEALTH_BAR_COLOR = "s-bg-gray-100 dark:s-bg-gray-100-night";

function getDustScoreSummary(score: number, focusArea: string): string {
  if (score >= 80) {
    return `Coverage (who knows Dust), activity (who finds value), and stickiness (weekly return) are all strong. Keep sharing wins and use cases to sustain adoption.`;
  }
  if (score >= 60) {
    return `The main lever to improve further is **${focusArea}**: invest there (e.g. onboarding, templates, or habit loops) to push the score toward the top tier.`;
  }
  if (score >= 40) {
    return `The biggest opportunity is **${focusArea}**—improving it will move the needle most. Review the metric breakdown below and target one or two concrete actions.`;
  }
  return `Start by focusing on **${focusArea}**: build awareness, demonstrate value, or encourage weekly usage depending on the metric. The breakdown below shows where to act first.`;
}

function WorkspaceHealthCard() {
  const dust = getMockWorkspaceHealth();
  const summary = getDustScoreSummary(dust.score, dust.focusArea);
  return (
    <div className={CARD_CLASS}>
      <div className="s-mb-5 s-flex s-items-center s-justify-between s-gap-4">
        <div className="s-flex s-items-center s-gap-4">
          <div className="s-relative s-shrink-0 s-flex s-h-14 s-w-14 s-items-center s-justify-center" aria-hidden>
            <svg className="s-absolute s-inset-0 s-h-full s-w-full" style={{ transform: "rotate(-90deg)" }} viewBox="0 0 36 36">
              <circle
                className="s-stroke-muted-background dark:s-stroke-muted-background-night"
                strokeWidth="3"
                fill="none"
                cx="18"
                cy="18"
                r="15.9"
              />
              <circle
                className="s-stroke-green-500 dark:s-stroke-green-500-night"
                strokeWidth="3"
                strokeDasharray={`${(dust.score / 100) * (2 * Math.PI * 15.9)} ${(1 - dust.score / 100) * (2 * Math.PI * 15.9)}`}
                strokeLinecap="round"
                fill="none"
                cx="18"
                cy="18"
                r="15.9"
              />
            </svg>
            <span className="s-text-xl s-font-bold s-tabular-nums s-text-green-700 dark:s-text-green-400">{dust.score}</span>
          </div>
          <div>
            <h3 className="s-text-sm s-font-semibold s-tracking-tight s-text-foreground dark:s-text-foreground-night">Workspace health</h3>
            <p className="s-mt-1 s-text-xs s-leading-relaxed s-text-muted-foreground dark:s-text-muted-foreground-night">
              {summary.split("**").map((part, i) => (i % 2 === 1 ? <strong key={i} className="s-font-medium s-text-foreground dark:s-text-foreground-night">{part}</strong> : part))}
            </p>
          </div>
        </div>
        <Button variant="tertiary" size="xs" icon={ArrowDownOnSquareIcon} label="Export" onClick={() => mockExport("Workspace health")} />
      </div>
      <div className="s-space-y-5">
        {dust.metrics.map((m) => (
          <div
            key={m.key}
            className="s-group s-relative s-flex s-w-full s-cursor-default s-items-center s-gap-4"
          >
            <div className="s-relative s-flex-1 s-min-w-0 s-h-9">
              <div
                className={`s-absolute s-left-0 s-top-0 s-bottom-0 s-rounded-lg ${WORKSPACE_HEALTH_BAR_COLOR}`}
                style={{ width: `${Math.max(m.valuePct, 8)}%` }}
              />
              <div className="s-absolute s-inset-0 s-flex s-items-center s-px-3 s-pointer-events-none">
                <span
                  className="s-text-sm s-font-medium s-text-foreground dark:s-text-foreground-night s-truncate"
                  style={{ maxWidth: `${m.valuePct}%` }}
                >
                  {m.label}
                </span>
              </div>
            </div>
            <span className="s-w-16 s-shrink-0 s-text-right s-text-sm s-font-medium s-text-foreground dark:s-text-foreground-night s-tabular-nums">
              {m.valuePct}%
            </span>
            <div
              role="tooltip"
              className="s-pointer-events-none s-absolute s-bottom-full s-left-0 s-z-[100] s-mb-2 s-max-w-xs s-rounded-lg s-border s-border-border/60 s-bg-background s-px-3 s-py-2 s-text-xs s-leading-relaxed s-text-foreground s-shadow-md s-opacity-0 s-transition-opacity s-duration-150 group-hover:s-opacity-100 dark:s-border-border-night/60 dark:s-bg-background-night dark:s-text-foreground-night"
            >
              {m.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const ADOPTION_BAR_COLOR =
  "s-bg-gray-100 dark:s-bg-gray-100-night";

function AdoptionByDepartmentChart({ period }: { period: number }) {
  const data = useMemo(() => getMockAdoptionByDepartment(period), [period]);
  return (
    <div className={CARD_CLASS}>
      <div className="s-mb-5 s-flex s-items-center s-justify-between s-gap-4">
        <div>
          <h3 className="s-text-sm s-font-semibold s-tracking-tight s-text-foreground dark:s-text-foreground-night">Adoption by department</h3>
          <p className="s-mt-1 s-text-xs s-leading-relaxed s-text-muted-foreground dark:s-text-muted-foreground-night">Active members per department</p>
        </div>
        <Button variant="tertiary" size="xs" icon={ArrowDownOnSquareIcon} label="Export" onClick={() => mockExport("Adoption by Department")} />
      </div>
      <div className="s-flex s-items-center s-border-b s-border-border/60 s-pb-3 s-mb-4 dark:s-border-border-night/60">
        <span className="s-flex-1 s-text-xs s-font-medium s-text-muted-foreground dark:s-text-muted-foreground-night uppercase s-tracking-wide">
          Department
        </span>
        <span className="s-w-16 s-text-right s-text-xs s-font-medium s-text-muted-foreground dark:s-text-muted-foreground-night uppercase s-tracking-wide">
          Adoption
        </span>
      </div>
      <div className="s-space-y-5">
        {data.map((row) => (
          <div
            key={row.department}
            className="s-group s-relative s-flex s-w-full s-cursor-default s-items-center s-gap-4"
          >
            <div className="s-relative s-flex-1 s-min-w-0 s-h-9">
              <div
                className={`s-absolute s-left-0 s-top-0 s-bottom-0 s-rounded-lg ${ADOPTION_BAR_COLOR}`}
                style={{ width: `${Math.max(row.pct, 8)}%` }}
              />
              <div className="s-absolute s-inset-0 s-flex s-items-center s-px-3 s-pointer-events-none">
                <span
                  className="s-text-sm s-font-medium s-text-foreground dark:s-text-foreground-night s-truncate"
                  style={{ maxWidth: `${row.pct}%` }}
                >
                  {row.department}
                </span>
              </div>
            </div>
            <span className="s-w-16 s-shrink-0 s-text-right s-text-sm s-font-medium s-text-foreground dark:s-text-foreground-night s-tabular-nums">
              {row.pct}%
            </span>
            <div
              role="tooltip"
              className="s-pointer-events-none s-absolute s-bottom-full s-left-0 s-z-[100] s-mb-2 s-max-w-xs s-rounded-lg s-border s-border-border/60 s-bg-background s-px-3 s-py-2 s-text-xs s-leading-relaxed s-text-foreground s-shadow-md s-opacity-0 s-transition-opacity s-duration-150 group-hover:s-opacity-100 dark:s-border-border-night/60 dark:s-bg-background-night dark:s-text-foreground-night"
            >
              {row.active} active / {row.total} total
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const USAGE_TYPE_LINE_CONFIG = [
  { dataKey: "advancedUseCase" as const, name: "Advanced use case", stroke: "var(--color-violet-500, #8b5cf6)" },
  { dataKey: "genericUsage" as const, name: "Generic usage", stroke: "var(--color-muted-foreground, #9ca3af)" },
];

function ImpactClassificationCard({ period }: { period: number }) {
  const impact = getMockImpactClassification();
  const overTime = useMemo(() => getMockImpactOverTime(period), [period]);
  if (!impact.available || !impact.categories) {
    return (
      <div className="s-rounded-xl s-border s-border-border/50 s-bg-muted-background/40 s-p-8 s-text-center dark:s-border-border-night/50 dark:s-bg-muted-background-night/40">
        <p className="s-text-sm s-leading-relaxed s-text-muted-foreground dark:s-text-muted-foreground-night">
          Advanced vs generic usage will appear here once enabled
        </p>
      </div>
    );
  }
  return (
    <div className={`s-h-full s-flex s-flex-col ${CARD_CLASS}`}>
      <div className="s-shrink-0 s-mb-3 s-flex s-items-start s-justify-between s-gap-4">
        <div className="s-min-w-0">
          <h3 className="s-text-sm s-font-semibold s-tracking-tight s-text-foreground dark:s-text-foreground-night">Advanced use case vs Generic usage</h3>
          <p className="s-mt-1 s-text-xs s-leading-relaxed s-text-muted-foreground dark:s-text-muted-foreground-night">
            Advanced use case: retrieval, company data, multi-step workflows.
            <br />
            Generic usage: simple questions and basic back-and-forth.
          </p>
        </div>
        <Button variant="tertiary" size="xs" icon={ArrowDownOnSquareIcon} label="Export" onClick={() => mockExport("Advanced vs Generic usage")} />
      </div>
      <div className="s-relative s-z-0 s-mt-1 s-flex-1 s-min-h-0">
        <ResponsiveContainer width="100%" height="100%" minHeight={CHART_HEIGHT}>
          <LineChart data={overTime} margin={{ top: 4, right: 0, left: 4, bottom: 16 }}>
            <CartesianGrid vertical={false} className="s-stroke-border dark:s-stroke-border-night" />
            <XAxis
              dataKey="week"
              type="category"
              tickLine={false}
              axisLine={false}
              className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night"
              tickMargin={8}
              minTickGap={24}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night"
              tickMargin={8}
              allowDecimals={false}
              label={{ value: "WAUs", angle: -90, position: "insideLeft", className: "s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night" }}
            />
            <RechartsTooltip
              isAnimationActive={false}
              cursor={false}
              wrapperStyle={{ outline: "none", zIndex: 9999 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const rows = payload.map((p) => ({
                  label: USAGE_TYPE_LINE_CONFIG.find((c) => c.dataKey === p.dataKey)?.name ?? String(p.dataKey),
                  value: typeof p.value === "number" ? p.value.toLocaleString() : String(p.value ?? ""),
                }));
                return <ChartTooltipCard title={String(label ?? "")} rows={rows} />;
              }}
            />
            {USAGE_TYPE_LINE_CONFIG.map((c) => (
              <Line
                key={c.dataKey}
                type="monotone"
                dataKey={c.dataKey}
                name={c.name}
                stroke={c.stroke}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="s-shrink-0 s-mt-3 s-flex s-flex-wrap s-items-center s-gap-x-5 s-gap-y-1.5">
        {USAGE_TYPE_LINE_CONFIG.map((c) => (
          <div key={c.dataKey} className="s-flex s-items-center s-gap-2">
            <span aria-hidden className="s-inline-block s-h-2 s-w-2 s-rounded-full" style={{ backgroundColor: c.stroke }} />
            <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">{c.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

type UsageDisplayMode = "activity" | "users";

const USAGE_LEGEND = [
  { key: "messages", label: "Messages", colorClassName: USAGE_PALETTE.messages },
  {
    key: "conversations",
    label: "Conversations",
    colorClassName: USAGE_PALETTE.conversations,
  },
];

const ACTIVE_USERS_LEGEND = [
  { key: "dau", label: "DAU", colorClassName: ACTIVE_USERS_PALETTE.dau },
  { key: "wau", label: "WAU", colorClassName: ACTIVE_USERS_PALETTE.wau },
  { key: "mau", label: "MAU", colorClassName: ACTIVE_USERS_PALETTE.mau },
];

function UsageChart({ period }: { period: number }) {
  const [displayMode, setDisplayMode] = useState<UsageDisplayMode>("activity");
  const rawData = useMemo(() => getMockUsageMetrics(period), [period]);
  const totalMembers = getMockOverview(period).totalMembers;
  const data = useMemo(() => {
    if (totalMembers <= 0) return rawData;
    return rawData.map((d) => ({
      ...d,
      dauPct: Math.round((d.dau / totalMembers) * 1000) / 10,
      wauPct: Math.round((d.wau / totalMembers) * 1000) / 10,
      mauPct: Math.round((d.mau / totalMembers) * 1000) / 10,
    }));
  }, [rawData, totalMembers]);
  const legendItems = displayMode === "activity" ? USAGE_LEGEND : ACTIVE_USERS_LEGEND;
  const description =
    displayMode === "activity"
      ? `Messages and conversations (last ${period} days)`
      : `Daily, weekly, monthly active users (last ${period} days)`;

  const modeSelector = (
    <ButtonsSwitchList
      defaultValue={displayMode}
      size="xs"
      onValueChange={(v) => setDisplayMode(v as UsageDisplayMode)}
    >
      <ButtonsSwitch value="activity" label="Activity" />
      <ButtonsSwitch value="users" label="Users" />
    </ButtonsSwitchList>
  );

  return (
    <ChartCard
      title="Activity"
      description={description}
      legendItems={legendItems}
      additionalControls={modeSelector}
      onExport={() => mockExport("Activity")}
    >
      <LineChart
        data={data}
        margin={{ top: 4, right: 0, left: 4, bottom: 16 }}
      >
        <CartesianGrid
          vertical={false}
          className="s-stroke-border dark:s-stroke-border-night"
        />
        <XAxis
          dataKey="date"
          type="category"
          scale="point"
          allowDuplicatedCategory={false}
          className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={16}
        />
        <YAxis
          className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          allowDecimals={false}
        />
        <RechartsTooltip
          isAnimationActive={false}
          cursor={false}
          wrapperStyle={{ outline: "none", zIndex: 9999 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const rows = payload.map((p) => {
              const dataKey = String(p.dataKey ?? "");
              const userKey = dataKey as "dau" | "wau" | "mau";
              const colorClassName =
                displayMode === "activity"
                  ? p.dataKey === "count" ? USAGE_PALETTE.messages : USAGE_PALETTE.conversations
                  : (ACTIVE_USERS_PALETTE as Record<string, string>)[userKey] ?? "";
              const raw = p.payload as Record<string, number | undefined>;
              const pct = displayMode === "users" ? raw[dataKey + "Pct"] : undefined;
              const value =
                typeof p.value === "number"
                  ? displayMode === "users" && pct != null
                    ? `${p.value.toLocaleString()} (${pct}%)`
                    : p.value.toLocaleString()
                  : String(p.value ?? "");
              return { label: String(p.name ?? ""), value, colorClassName };
            });
            return (
              <ChartTooltipCard title={String(label ?? "")} rows={rows} />
            );
          }}
        />
        {displayMode === "activity" ? (
          <>
            <Line
              type="monotone"
              strokeWidth={2}
              dataKey="count"
              name="Messages"
              className={USAGE_PALETTE.messages}
              stroke="currentColor"
              dot={false}
            />
            <Line
              type="monotone"
              strokeWidth={2}
              dataKey="conversations"
              name="Conversations"
              className={USAGE_PALETTE.conversations}
              stroke="currentColor"
              dot={false}
            />
          </>
        ) : (
          <>
            <Line
              type="monotone"
              strokeWidth={2}
              dataKey="dau"
              name="DAU"
              className={ACTIVE_USERS_PALETTE.dau}
              stroke="currentColor"
              dot={false}
            />
            <Line
              type="monotone"
              strokeWidth={2}
              dataKey="wau"
              name="WAU"
              className={ACTIVE_USERS_PALETTE.wau}
              stroke="currentColor"
              dot={false}
            />
            <Line
              type="monotone"
              strokeWidth={2}
              dataKey="mau"
              name="MAU"
              className={ACTIVE_USERS_PALETTE.mau}
              stroke="currentColor"
              dot={false}
            />
          </>
        )}
      </LineChart>
    </ChartCard>
  );
}

function SourceChart({ period }: { period: number }) {
  const raw = useMemo(() => getMockSourceData(period), [period]);
  const total = raw.reduce((s, d) => s + d.count, 0);
  const data = raw.map((d) => ({
    ...d,
    percent: total > 0 ? ((d.count / total) * 100).toFixed(1) : "0",
  }));
  const legendItems = data.map((d, i) => ({
    key: d.origin,
    label: d.label,
    colorClassName: INDEXED_COLORS[i % INDEXED_COLORS.length],
  }));
  return (
    <div className={`s-h-full s-flex s-flex-col s-relative s-z-0 s-isolate s-transition-[z-index] hover:s-z-10 ${CARD_CLASS}`}>
      <div className="s-shrink-0 s-flex s-items-start s-justify-between s-gap-4">
        <div>
          <h3 className="s-text-sm s-font-semibold s-tracking-tight s-text-foreground dark:s-text-foreground-night">Source</h3>
          <p className="s-mt-1 s-text-xs s-leading-relaxed s-text-muted-foreground dark:s-text-muted-foreground-night">
            Messages by source (last {period} days)
          </p>
        </div>
        <Button variant="tertiary" size="xs" icon={ArrowDownOnSquareIcon} label="Export" onClick={() => mockExport("Source")} />
      </div>
      <div className="s-flex-1 s-mt-3 s-min-h-0">
        <ResponsiveContainer width="100%" height="100%" minHeight={CHART_HEIGHT}>
        <PieChart>
          <RechartsTooltip
            isAnimationActive={false}
            wrapperStyle={{ outline: "none", zIndex: 9999 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const rows: { label: string; value: string; colorClassName?: string }[] = payload.map((p) => ({
                label: String(p.name ?? ""),
                value: `${typeof p.value === "number" ? p.value.toLocaleString() : p.value} (${(p.payload as { percent?: string }).percent ?? "0"}%)`,
                colorClassName: INDEXED_COLORS[data.findIndex((d) => d.label === p.name) % INDEXED_COLORS.length],
              }));
              return <ChartTooltipCard title="Source breakdown" rows={rows} />;
            }}
          />
          <Pie
            data={data}
            dataKey="count"
            nameKey="label"
            innerRadius="60%"
            outerRadius="80%"
            paddingAngle={3}
            strokeWidth={0}
          >
            {data.map((_, i) => (
              <Cell
                key={i}
                className={INDEXED_COLORS[i % INDEXED_COLORS.length]}
                fill="currentColor"
              />
            ))}
          </Pie>
          {total > 0 && (
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="middle"
              className="s-fill-foreground dark:s-fill-foreground-night"
            >
              <tspan className="s-text-2xl s-font-semibold">
                {total.toLocaleString()}
              </tspan>
              <tspan x="50%" dy="1.2em" className="s-text-sm">
                Messages
              </tspan>
            </text>
          )}
        </PieChart>
      </ResponsiveContainer>
      </div>
      <div className="s-shrink-0 s-mt-3 s-flex s-flex-wrap s-items-center s-gap-x-5 s-gap-y-1.5">
        {legendItems.map((item) => (
          <div key={item.key} className="s-flex s-items-center s-gap-2">
            <span aria-hidden className={`s-inline-block s-h-2 s-w-2 s-rounded-full s-bg-current ${item.colorClassName}`} />
            <span className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolUsageChartFlat({ period }: { period: number }) {
  const raw = getMockToolUsage(period);
  const tools = ["web_search", "code_interpreter", "read_file", "google_drive"];
  const displayNames: Record<string, string> = {
    web_search: "Web search",
    code_interpreter: "Code interpreter",
    read_file: "Read file",
    google_drive: "Google Drive",
  };
  const data = raw.map((d) => {
    const out: Record<string, string | number> = { date: d.date };
    tools.forEach((t) => {
      out[t] = d.values[t] ?? 0;
    });
    return out;
  });
  const legendItems = tools.map((t, i) => ({
    key: t,
    label: displayNames[t] ?? t,
    colorClassName: INDEXED_COLORS[i % INDEXED_COLORS.length],
  }));
  return (
    <ChartCard
      title="Tool usage"
      description={`Tool runs (last ${period} days)`}
      legendItems={legendItems}
      onExport={() => mockExport("Tool usage")}
    >
      <LineChart
        data={data}
        margin={{ top: 4, right: 0, left: 4, bottom: 16 }}
      >
        <CartesianGrid
          vertical={false}
          className="s-stroke-border dark:s-stroke-border-night"
        />
        <XAxis
          dataKey="date"
          type="category"
          scale="point"
          tickLine={false}
          axisLine={false}
          className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night"
          tickMargin={8}
          minTickGap={16}
        />
        <YAxis
          className="s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          allowDecimals={false}
        />
        <RechartsTooltip
          isAnimationActive={false}
          cursor={false}
          wrapperStyle={{ outline: "none", zIndex: 9999 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const rows = payload.map((p) => {
              const toolKey = String(p.dataKey ?? "");
              return {
                label: String(displayNames[toolKey] ?? toolKey),
                value: typeof p.value === "number" ? p.value.toLocaleString() : String(p.value ?? ""),
                colorClassName: INDEXED_COLORS[tools.indexOf(toolKey) % INDEXED_COLORS.length],
              };
            });
            return (
              <ChartTooltipCard title={String(label ?? "")} rows={rows} />
            );
          }}
        />
        {tools.map((tool, i) => (
          <Line
            key={tool}
            type="monotone"
            strokeWidth={2}
            dataKey={tool}
            name={displayNames[tool] ?? tool}
            className={INDEXED_COLORS[i % INDEXED_COLORS.length]}
            stroke="currentColor"
            dot={false}
          />
        ))}
      </LineChart>
    </ChartCard>
  );
}

type TopUserRow = {
  userId: string;
  name: string;
  imageUrl: string | null;
  messageCount: number;
  agentCount: number;
  department?: string | null;
  rank?: number;
  onClick?: () => void;
  onDoubleClick?: () => void;
};

const topUserColumns: ColumnDef<TopUserRow>[] = [
  {
    id: "rank",
    header: "",
    meta: { sizeRatio: 5 },
    cell: (c) => (c.row.original.rank != null ? <span className="s-text-sm s-font-medium s-text-muted-foreground dark:s-text-muted-foreground-night">{c.row.original.rank}</span> : null),
  },
  {
    id: "name",
    accessorKey: "name",
    header: "User",
    cell: (info: CellContext<TopUserRow, unknown>) => {
      const { name, imageUrl } = info.row.original;
      return (
        <div className="s-flex s-items-center s-gap-2">
          <Avatar visual={imageUrl ?? undefined} size="xs" isRounded className="s-shrink-0" />
          <span className="s-truncate s-text-sm s-text-foreground dark:s-text-foreground-night">{name}</span>
        </div>
      );
    },
    meta: { sizeRatio: 35 },
  },
  {
    id: "department",
    accessorKey: "department",
    header: "Department",
    meta: { sizeRatio: 20 },
    cell: (info: CellContext<TopUserRow, unknown>) => (
      <DataTable.BasicCellContent label={info.row.original.department ?? "—"} />
    ),
  },
  {
    id: "messageCount",
    accessorKey: "messageCount",
    header: "Messages",
    meta: { sizeRatio: 15 },
    cell: (info: CellContext<TopUserRow, unknown>) => (
      <DataTable.BasicCellContent label={String(info.row.original.messageCount)} />
    ),
  },
  {
    id: "agentCount",
    accessorKey: "agentCount",
    header: "Agents used",
    meta: { sizeRatio: 15 },
    cell: (info: CellContext<TopUserRow, unknown>) => (
      <DataTable.BasicCellContent label={String(info.row.original.agentCount)} />
    ),
  },
];

function TopUsersTable({ period }: { period: number }) {
  const rows = useMemo(() => getMockTopUsers(period).map((r, i) => ({ ...r, department: r.department ?? null, rank: i + 1 })), [period]);
  return (
    <div className={`s-flex s-h-full s-flex-col ${CARD_CLASS}`}>
      <div className="s-shrink-0 s-mb-5 s-flex s-items-start s-justify-between s-gap-4">
        <div>
          <h3 className="s-text-sm s-font-semibold s-tracking-tight s-text-foreground dark:s-text-foreground-night">Users</h3>
          <p className="s-mt-1 s-text-xs s-leading-relaxed s-text-muted-foreground dark:s-text-muted-foreground-night">All users ranked by messages (last {period} days)</p>
        </div>
        <Button variant="tertiary" size="xs" icon={ArrowDownOnSquareIcon} label="Export" onClick={() => mockExport("Users")} />
      </div>
      <div className="s-min-h-0 s-flex-1">
        <ScrollableDataTable<TopUserRow> data={rows} columns={topUserColumns} maxHeight="s-max-h-64" />
      </div>
    </div>
  );
}

type TopAgentRow = {
  agentId: string;
  name: string;
  emoji: string;
  messageCount: number;
  userCount: number;
  type: "custom" | "global";
  creator: string;
  rank?: number;
  onClick?: () => void;
  onDoubleClick?: () => void;
};

function makeTopAgentColumns(): ColumnDef<TopAgentRow>[] {
  return [
    {
      id: "rank",
      header: "",
      meta: { sizeRatio: 5 },
      cell: (c) => (c.row.original.rank != null ? <span className="s-text-sm s-font-medium s-text-muted-foreground dark:s-text-muted-foreground-night">{c.row.original.rank}</span> : null),
    },
    {
      id: "name",
      accessorKey: "name",
      header: "Agent",
      cell: (info: CellContext<TopAgentRow, unknown>) => {
        const { name, emoji } = info.row.original;
        return (
          <div className="s-flex s-items-center s-gap-2">
            <Avatar emoji={emoji} size="xs" className="s-shrink-0" />
            <span className="s-truncate s-text-sm s-text-foreground dark:s-text-foreground-night">{name}</span>
          </div>
        );
      },
      meta: { sizeRatio: 28 },
    },
    { id: "messageCount", accessorKey: "messageCount", header: "Messages", meta: { sizeRatio: 12 }, cell: (c) => <DataTable.BasicCellContent label={String(c.row.original.messageCount)} /> },
    { id: "userCount", accessorKey: "userCount", header: "Users", meta: { sizeRatio: 10 }, cell: (c) => <DataTable.BasicCellContent label={String(c.row.original.userCount)} /> },
    {
      id: "avgMsgUser",
      header: "Avg msg/user",
      meta: { sizeRatio: 12 },
      cell: (c) => <DataTable.BasicCellContent label={c.row.original.userCount > 0 ? Math.round(c.row.original.messageCount / c.row.original.userCount).toString() : "—"} />,
    },
    { id: "creator", accessorKey: "creator", header: "Creator", meta: { sizeRatio: 26 }, cell: (c) => <DataTable.BasicCellContent label={c.row.original.type === "global" ? "Dust" : c.row.original.creator} /> },
  ];
}

function TopAgentsTable({ period }: { period: number }) {
  const rows = useMemo(
    () => getMockTopAgents(period).map((r, i) => ({ ...r, rank: i + 1, onClick: undefined as (() => void) | undefined, onDoubleClick: undefined as (() => void) | undefined })),
    [period]
  );
  const columns = useMemo(() => makeTopAgentColumns(), []);
  return (
    <div className={`s-flex s-h-full s-flex-col ${CARD_CLASS}`}>
      <div className="s-shrink-0 s-mb-5 s-flex s-items-start s-justify-between s-gap-4">
        <div>
          <h3 className="s-text-sm s-font-semibold s-tracking-tight s-text-foreground dark:s-text-foreground-night">Agents</h3>
          <p className="s-mt-1 s-text-xs s-leading-relaxed s-text-muted-foreground dark:s-text-muted-foreground-night">All agents ranked by usage (last {period} days)</p>
        </div>
        <Button variant="tertiary" size="xs" icon={ArrowDownOnSquareIcon} label="Export" onClick={() => mockExport("Agents")} />
      </div>
      <div className="s-min-h-0 s-flex-1">
        <ScrollableDataTable<TopAgentRow> data={rows} columns={columns} maxHeight="s-max-h-64" />
      </div>
    </div>
  );
}

type TopBuilderExtendedRow = ReturnType<typeof getMockTopBuildersExtended>[number] & { onClick?: () => void; onDoubleClick?: () => void; rank?: number };

const topBuilderExtendedColumns: ColumnDef<TopBuilderExtendedRow>[] = [
  {
    id: "rank",
    header: "",
    meta: { sizeRatio: 5 },
    cell: (c) => (c.row.original.rank != null ? <span className="s-text-sm s-font-medium s-text-muted-foreground dark:s-text-muted-foreground-night">{c.row.original.rank}</span> : null),
  },
  {
    id: "name",
    accessorKey: "name",
    header: "Builder",
    cell: (info: CellContext<TopBuilderExtendedRow, unknown>) => {
      const { name, imageUrl } = info.row.original;
      return (
        <div className="s-flex s-items-center s-gap-2">
          <Avatar visual={imageUrl ?? undefined} size="xs" isRounded className="s-shrink-0" />
          <span className="s-truncate s-text-sm s-text-foreground dark:s-text-foreground-night">{name}</span>
        </div>
      );
    },
    meta: { sizeRatio: 28 },
  },
  { id: "department", accessorKey: "department", header: "Department", meta: { sizeRatio: 18 }, cell: (c) => <DataTable.BasicCellContent label={c.row.original.department} /> },
  { id: "agentsCreated", accessorKey: "agentsCreated", header: "Agents Created", meta: { sizeRatio: 14 }, cell: (c) => <DataTable.BasicCellContent label={String(c.row.original.agentsCreated)} /> },
  { id: "totalConfigurations", accessorKey: "totalConfigurations", header: "Total Configurations", meta: { sizeRatio: 18 }, cell: (c) => <DataTable.BasicCellContent label={String(c.row.original.totalConfigurations)} /> },
  { id: "usageOfTheirAgents", accessorKey: "usageOfTheirAgents", header: "Usage of Their Agents", meta: { sizeRatio: 17 }, cell: (c) => <DataTable.BasicCellContent label={c.row.original.usageOfTheirAgents.toLocaleString()} /> },
];

function TopBuildersTable({ period }: { period: number }) {
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => {
    const list = getMockTopBuildersExtended(period).map((r, i) => ({ ...r, rank: i + 1, onClick: undefined as (() => void) | undefined, onDoubleClick: undefined as (() => void) | undefined }));
    return list;
  }, [period]);
  const visible = expanded ? rows : rows.slice(0, 10);
  return (
    <div className={CARD_CLASS}>
      <div className="s-mb-5 s-flex s-items-start s-justify-between s-gap-4">
        <div>
          <h3 className="s-text-sm s-font-semibold s-tracking-tight s-text-foreground dark:s-text-foreground-night">Builders</h3>
          <p className="s-mt-1 s-text-xs s-leading-relaxed s-text-muted-foreground dark:s-text-muted-foreground-night">All builders ranked by agents created and usage (last {period} days)</p>
        </div>
        <Button variant="tertiary" size="xs" icon={ArrowDownOnSquareIcon} label="Export" onClick={() => mockExport("Builders")} />
      </div>
      <ScrollableDataTable<TopBuilderExtendedRow> data={visible} columns={topBuilderExtendedColumns} maxHeight="s-max-h-80" />
      {rows.length > 10 && (
        <Button variant="tertiary" size="xs" label={expanded ? "Show less" : "View all"} onClick={() => setExpanded(!expanded)} className="s-mt-2" />
      )}
    </div>
  );
}

const MAX_ITEMS_PER_PAGE = 4;

function ActivityReport() {
  const monthOptions = useMemo(() => getMockMonthOptions(), []);
  const [includeInactive, setIncludeInactive] = useState(true);
  const [downloadingMonth, setDownloadingMonth] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: MAX_ITEMS_PER_PAGE,
  });

  const toPrettyDate = (date: string) => {
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
    ];
    const [year, monthIndex] = date.split("-");
    return `${months.at(Number(monthIndex) - 1)} ${year}`;
  };

  const handleDownload = (selectedMonth: string | null) => {
    if (!selectedMonth) return;
    setDownloadingMonth(selectedMonth);
    setTimeout(() => {
      alert(
        `Mock download: activity report for ${toPrettyDate(selectedMonth)} (includeInactive=${includeInactive})`
      );
      setDownloadingMonth(null);
    }, 500);
  };

  const { pageIndex, pageSize } = pagination;
  const startIndex = pageIndex * pageSize;
  const currentItems = monthOptions.slice(startIndex, startIndex + pageSize);

  return (
    <div className={`s-grow ${CARD_CLASS}`}>
      <div className="s-flex s-flex-col s-gap-4">
        <div>
          <h3 className="s-text-sm s-font-semibold s-tracking-tight s-text-foreground dark:s-text-foreground-night">Activity report</h3>
          <p className="s-mt-1 s-text-xs s-leading-relaxed s-text-muted-foreground dark:s-text-muted-foreground-night">
            Download monthly activity (members and agents). Mock — no file in playground.
          </p>
        </div>
        <div className="s-flex s-flex-row s-items-center s-gap-2">
          <Checkbox
            aria-label="Include inactive users and agents"
            checked={includeInactive}
            onCheckedChange={() => setIncludeInactive(!includeInactive)}
          />
          <span className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">Include inactive members and agents</span>
        </div>
      </div>
      <div className="s-flex s-h-full s-flex-col">
        <ContextItem.List>
          {currentItems.map((item) => (
            <ContextItem
              key={item}
              title={toPrettyDate(item)}
              visual={<Icon visual={GoogleSpreadsheetLogo} size="sm" />}
              action={
                <Button
                  icon={ArrowDownOnSquareIcon}
                  variant="ghost"
                  size="xs"
                  tooltip="Download (mock)"
                  onClick={() => handleDownload(item)}
                  disabled={downloadingMonth !== null}
                  isLoading={downloadingMonth === item}
                />
              }
            />
          ))}
        </ContextItem.List>
        <div className="s-mt-2">
          <Pagination
            rowCount={monthOptions.length}
            pagination={pagination}
            setPagination={setPagination}
            size="xs"
          />
        </div>
      </div>
    </div>
  );
}

function AnalyticsSidebar({
  isSidebarCollapsed,
  sidebarLayoutRef,
}: {
  isSidebarCollapsed: boolean;
  sidebarLayoutRef: React.RefObject<SidebarLayoutRef | null>;
}) {
  return (
    <div className="s-flex s-h-full s-flex-col s-border-r s-border-border s-bg-muted-background dark:s-border-border-night dark:s-bg-muted-background-night">
      <div className="s-flex s-items-center s-gap-2 s-border-b s-border-border s-p-3 dark:s-border-border-night">
        <Icon visual={Cog6ToothIcon} size="sm" />
        <span className="s-heading-sm s-text-foreground dark:s-text-foreground-night">
          Admin
        </span>
      </div>
      <NavigationList className="s-flex-1 s-px-2 s-pt-3">
        <NavigationListCollapsibleSection
          label="Workspace"
          defaultOpen={true}
          actionOnHover={false}
        >
          <NavigationListItem
            label="People & Security"
            icon={UserIcon}
            selected={false}
            onClick={() => {}}
          />
          <NavigationListItem
            label="Workspace Settings"
            icon={GlobeAltIcon}
            selected={false}
            onClick={() => {}}
          />
          <NavigationListItem
            label="Analytics"
            icon={BarChartIcon}
            selected={true}
            onClick={() => {}}
          />
          <NavigationListItem
            label="Subscription"
            icon={ShapesIcon}
            selected={false}
            onClick={() => {}}
          />
        </NavigationListCollapsibleSection>
        <NavigationListCollapsibleSection
          label="API & Programmatic"
          defaultOpen={true}
          actionOnHover={false}
        >
          <NavigationListItem
            label="API Keys"
            icon={LockIcon}
            selected={false}
            onClick={() => {}}
          />
          <NavigationListItem
            label="Programmatic usage"
            icon={CardIcon}
            selected={false}
            onClick={() => {}}
          />
        </NavigationListCollapsibleSection>
        <NavigationListCollapsibleSection
          label="Builder Tools"
          defaultOpen={true}
          actionOnHover={false}
        >
          <NavigationListItem
            label="Providers"
            icon={ShapesIcon}
            selected={false}
            onClick={() => {}}
          />
          <NavigationListItem
            label="Secrets"
            icon={BracesIcon}
            selected={false}
            onClick={() => {}}
          />
        </NavigationListCollapsibleSection>
      </NavigationList>
      <div className="s-flex s-items-center s-justify-end s-border-t s-border-border s-p-2 dark:s-border-border-night">
        <Button
          variant="ghost-secondary"
          size="icon"
          icon={isSidebarCollapsed ? SidebarLeftOpenIcon : SidebarLeftCloseIcon}
          onClick={() => sidebarLayoutRef.current?.toggle()}
          aria-label={isSidebarCollapsed ? "Open sidebar" : "Close sidebar"}
        />
      </div>
    </div>
  );
}

export default function Analytics() {
  const [period, setPeriod] = useState<PeriodDays>(DEFAULT_PERIOD);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const sidebarLayoutRef = useRef<SidebarLayoutRef>(null);

  const sidebarContent = (
    <AnalyticsSidebar
      isSidebarCollapsed={isSidebarCollapsed}
      sidebarLayoutRef={sidebarLayoutRef}
    />
  );

  const mainContent = (
    <div className="s-flex s-h-full s-w-full s-flex-col s-bg-background dark:s-bg-background-night">
      <div className="s-flex s-shrink-0 s-items-center s-justify-end s-border-b s-border-border/60 s-px-5 s-py-3 dark:s-border-border-night/60">
        <Button
          variant="ghost-secondary"
          size="icon"
          icon={isSidebarCollapsed ? SidebarLeftOpenIcon : SidebarLeftCloseIcon}
          onClick={() => sidebarLayoutRef.current?.toggle()}
          aria-label={isSidebarCollapsed ? "Open sidebar" : "Close sidebar"}
        />
      </div>
      <div className="s-flex-1 s-overflow-auto s-px-5 s-pt-6 s-pb-12 sm:s-px-12 s-min-w-0">
        <div className="s-mx-auto s-w-full s-min-w-0 s-max-w-5xl s-space-y-14 s-relative s-z-0">
          <div className="s-flex s-flex-col s-gap-6">
            <header className="s-flex s-w-full s-flex-col s-gap-1">
              <div className="s-flex s-w-full s-items-center s-justify-between s-gap-4">
                <Page.Header
                  title={<Page.H variant="h3">Analytics</Page.H>}
                  icon={BarChartIcon}
                  description="Track how your team uses Dust"
                />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button label={`${period} days`} size="xs" variant="outline" isSelect />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {PERIOD_OPTIONS.map((p) => (
                      <DropdownMenuItem key={p} label={`${p} days`} onClick={() => setPeriod(p)} />
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </header>

            <div className="s-space-y-8">
              <InsightCardsRow period={period} />
              <WorkspaceHealthCard />
            </div>
          </div>

          <div>
            <p className={`${SECTION_LABEL} s-mb-4`}>Engagement</p>
            <UsageChart period={period} />
          </div>

          <div>
            <p className={`${SECTION_LABEL} s-mb-4`}>Adoption</p>
            <AdoptionByDepartmentChart period={period} />
          </div>

          <div>
            <p className={`${SECTION_LABEL} s-mb-4`}>Usage</p>
            <div className="s-grid s-w-full s-min-w-0 s-grid-cols-1 s-gap-6 sm:s-grid-cols-2">
              <div className="s-flex s-min-w-0 s-flex-col">
                <SourceChart period={period} />
              </div>
              <div className="s-flex s-min-w-0 s-flex-col">
                <ImpactClassificationCard period={period} />
              </div>
              <div className="s-min-w-0 sm:s-col-span-2">
                <ToolUsageChartFlat period={period} />
              </div>
            </div>
          </div>

          <div>
            <p className={`${SECTION_LABEL} s-mb-4`}>Rankings</p>
            <div className="s-flex s-w-full s-min-w-0 s-flex-col s-gap-6">
              <TopUsersTable period={period} />
              <TopBuildersTable period={period} />
              <TopAgentsTable period={period} />
            </div>
          </div>

          <div>
            <p className={`${SECTION_LABEL} s-mb-4`}>Activity report</p>
            <ActivityReport />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="s-flex s-h-screen s-w-full s-bg-background dark:s-bg-background-night">
      <SidebarLayout
        ref={sidebarLayoutRef}
        sidebar={sidebarContent}
        content={mainContent}
        defaultSidebarWidth={280}
        minSidebarWidth={200}
        maxSidebarWidth={400}
        collapsible={true}
        onSidebarToggle={setIsSidebarCollapsed}
      />
    </div>
  );
}
