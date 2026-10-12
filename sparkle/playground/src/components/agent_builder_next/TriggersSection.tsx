import {
  ActionCard,
  AnimatedText,
  Button,
  CardGrid,
  Checkbox,
  Chip,
  Clock,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Hoverable,
  Input,
  Label,
  MultiPageSheet,
  MultiPageSheetContent,
  type MultiPageSheetPage,
  SearchInput,
  SliderToggle,
  Spinner,
  TextArea,
  Tooltip,
  Zap,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { mockUsers } from "../../data/users";
import {
  type BuilderTrigger,
  describeSchedule,
  mockBuilderSpaces,
  mockOtherMembersTriggers,
  mockRequestHistory,
  mockWebhookSources,
  NEXT_OCCURRENCES,
  type WebhookSource,
} from "./data";
import { BuilderSection } from "./SectionContainer";

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
    ? `Triggered by ${trigger.event} events on ${sourceName}'s source.`
    : `Triggered on ${sourceName}'s source.`;
}

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
      disabled={trigger.status !== "enabled"}
      onClick={onClick}
      onRemove={onRemove}
      footer={{
        label: (
          <span>
            Managed by <strong>{editor?.fullName ?? "Unknown"}</strong>.
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
  | { id: "list" }
  | { id: "schedule"; draft: BuilderTrigger; isNew: boolean }
  | {
      id: "webhook";
      draft: BuilderTrigger;
      isNew: boolean;
      source: WebhookSource;
    };

function CommonFields({
  draft,
  onChange,
  readOnly,
}: {
  draft: BuilderTrigger;
  onChange: (next: BuilderTrigger) => void;
  readOnly: boolean;
}) {
  const pods = mockBuilderSpaces.filter((space) => space.kind === "pod");
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label className="text-base font-semibold">Message (optional)</Label>
        <span className="text-sm text-muted-foreground">
          Message for the agent when the trigger runs.
        </span>
        <TextArea
          value={draft.message ?? ""}
          disabled={readOnly}
          onChange={(event) =>
            onChange({ ...draft, message: event.target.value })
          }
          placeholder="Summarize what changed and post it to the team."
          minRows={3}
          resize="vertical"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label className="text-base font-semibold">Credits</Label>
        <span className="text-sm text-muted-foreground">
          Which pool this trigger's runs take credits from.
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
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
        <Label className="text-base font-semibold">
          Where to create this conversation? (optional)
        </Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              isSelect
              className="self-start"
              disabled={readOnly}
              label={
                pods.find((pod) => pod.id === draft.podId)?.name ??
                "My conversations (default)"
              }
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              label="My conversations (default)"
              onSelect={() => onChange({ ...draft, podId: null })}
            />
            {pods.map((pod) => (
              <DropdownMenuItem
                key={pod.id}
                label={pod.name}
                onSelect={() => onChange({ ...draft, podId: pod.id })}
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
  return (
    <div className="flex items-end gap-4">
      <div className="flex flex-1 flex-col gap-2">
        <Label className="text-base font-semibold">Name</Label>
        <Input
          placeholder="Enter trigger name"
          value={draft.name}
          disabled={readOnly}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </div>
      <div className="flex flex-col items-end gap-2 pb-1">
        <Label className="text-base font-semibold">Status</Label>
        <SliderToggle
          selected={draft.status === "enabled"}
          disabled={readOnly}
          onClick={() =>
            onChange({
              ...draft,
              status: draft.status === "enabled" ? "disabled" : "enabled",
            })
          }
        />
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

  useEffect(() => {
    const text = draft.scheduleText ?? "";
    if (!text.trim()) {
      return;
    }
    setIsGenerating(true);
    const timer = window.setTimeout(() => {
      setIsGenerating(false);
      onChange({ ...draft, scheduleLabel: describeSchedule(text) });
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
        <Label className="text-base font-semibold">Scheduler</Label>
        <span className="text-sm text-muted-foreground">
          Describe when you want the agent to run in natural language.
        </span>
        <TextArea
          value={draft.scheduleText ?? ""}
          disabled={readOnly}
          onChange={(event) =>
            onChange({ ...draft, scheduleText: event.target.value })
          }
          placeholder='e.g. "run every day at 9 AM", or "Late afternoon on business days"...'
          minRows={2}
          resize="none"
        />
        {draft.scheduleText?.trim() ? (
          <ContentMessage variant="outline" size="lg">
            {isGenerating ? (
              <AnimatedText>Generating schedule...</AnimatedText>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span>{draft.scheduleLabel}</span>
                <Tooltip
                  label={
                    <div className="flex flex-col gap-0.5">
                      {NEXT_OCCURRENCES.map((occurrence) => (
                        <span key={occurrence}>{occurrence}</span>
                      ))}
                    </div>
                  }
                  trigger={
                    <Chip size="xs" icon={Clock} label="Next 5 occurrences" />
                  }
                />
              </div>
            )}
          </ContentMessage>
        ) : null}
      </div>
      <CommonFields draft={draft} onChange={onChange} readOnly={readOnly} />
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
            <Label className="text-base font-semibold">Listen for</Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
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
            <Label className="text-base font-semibold">
              Run only when (optional)
            </Label>
            <Input
              placeholder='e.g. label is "urgent"'
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
          <Label className="text-base font-semibold">
            Filter expression (optional)
          </Label>
          <Input
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
          size="xs"
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
        <Label className="text-base font-semibold">Message (optional)</Label>
        <TextArea
          value={draft.message ?? ""}
          disabled={readOnly}
          onChange={(event) =>
            onChange({ ...draft, message: event.target.value })
          }
          placeholder="Triage the event and reply in the thread."
          minRows={3}
          resize="vertical"
        />
        <div className="flex items-center gap-2">
          <Checkbox
            checked={Boolean(draft.includePayload)}
            disabled={readOnly}
            onCheckedChange={(checked) =>
              onChange({ ...draft, includePayload: checked === true })
            }
          />
          <span className="text-sm text-foreground">
            Include webhook payload
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label className="text-base font-semibold">Credits</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
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
          <Input
            type="number"
            containerClassName="w-24"
            value={String(draft.rateLimit ?? 60)}
            disabled={readOnly}
            onChange={(event) =>
              onChange({ ...draft, rateLimit: Number(event.target.value) || 0 })
            }
          />
          <span className="text-sm text-muted-foreground">runs per hour</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label className="text-base font-semibold">
          Where to create this conversation? (optional)
        </Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
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
            {mockRequestHistory.map((request) => (
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
          </div>
        </CollapsibleContent>
      </Collapsible>
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
  const showSchedule = !needle || "schedule".includes(needle);
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
        placeholder="Search triggers..."
        value={search}
        onChange={setSearch}
      />
      {!showSchedule && sources.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          No triggers found matching your search
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
    { id: "list", title: "Add triggers", icon: Zap, content: listContent },
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
          leftButton: {
            label: "Close",
            variant: "outline" as const,
            onClick: () => onOpenChange(false),
          },
          rightButton: {
            label: "Save",
            variant: "primary" as const,
            onClick: () => onOpenChange(false),
          },
        }
      : {
          leftButton: {
            label: "Cancel",
            variant: "outline" as const,
            onClick: () =>
              page.isNew ? setPage({ id: "list" }) : onOpenChange(false),
          },
          rightButton: isReadOnly
            ? {
                label: "Close",
                variant: "primary" as const,
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
  triggers,
  isLoading,
  onSave,
  onRemove,
}: {
  triggers: BuilderTrigger[];
  isLoading: boolean;
  onSave: (trigger: BuilderTrigger) => void;
  onRemove: (trigger: BuilderTrigger) => void;
}) {
  const [sheet, setSheet] = useState<{ open: boolean; page: SheetPage }>({
    open: false,
    page: { id: "list" },
  });

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

  const addButton = (
    <Button
      size="sm"
      variant="primary"
      icon={Zap}
      label="Add triggers"
      onClick={() => setSheet({ open: true, page: { id: "list" } })}
    />
  );

  return (
    <BuilderSection
      title="Triggers"
      collapsible
      defaultOpen={triggers.length > 0}
      summary={
        triggers.length === 0
          ? "None"
          : `${triggers.length} trigger${triggers.length === 1 ? "" : "s"}`
      }
      description={
        <>
          Run agents based on events. Need help? Check our{" "}
          <Hoverable
            variant="highlight"
            href="https://docs.dust.tt"
            target="_blank"
          >
            guide
          </Hoverable>
          .
        </>
      }
      headerActions={addButton}
    >
      {isLoading ? (
        <div className="flex h-40 items-center justify-center">
          <Spinner />
        </div>
      ) : triggers.length === 0 ? (
        <div className="rounded-xl border border-border bg-muted-background px-4 py-6 text-center text-sm text-muted-foreground">
          No triggers yet.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <CardGrid>
            {triggers.map((trigger) => (
              <TriggerCard
                key={trigger.id}
                trigger={trigger}
                onClick={() => openTrigger(trigger)}
                onRemove={() => onRemove(trigger)}
              />
            ))}
          </CardGrid>
          <Collapsible>
            <CollapsibleTrigger
              label="Other members' triggers"
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
      )}
      <TriggersSheet
        open={sheet.open}
        onOpenChange={(open) => setSheet((prev) => ({ ...prev, open }))}
        initialPage={sheet.page}
        onSave={onSave}
      />
    </BuilderSection>
  );
}
