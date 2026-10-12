import {
  ActionCard,
  AnimatedText,
  Button,
  CardGrid,
  Check,
  CheckboxWithText,
  Chip,
  Clock,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContentMessage,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Hoverable,
  Icon,
  Input,
  Label,
  MultiPageSheet,
  MultiPageSheetContent,
  SearchInput,
  TextArea,
  Tooltip,
  type MultiPageSheetPage,
  Zap,
} from "@dust-tt/sparkle";
import { useEffect, useId, useRef, useState } from "react";

import { mockUsers } from "../../data/users";
import {
  type BuilderTrigger,
  describeSchedule,
  describeScheduleConfig,
  formatWeekdays,
  mockBuilderSpaces,
  mockOtherMembersTriggers,
  mockRequestHistory,
  mockWebhookSources,
  NEXT_OCCURRENCES,
  SCHEDULE_TIMEZONE,
  type ScheduleConfig,
  type ScheduleRepeat,
  TIME_SLOTS,
  type Weekday,
  WEEKDAYS,
  type WebhookSource,
} from "./data";
import { NumberField } from "./CapabilitiesSection";
import { BuilderSection, FieldGroup, FieldRow } from "./SectionContainer";
import { Switch } from "./Switch";

const CURRENT_USER = mockUsers[0];

function describeTrigger(trigger: BuilderTrigger): string {
  if (trigger.kind === "schedule") {
    return trigger.scheduleLabel ?? "Runs on a schedule";
  }
  const source = mockWebhookSources.find(
    (candidate) => candidate.id === trigger.webhookSourceId
  );
  const sourceName = source?.name ?? "webhook";
  return trigger.event
    ? `Triggered by ${trigger.event} events on ${sourceName}’s source.`
    : `Triggered on ${sourceName}’s source.`;
}

const HISTORY_PREVIEW_COUNT = 5;

function TriggerCard({
  trigger,
  onClick,
  onRemove,
}: {
  trigger: BuilderTrigger;
  onClick: () => void;
  onRemove?: () => void;
}) {
  const source = mockWebhookSources.find(
    (candidate) => candidate.id === trigger.webhookSourceId
  );
  const editor = mockUsers.find((user) => user.id === trigger.editorId);
  return (
    <ActionCard
      icon={trigger.kind === "schedule" ? Clock : (source?.logo ?? Zap)}
      label={trigger.name}
      description={describeTrigger(trigger)}
      cardContainerClassName="min-h-28"
      canAdd={false}
      onClick={onClick}
      onRemove={onRemove}
      footer={{
        label: (
          <span className="flex items-center gap-2">
            {trigger.status !== "enabled" ? (
              <Chip size="mini" color="warning" label="Paused" />
            ) : null}
            <span>
              Managed by <strong>{editor?.fullName ?? "Unknown"}</strong>.
            </span>
          </span>
        ),
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Sheet pages
// ---------------------------------------------------------------------------

type SheetPage =
  | { id: "list"; webhooksOnly?: boolean }
  | { id: "schedule"; draft: BuilderTrigger; isNew: boolean }
  | {
      id: "webhook";
      draft: BuilderTrigger;
      isNew: boolean;
      source: WebhookSource;
    };

type ConversationFields = {
  message?: string;
  pool: "member" | "workspace";
  podId?: string | null;
};

/** Message, credits and destination: shared by the inline schedule and the sheet pages. */
function CommonFields({
  value,
  onChange,
  readOnly,
}: {
  value: ConversationFields;
  onChange: (patch: Partial<ConversationFields>) => void;
  readOnly: boolean;
}) {
  const pods = mockBuilderSpaces.filter((space) => space.kind === "pod");
  const id = useId();
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-message`} className="text-base font-semibold">
          Message (optional)
        </Label>
        <span className="text-sm text-muted-foreground">
          Message for the agent when the trigger runs.
        </span>
        <TextArea
          id={`${id}-message`}
          value={value.message ?? ""}
          disabled={readOnly}
          onChange={(event) => onChange({ message: event.target.value })}
          placeholder="Summarize what changed and post it to the team."
          minRows={3}
          resize="vertical"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-credits`} className="text-base font-semibold">
          Credits
        </Label>
        <span className="text-sm text-muted-foreground">
          Which pool this trigger’s runs take credits from.
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              id={`${id}-credits`}
              size="sm"
              variant="outline"
              isSelect
              className="self-start"
              disabled={readOnly}
              label={
                value.pool === "member" ? "My credits" : "Workspace credits"
              }
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              label="My credits"
              onSelect={() => onChange({ pool: "member" })}
            />
            <DropdownMenuItem
              label="Workspace credits"
              onSelect={() => onChange({ pool: "workspace" })}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-pod`} className="text-base font-semibold">
          Where to create this conversation? (optional)
        </Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              id={`${id}-pod`}
              size="sm"
              variant="outline"
              isSelect
              className="self-start"
              disabled={readOnly}
              label={
                pods.find((pod) => pod.id === value.podId)?.name ??
                "My conversations (default)"
              }
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              label="My conversations (default)"
              onSelect={() => onChange({ podId: null })}
            />
            {pods.map((pod) => (
              <DropdownMenuItem
                key={pod.id}
                label={pod.name}
                onSelect={() => onChange({ podId: pod.id })}
              />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}

function NameAndStatus({
  draft,
  onChange,
  readOnly,
}: {
  draft: BuilderTrigger;
  onChange: (next: BuilderTrigger) => void;
  readOnly: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-end gap-4">
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor={`${id}-name`} className="text-base font-semibold">
          Name
        </Label>
        <Input
          id={`${id}-name`}
          placeholder="Enter trigger name"
          value={draft.name}
          disabled={readOnly}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </div>
      <div className="flex flex-col items-end gap-2">
        <Label className="text-base font-semibold">Status</Label>
        <div className="flex h-10 items-center">
          <Switch
            aria-label="Trigger enabled"
            checked={draft.status === "enabled"}
            disabled={readOnly}
            onCheckedChange={(checked) =>
              onChange({ ...draft, status: checked ? "enabled" : "disabled" })
            }
          />
        </div>
      </div>
    </div>
  );
}

function SchedulePage({
  draft,
  onChange,
  readOnly,
}: {
  draft: BuilderTrigger;
  onChange: (next: BuilderTrigger) => void;
  readOnly: boolean;
}) {
  const [isGenerating, setIsGenerating] = useState(false);
  // The generator resolves 800ms later; by then the user may have edited
  // other fields, so it must merge into the latest draft, not the one it
  // closed over.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const id = useId();

  useEffect(() => {
    const text = draft.scheduleText ?? "";
    if (!text.trim()) {
      return;
    }
    setIsGenerating(true);
    const timer = window.setTimeout(() => {
      setIsGenerating(false);
      onChange({ ...draftRef.current, scheduleLabel: describeSchedule(text) });
    }, 800);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.scheduleText]);

  const editor = mockUsers.find((user) => user.id === draft.editorId);

  return (
    <div className="flex flex-col gap-6">
      {readOnly ? (
        <ContentMessage variant="info" size="lg">
          You cannot edit this schedule. It is managed by{" "}
          {editor?.fullName ?? "another member"}.
        </ContentMessage>
      ) : null}
      <NameAndStatus draft={draft} onChange={onChange} readOnly={readOnly} />
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-schedule`} className="text-base font-semibold">
          Scheduler
        </Label>
        <span className="text-sm text-muted-foreground">
          Describe when you want the agent to run in natural language.
        </span>
        <TextArea
          id={`${id}-schedule`}
          value={draft.scheduleText ?? ""}
          disabled={readOnly}
          onChange={(event) =>
            onChange({ ...draft, scheduleText: event.target.value })
          }
          placeholder="e.g. “every day at 9 AM” or “late afternoon on business days”"
          minRows={2}
          resize="none"
        />
        {draft.scheduleText?.trim() ? (
          <ContentMessage variant="outline" size="lg">
            <div className="flex min-h-8 items-center justify-between gap-2">
              {isGenerating ? (
                <AnimatedText className="motion-reduce:animate-none">
                  Generating schedule…
                </AnimatedText>
              ) : (
                <>
                  <span>{draft.scheduleLabel}</span>
                  <Tooltip
                    tooltipTriggerAsChild
                    label={
                      <div className="flex flex-col gap-0.5">
                        {NEXT_OCCURRENCES.map((occurrence) => (
                          <span key={occurrence}>{occurrence}</span>
                        ))}
                      </div>
                    }
                    trigger={
                      <Button
                        size="xs"
                        variant="ghost"
                        icon={Clock}
                        label="Next 5 occurrences"
                      />
                    }
                  />
                </>
              )}
            </div>
          </ContentMessage>
        ) : null}
      </div>
      <CommonFields
        value={draft}
        onChange={(patch) => onChange({ ...draft, ...patch })}
        readOnly={readOnly}
      />
    </div>
  );
}

function WebhookPage({
  draft,
  source,
  onChange,
  readOnly,
}: {
  draft: BuilderTrigger;
  source: WebhookSource;
  onChange: (next: BuilderTrigger) => void;
  readOnly: boolean;
}) {
  const [stats, setStats] = useState<string | null>(null);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const id = useId();
  const [isComputing, setIsComputing] = useState(false);
  const editor = mockUsers.find((user) => user.id === draft.editorId);

  return (
    <div className="flex flex-col gap-6">
      {readOnly ? (
        <ContentMessage variant="info" size="lg">
          You cannot edit this trigger. It is managed by{" "}
          {editor?.fullName ?? "another member"}.
        </ContentMessage>
      ) : null}
      <NameAndStatus draft={draft} onChange={onChange} readOnly={readOnly} />
      {source.hasProvider ? (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-event`} className="text-base font-semibold">
              Listen for
            </Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  id={`${id}-event`}
                  size="sm"
                  variant="outline"
                  isSelect
                  className="self-start"
                  disabled={readOnly}
                  label={draft.event ?? "Select an event"}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {source.events.map((event) => (
                  <DropdownMenuItem
                    key={event}
                    label={event}
                    onSelect={() => onChange({ ...draft, event })}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor={`${id}-filter`} className="text-base font-semibold">
              Run only when (optional)
            </Label>
            <Input
              id={`${id}-filter`}
              placeholder="e.g. label is “urgent”"
              value={draft.filter ?? ""}
              disabled={readOnly}
              onChange={(event) =>
                onChange({ ...draft, filter: event.target.value })
              }
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-filter`} className="text-base font-semibold">
            Filter expression (optional)
          </Label>
          <Input
            id={`${id}-filter`}
            placeholder="payload.status == 'open'"
            value={draft.filter ?? ""}
            disabled={readOnly}
            onChange={(event) =>
              onChange({ ...draft, filter: event.target.value })
            }
          />
          <span className="text-xs text-muted-foreground">
            Payload filtering syntax: dot paths, comparisons (==, !=, &gt;,
            &lt;), and, or, not.
          </span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          label="Compute stats"
          isLoading={isComputing}
          disabled={readOnly}
          onClick={() => {
            setIsComputing(true);
            window.setTimeout(() => {
              setIsComputing(false);
              setStats(
                "Over the last 7 days, 42 events were received and 11 matched this filter."
              );
            }, 700);
          }}
        />
        {stats ? (
          <span className="text-xs text-muted-foreground">{stats}</span>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-message`} className="text-base font-semibold">
          Message (optional)
        </Label>
        <TextArea
          id={`${id}-message`}
          value={draft.message ?? ""}
          disabled={readOnly}
          onChange={(event) =>
            onChange({ ...draft, message: event.target.value })
          }
          placeholder="Triage the event and reply in the thread."
          minRows={3}
          resize="vertical"
        />
        <CheckboxWithText
          text="Include webhook payload"
          checked={Boolean(draft.includePayload)}
          disabled={readOnly}
          onCheckedChange={(checked) =>
            onChange({ ...draft, includePayload: checked === true })
          }
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-credits`} className="text-base font-semibold">
          Credits
        </Label>
        <span className="text-sm text-muted-foreground">
          Which pool this trigger’s runs take credits from.
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              id={`${id}-credits`}
              size="sm"
              variant="outline"
              isSelect
              className="self-start"
              disabled={readOnly}
              label={
                draft.pool === "member" ? "My credits" : "Workspace credits"
              }
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              label="My credits"
              onSelect={() => onChange({ ...draft, pool: "member" })}
            />
            <DropdownMenuItem
              label="Workspace credits"
              onSelect={() => onChange({ ...draft, pool: "workspace" })}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex flex-col gap-2">
        <Label className="text-base font-semibold">Rate limits</Label>
        <div className="flex items-center gap-2">
          <NumberField
            className="w-24"
            value={draft.rateLimit ?? 60}
            min={0}
            disabled={readOnly}
            ariaLabel="Runs per hour"
            onChange={(rateLimit) => onChange({ ...draft, rateLimit })}
          />
          <span className="text-sm text-muted-foreground">runs per hour</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-pod`} className="text-base font-semibold">
          Where to create this conversation? (optional)
        </Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              id={`${id}-pod`}
              size="sm"
              variant="outline"
              isSelect
              className="self-start"
              disabled={readOnly}
              label={
                mockBuilderSpaces.find((space) => space.id === draft.podId)
                  ?.name ?? "My conversations (default)"
              }
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              label="My conversations (default)"
              onSelect={() => onChange({ ...draft, podId: null })}
            />
            {mockBuilderSpaces
              .filter((space) => space.kind === "pod")
              .map((pod) => (
                <DropdownMenuItem
                  key={pod.id}
                  label={pod.name}
                  onSelect={() => onChange({ ...draft, podId: pod.id })}
                />
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Collapsible>
        <CollapsibleTrigger label="Request history" variant="secondary" />
        <CollapsibleContent>
          <div className="flex flex-col divide-y divide-border rounded-xl border border-border">
            {(showAllHistory
              ? mockRequestHistory
              : mockRequestHistory.slice(0, HISTORY_PREVIEW_COUNT)
            ).map((request) => (
              <div
                key={request.id}
                className="flex items-center justify-between px-3 py-2"
              >
                <span className="text-sm text-foreground">{request.at}</span>
                <Chip
                  size="mini"
                  color={
                    request.status === "Succeeded"
                      ? "success"
                      : request.status === "Failed" ||
                          request.status === "Out of credits"
                        ? "warning"
                        : request.status === "Rate limited"
                          ? "info"
                          : "primary"
                  }
                  label={request.status}
                />
              </div>
            ))}
            {!showAllHistory &&
            mockRequestHistory.length > HISTORY_PREVIEW_COUNT ? (
              <div className="flex justify-center px-3 py-1.5">
                <Button
                  size="xs"
                  variant="ghost"
                  label={`Show ${mockRequestHistory.length - HISTORY_PREVIEW_COUNT} more`}
                  onClick={() => setShowAllHistory(true)}
                />
              </div>
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline schedule
// ---------------------------------------------------------------------------

const REPEAT_OPTIONS: { id: ScheduleRepeat; label: string }[] = [
  { id: "never", label: "Never" },
  { id: "interval", label: "Interval" },
  { id: "daily", label: "Daily" },
  { id: "weekly", label: "Weekly" },
  { id: "custom", label: "Custom" },
];

/** A text-like select for a field row: the value and a chevron, options with a check. */
function ValueMenu<T extends string>({
  value,
  options,
  onSelect,
  ariaLabel,
  contentClassName,
}: {
  value: T;
  options: { id: T; label: string }[];
  onSelect: (id: T) => void;
  ariaLabel: string;
  contentClassName?: string;
}) {
  const current = options.find((option) => option.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost-secondary"
          isSelect
          label={current?.label ?? value}
          aria-label={`${ariaLabel}: ${current?.label ?? value}`}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className={contentClassName}>
        {options.map((option) => (
          <DropdownMenuItem
            key={option.id}
            label={option.label}
            onSelect={() => onSelect(option.id)}
            endComponent={
              option.id === value ? (
                <Icon visual={Check} size="xs" />
              ) : undefined
            }
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const TIME_OPTIONS = TIME_SLOTS.map((slot) => ({
  id: slot,
  label: `${slot} ${SCHEDULE_TIMEZONE}`,
}));

function TimeMenu({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (time: string) => void;
  ariaLabel: string;
}) {
  return (
    <ValueMenu
      value={value}
      options={TIME_OPTIONS}
      onSelect={onChange}
      ariaLabel={ariaLabel}
      contentClassName="max-h-72 overflow-y-auto"
    />
  );
}

function DaysMenu({
  days,
  onChange,
}: {
  days: Weekday[];
  onChange: (days: Weekday[]) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost-secondary"
          isSelect
          label={formatWeekdays(days)}
          aria-label={`Days: ${formatWeekdays(days)}`}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {WEEKDAYS.map((day) => (
          <DropdownMenuCheckboxItem
            key={day.id}
            label={day.label}
            checked={days.includes(day.id)}
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? WEEKDAYS.map((candidate) => candidate.id).filter(
                      (id) => id === day.id || days.includes(id)
                    )
                  : days.filter((id) => id !== day.id)
              )
            }
            onSelect={(event) => event.preventDefault()}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Rows revealed by a Repeat change ease in from just above their resting
 * place (ease-out, no overshoot) and leave instantly, so the card reads as
 * unfolding rather than swapping.
 */
const ROW_ENTER =
  "starting:-translate-y-1 starting:opacity-0 transition-[opacity,translate] duration-200 ease-out motion-reduce:transition-none";

/**
 * The schedule, edited in place as label/control rows that sit flush with
 * the column like every other section's rows. "Repeat" picks the shape; only
 * the rows that shape needs are shown.
 */
function ScheduleCard({
  schedule,
  onChange,
}: {
  schedule: ScheduleConfig;
  onChange: (schedule: ScheduleConfig) => void;
}) {
  const patch = (next: Partial<ScheduleConfig>) =>
    onChange({ ...schedule, ...next });
  const customUnitLabel =
    schedule.customEvery === 1
      ? schedule.customUnit
      : `${schedule.customUnit}s`;

  return (
    <div className="flex flex-col gap-2">
      <div>
        <FieldGroup>
          <FieldRow label="Repeat">
            <ValueMenu
              value={schedule.repeat}
              options={REPEAT_OPTIONS}
              onSelect={(repeat) => patch({ repeat })}
              ariaLabel="Repeat"
            />
          </FieldRow>
          {schedule.repeat === "interval" ? (
            <FieldRow label="Every" className={ROW_ENTER}>
              <NumberField
                className="w-20"
                value={schedule.intervalValue}
                min={1}
                ariaLabel="Interval"
                onChange={(intervalValue) => patch({ intervalValue })}
              />
              <ValueMenu
                value={schedule.intervalUnit}
                options={[
                  { id: "minutes", label: "minutes" },
                  { id: "hours", label: "hours" },
                ]}
                onSelect={(intervalUnit) => patch({ intervalUnit })}
                ariaLabel="Interval unit"
              />
            </FieldRow>
          ) : null}
          {schedule.repeat === "daily" ? (
            <FieldRow label="Time" className={ROW_ENTER}>
              <TimeMenu
                value={schedule.time}
                onChange={(time) => patch({ time })}
                ariaLabel="Time"
              />
            </FieldRow>
          ) : null}
          {schedule.repeat === "weekly" ? (
            <>
              <FieldRow label="On" className={ROW_ENTER}>
                <DaysMenu
                  days={schedule.days}
                  onChange={(days) => patch({ days })}
                />
              </FieldRow>
              <FieldRow label="Time" className={ROW_ENTER}>
                <TimeMenu
                  value={schedule.time}
                  onChange={(time) => patch({ time })}
                  ariaLabel="Time"
                />
              </FieldRow>
            </>
          ) : null}
          {schedule.repeat === "custom" ? (
            <>
              <FieldRow label="Repeats" className={ROW_ENTER}>
                <ValueMenu
                  value={schedule.customUnit}
                  options={[
                    { id: "day", label: "Daily" },
                    { id: "week", label: "Weekly" },
                    { id: "month", label: "Monthly" },
                  ]}
                  onSelect={(customUnit) => patch({ customUnit })}
                  ariaLabel="Repeats"
                />
              </FieldRow>
              <FieldRow label="Every" className={ROW_ENTER}>
                <NumberField
                  className="w-20"
                  value={schedule.customEvery}
                  min={1}
                  ariaLabel="Every"
                  onChange={(customEvery) => patch({ customEvery })}
                />
                <span className="text-sm text-muted-foreground">
                  {customUnitLabel}
                </span>
              </FieldRow>
              {schedule.customUnit === "week" ? (
                <FieldRow label="On" className={ROW_ENTER}>
                  <DaysMenu
                    days={schedule.days}
                    onChange={(days) => patch({ days })}
                  />
                </FieldRow>
              ) : null}
              <FieldRow label="Start time" className={ROW_ENTER}>
                <TimeMenu
                  value={schedule.time}
                  onChange={(time) => patch({ time })}
                  ariaLabel="Start time"
                />
              </FieldRow>
            </>
          ) : null}
        </FieldGroup>
      </div>
      {schedule.repeat !== "never" ? (
        <span className={`text-xs text-muted-foreground ${ROW_ENTER}`}>
          {describeScheduleConfig(schedule)} · next run {NEXT_OCCURRENCES[0]}
        </span>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sheet
// ---------------------------------------------------------------------------

export function TriggersSheet({
  open,
  onOpenChange,
  initialPage,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialPage: SheetPage;
  onSave: (trigger: BuilderTrigger) => void;
}) {
  const [page, setPage] = useState<SheetPage>(initialPage);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) {
      setPage(initialPage);
      setSearch("");
    }
  }, [open, initialPage]);

  const needle = search.trim().toLowerCase();
  const webhooksOnly = page.id === "list" && Boolean(page.webhooksOnly);
  const showSchedule =
    !webhooksOnly && (!needle || "schedule".includes(needle));
  const sources = mockWebhookSources.filter(
    (source) => !needle || source.name.toLowerCase().includes(needle)
  );

  const newTrigger = (
    kind: BuilderTrigger["kind"],
    sourceId?: string
  ): BuilderTrigger => ({
    id: `trigger-${Date.now()}`,
    name: "",
    kind,
    status: "enabled",
    editorId: CURRENT_USER.id,
    webhookSourceId: sourceId,
    pool: "member",
    podId: null,
    rateLimit: 60,
  });

  const listContent = (
    <div className="flex flex-col gap-4">
      <SearchInput
        name="triggers-search"
        placeholder={webhooksOnly ? "Search webhooks…" : "Search triggers…"}
        value={search}
        onChange={setSearch}
      />
      {!showSchedule && sources.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No triggers match “{search.trim()}”. Try another name or clear the
          search.
        </div>
      ) : (
        <CardGrid>
          {showSchedule ? (
            <ActionCard
              icon={Clock}
              label="Schedule"
              description="Trigger this agent on a schedule"
              canAdd={false}
              onClick={() =>
                setPage({
                  id: "schedule",
                  draft: newTrigger("schedule"),
                  isNew: true,
                })
              }
            />
          ) : null}
          {sources.map((source) => (
            <ActionCard
              key={source.id}
              icon={source.logo}
              label={source.name}
              description={`Trigger this agent with ${source.name}.`}
              canAdd={false}
              onClick={() =>
                setPage({
                  id: "webhook",
                  draft: newTrigger("webhook", source.id),
                  isNew: true,
                  source,
                })
              }
            />
          ))}
        </CardGrid>
      )}
    </div>
  );

  const isReadOnly =
    page.id !== "list" && page.draft.editorId !== CURRENT_USER.id;

  const pages: MultiPageSheetPage[] = [
    {
      id: "list",
      title: webhooksOnly ? "Add a webhook" : "Add triggers",
      icon: Zap,
      content: listContent,
    },
    ...(page.id === "schedule"
      ? [
          {
            id: "schedule",
            title: isReadOnly
              ? "View schedule"
              : page.isNew
                ? "Create schedule"
                : "Edit schedule",
            icon: Clock,
            content: (
              <SchedulePage
                draft={page.draft}
                readOnly={isReadOnly}
                onChange={(draft) => setPage({ ...page, draft })}
              />
            ),
          },
        ]
      : []),
    ...(page.id === "webhook"
      ? [
          {
            id: "webhook",
            title: isReadOnly
              ? "View trigger"
              : page.isNew
                ? `Create ${page.source.name} trigger`
                : "Edit trigger",
            icon: page.source.logo,
            content: (
              <WebhookPage
                draft={page.draft}
                source={page.source}
                readOnly={isReadOnly}
                onChange={(draft) => setPage({ ...page, draft })}
              />
            ),
          },
        ]
      : []),
  ];

  const canSave =
    page.id !== "list" &&
    page.draft.name.trim().length > 0 &&
    (page.id === "schedule" ? Boolean(page.draft.scheduleLabel) : true);

  const footer =
    page.id === "list"
      ? {
          rightButton: {
            label: "Close",
            variant: "outline" as const,
            onClick: () => onOpenChange(false),
          },
        }
      : {
          leftButton: isReadOnly
            ? undefined
            : {
                label: "Cancel",
                variant: "outline" as const,
                onClick: () =>
                  page.isNew
                    ? setPage({ id: "list", webhooksOnly: true })
                    : onOpenChange(false),
              },
          rightButton: isReadOnly
            ? {
                label: "Close",
                variant: "outline" as const,
                onClick: () => onOpenChange(false),
              }
            : {
                label: "Save",
                variant: "primary" as const,
                disabled: !canSave,
                onClick: () => {
                  onSave(page.draft);
                  onOpenChange(false);
                },
              },
        };

  return (
    <MultiPageSheet open={open} onOpenChange={onOpenChange}>
      <MultiPageSheetContent
        pages={pages}
        currentPageId={page.id}
        onPageChange={(id) => {
          if (id === "list") {
            setPage({ id: "list" });
          }
        }}
        size="xl"
        showNavigation={false}
        addFooterSeparator
        leftButton={footer.leftButton}
        rightButton={footer.rightButton}
      />
    </MultiPageSheet>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export function TriggersSection({
  schedule,
  onScheduleChange,
  triggers,
  isLoading,
  onSave,
  onRemove,
}: {
  schedule: ScheduleConfig;
  onScheduleChange: (schedule: ScheduleConfig) => void;
  triggers: BuilderTrigger[];
  isLoading: boolean;
  onSave: (trigger: BuilderTrigger) => void;
  onRemove: (trigger: BuilderTrigger) => void;
}) {
  const [sheet, setSheet] = useState<{ open: boolean; page: SheetPage }>({
    open: false,
    page: { id: "list", webhooksOnly: true },
  });
  const webhooks = triggers.filter((trigger) => trigger.kind === "webhook");
  const hasSchedule = schedule.repeat !== "never";

  const openTrigger = (trigger: BuilderTrigger) => {
    if (trigger.kind === "schedule") {
      setSheet({
        open: true,
        page: { id: "schedule", draft: trigger, isNew: false },
      });
    } else {
      const source =
        mockWebhookSources.find(
          (candidate) => candidate.id === trigger.webhookSourceId
        ) ?? mockWebhookSources[0];
      setSheet({
        open: true,
        page: { id: "webhook", draft: trigger, isNew: false, source },
      });
    }
  };

  const summaryParts = [
    hasSchedule ? describeScheduleConfig(schedule) : null,
    webhooks.length > 0
      ? `${webhooks.length} webhook${webhooks.length === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean);

  return (
    <BuilderSection
      title="Triggers"
      collapsible
      defaultOpen={hasSchedule || webhooks.length > 0}
      summary={summaryParts.length > 0 ? summaryParts.join(" · ") : "None"}
      description={
        <>
          Run your agent on a schedule or when events happen.{" "}
          <Hoverable
            variant="highlight"
            href="https://docs.dust.tt"
            target="_blank"
          >
            Guide
          </Hoverable>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <ScheduleCard schedule={schedule} onChange={onScheduleChange} />
          {hasSchedule ? (
            <Collapsible>
              <CollapsibleTrigger label="Advanced" variant="secondary" />
              <CollapsibleContent>
                <div className="flex flex-col gap-4 pt-3">
                  <CommonFields
                    value={schedule}
                    onChange={(patch) =>
                      onScheduleChange({ ...schedule, ...patch })
                    }
                    readOnly={false}
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <span className="heading-sm text-foreground">Webhooks</span>
              <span className="text-pretty text-xs text-muted-foreground">
                Run the agent when an external service sends an event.
              </span>
            </div>
            <Button
              size="sm"
              variant="outline"
              icon={Zap}
              label="Add webhook"
              onClick={() =>
                setSheet({
                  open: true,
                  page: { id: "list", webhooksOnly: true },
                })
              }
            />
          </div>
          {isLoading ? (
            <CardGrid
              aria-busy
              className="animate-pulse motion-reduce:animate-none"
            >
              {[0, 1].map((index) => (
                <div
                  key={index}
                  className="min-h-28 rounded-2xl bg-muted-background"
                />
              ))}
            </CardGrid>
          ) : webhooks.length > 0 ? (
            <CardGrid>
              {webhooks.map((trigger) => (
                <TriggerCard
                  key={trigger.id}
                  trigger={trigger}
                  onClick={() => openTrigger(trigger)}
                  onRemove={() => onRemove(trigger)}
                />
              ))}
            </CardGrid>
          ) : null}
        </div>

        <Collapsible>
          <CollapsibleTrigger
            label="Other members’ triggers"
            variant="secondary"
          />
          <CollapsibleContent>
            <div className="pt-3">
              <CardGrid>
                {mockOtherMembersTriggers.map((trigger) => (
                  <TriggerCard
                    key={trigger.id}
                    trigger={trigger}
                    onClick={() => openTrigger(trigger)}
                  />
                ))}
              </CardGrid>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
      <TriggersSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((prev) => ({ ...prev, open }))}
        initialPage={sheet.page}
        onSave={onSave}
      />
    </BuilderSection>
  );
}
