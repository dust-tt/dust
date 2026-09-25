import {
  ArrowUp,
  Attachment01,
  Avatar,
  BarFull,
  BarHalf,
  BarLow,
  Button,
  Chip,
  cn,
  Composer,
  ComposerInput,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Icon,
  InfoCircle,
  Planet,
  Plus,
  Robot,
  ShapesPlus,
  Tooltip,
  VoicePicker,
  type VoicePickerStatus,
  XClose,
} from "@dust-tt/sparkle";
import {
  type ComponentType,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { type Agent, mockSkills, type Skill } from "../data";
import {
  type ComposerSuggestion,
  getAgentAvatarProps,
  getComposerSuggestion,
  getSuggestionId,
  MODEL_TIERS,
  type ModelTierId,
  PICKER_AGENTS,
  SKILL_TILE_BACKGROUND,
  SKILL_TILE_ICON_COLOR,
} from "./discoverAgentData";
import { useDelayedUnmount } from "./discoverAgentMotion";

// Copied from front/components/assistant/conversation/input_bar/inputBarPillStyles.ts
const INPUT_BAR_PILL_SURFACE_CLASSNAME =
  "border-[0.5px] border-border-dark bg-background dark:bg-stone-725 " +
  "shadow-[inset_2px_-2px_7px_0px_rgba(0,0,0,0.02),0px_0.5px_0.5px_0px_rgba(0,0,0,0.04)]";

const INPUT_BAR_PILL_HOVER_CLASSNAME =
  "hover:bg-primary-100 dark:hover:bg-[oklch(0.393_0.013_76.451)]";

// front/components/model_picker/modelPickerIcons.ts
const MODEL_TIER_ICON: Record<ModelTierId, ComponentType> = {
  fast: BarLow,
  standard: BarHalf,
  complex: BarFull,
};

// front/components/editor/input_bar/useCustomEditor.tsx
const INPUT_BAR_DEFAULT_PLACEHOLDER = "Get work done";

// Desktop button size in InputBarContainer (`isMobile ? "sm" : "xs"`).
const BUTTON_SIZE = "xs";

interface DiscoverAgentComposerProps {
  // The draft is owned by the page so the suggested prompts under the
  // composer can fill it.
  value: string;
  onChange: (value: string) => void;
  selectedAgent: Agent | null;
  onSelectAgent: (agent: Agent | null) => void;
  selectedSkills: Skill[];
  onSelectedSkillsChange: (skills: Skill[]) => void;
  onSubmit: (text: string) => void;
}

/**
 * The empty-state composer of the new conversation page, built on Sparkle's
 * `Composer` / `ComposerInput` (the design-system mirror of the product
 * `InputBar`): agent pill + plus menu on the left, model picker, voice and
 * send on the right. While the member types, a banner above the surface
 * proposes one agent or skill that would improve the answer.
 */
export function DiscoverAgentComposer({
  value,
  onChange,
  selectedAgent,
  onSelectAgent,
  selectedSkills,
  onSelectedSkillsChange,
  onSubmit,
}: DiscoverAgentComposerProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [modelTier, setModelTier] = useState<ModelTierId>("standard");
  // Suggestions the member dismissed or already added, so they do not pop
  // back for the same draft.
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState<
    string[]
  >([]);
  // Number of suggestions added for the current draft; gates the fallback.
  const [addedSuggestionCount, setAddedSuggestionCount] = useState(0);

  const isEmpty = value.trim().length === 0;

  const suggestion = useMemo(
    () =>
      getComposerSuggestion(
        value,
        [
          ...dismissedSuggestionIds,
          ...(selectedAgent ? [selectedAgent.id] : []),
          // Once a skill is attached, no further skill is proposed; agent
          // suggestions can still surface.
          ...(selectedSkills.length > 0 ? mockSkills : []).map((s) => s.id),
        ],
        dismissedSuggestionIds.length === 0 &&
          addedSuggestionCount === 0 &&
          selectedSkills.length === 0
      ),
    [
      value,
      dismissedSuggestionIds,
      addedSuggestionCount,
      selectedAgent,
      selectedSkills,
    ]
  );

  const handleAddSuggestion = useCallback(
    (s: ComposerSuggestion) => {
      if (s.kind === "agent") {
        onSelectAgent(s.agent);
      } else {
        onSelectedSkillsChange([...selectedSkills, s.skill]);
      }
      setAddedSuggestionCount((n) => n + 1);
      inputRef.current?.focus();
    },
    [onSelectAgent, onSelectedSkillsChange, selectedSkills]
  );

  const handleDismissSuggestion = useCallback((s: ComposerSuggestion) => {
    setDismissedSuggestionIds((ids) => [...ids, getSuggestionId(s)]);
    inputRef.current?.focus();
  }, []);

  const handleSubmit = useCallback(() => {
    const text = value.trim();
    if (!text) {
      return;
    }
    onSubmit(text);
    onChange("");
    setDismissedSuggestionIds([]);
    setAddedSuggestionCount(0);
  }, [value, onSubmit]);

  const voice = useFakeVoiceRecording({
    onTranscribed: (transcript) =>
      onChange(value ? `${value} ${transcript}` : transcript),
  });

  const isRecording = voice.status !== "idle";

  return (
    // pb-4 balances the skill banner slot's -mt-4 so idle spacing below the
    // composer is unchanged.
    <div className="flex w-full flex-col pb-4">
      {/* Sits above the suggestion tab tucked under its bottom edge. */}
      <Composer
        variant="floating"
        className="z-10"
        isFocused={isFocused}
        onContentClick={() => inputRef.current?.focus()}
        chips={
          // Always mounted so the row can grow and shrink instead of
          // appearing: 0fr → 1fr on the grid, with the empty state pulling
          // the slot's top padding back in.
          <div
            className={cn(
              "grid w-full transition-[grid-template-rows,margin-top] duration-200 ease-emphasized motion-reduce:transition-none",
              selectedSkills.length > 0
                ? "mt-0 grid-rows-[1fr]"
                : "-mt-2 grid-rows-[0fr]"
            )}
          >
            <div className="flex min-h-0 flex-wrap items-center gap-1 overflow-hidden">
              {selectedSkills.map((skill) => (
                <Chip
                  key={skill.id}
                  size="xs"
                  label={skill.name}
                  icon={skill.icon}
                  className={cn(
                    "m-0.5 bg-background text-foreground",
                    // Enters from a slight scale-down; never from scale(0).
                    "transition-[color,background-color,opacity,scale] duration-200 ease-emphasized",
                    "starting:scale-[0.96] starting:opacity-0 motion-reduce:starting:scale-100"
                  )}
                  onRemove={() =>
                    onSelectedSkillsChange(
                      selectedSkills.filter((s) => s.id !== skill.id)
                    )
                  }
                />
              ))}
            </div>
          </div>
        }
        leftActions={
          // Fades out while recording instead of unmounting, and back in on
          // stop, so the row does not teleport.
          <div
            aria-hidden={isRecording}
            className={cn(
              "flex items-center gap-1.5",
              "transition-[opacity,scale] duration-(--transition-duration-exit) ease-enter motion-reduce:transition-opacity",
              isRecording &&
                "pointer-events-none scale-[0.97] opacity-0 motion-reduce:scale-100"
            )}
          >
            <AgentPicker
              selectedAgent={selectedAgent}
              onSelect={onSelectAgent}
            />
            <PlusMenu />
          </div>
        }
        rightActions={
          <>
            <div className={cn("flex items-center", "gap-2")}>
              <ModelPicker value={modelTier} onChange={setModelTier} />
            </div>
            <VoicePicker
              status={voice.status}
              level={voice.level}
              elapsedSeconds={voice.elapsedSeconds}
              onRecordStart={voice.start}
              onRecordStop={voice.stop}
              size={BUTTON_SIZE}
              showStopLabel
              buttonProps={{ className: "rounded-full" }}
            />
            <Button
              size={BUTTON_SIZE}
              aria-label="Send message"
              icon={ArrowUp}
              variant="highlight"
              disabled={isEmpty || isRecording}
              className="rounded-full"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleSubmit();
              }}
            />
          </>
        }
      >
        <ComposerInput
          ref={inputRef}
          value={value}
          onChange={onChange}
          onSubmit={handleSubmit}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={INPUT_BAR_DEFAULT_PLACEHOLDER}
          autoFocus
          className="max-h-[40vh] min-h-11"
        />
      </Composer>
      {/* Agent and skill suggestions both hang from the bottom edge. */}
      <SuggestionBanner
        placement="below"
        suggestion={suggestion}
        onAdd={handleAddSuggestion}
        onDismiss={handleDismissSuggestion}
      />
    </div>
  );
}

// ── Suggestion banner ───────────────────────────────────────────────────────
// A tab attached to the top edge of the composer: same width, rounded top
// corners, tucked under the composer surface so it can slide up from behind
// it and back down again. One line of text, a primary "Add" pill, dismiss.
// Lives in the flow inside a grid row that animates between 0fr and 1fr, so
// deploying it pushes the composer (or what follows it) rather than covering
// anything. Both kinds hang from the bottom edge today; `above` is kept for
// the top-edge variant.

type BannerPlacement = "above" | "below";

function SuggestionBanner({
  placement,
  suggestion,
  onAdd,
  onDismiss,
}: {
  placement: BannerPlacement;
  suggestion: ComposerSuggestion | null;
  onAdd: (s: ComposerSuggestion) => void;
  onDismiss: (s: ComposerSuggestion) => void;
}) {
  const { shown, isLeaving } = useDelayedUnmount(suggestion);
  const isOpen = shown !== null && !isLeaving;

  return (
    <div
      className={cn(
        "grid transition-[grid-template-rows] ease-emphasized motion-reduce:transition-none",
        // The below slot tucks its top under the composer.
        placement === "below" && "-mt-4",
        isOpen
          ? "grid-rows-[1fr] duration-(--transition-duration-enter)"
          : "grid-rows-[0fr] duration-(--transition-duration-exit)"
      )}
    >
      <div className="min-h-0 overflow-hidden">
        {shown && (
          <SuggestionBannerContent
            placement={placement}
            suggestion={shown}
            isLeaving={isLeaving}
            onAdd={onAdd}
            onDismiss={onDismiss}
          />
        )}
      </div>
    </div>
  );
}

function SuggestionBannerContent({
  placement,
  suggestion: current,
  isLeaving,
  onAdd,
  onDismiss,
}: {
  placement: BannerPlacement;
  suggestion: ComposerSuggestion;
  isLeaving: boolean;
  onAdd: (s: ComposerSuggestion) => void;
  onDismiss: (s: ComposerSuggestion) => void;
}) {
  const id = getSuggestionId(current);
  const headline =
    current.kind === "agent" ? (
      <>
        Use <span className="notranslate">@{current.agent.name}</span> for this
        request
      </>
    ) : (
      <>
        Add <span className="notranslate">{current.skill.name}</span> to this
        request
      </>
    );
  const addLabel = current.kind === "agent" ? "Add agent" : "Add skill";

  return (
    <div
      key={id}
      role="status"
      aria-hidden={isLeaving}
      className={cn(
        // 12px of visible padding on the far side of the content plus the
        // 1rem the composer overlaps, so the seam is hidden.
        "flex items-center gap-3 border border-border px-4",
        placement === "above"
          ? "rounded-t-3xl border-b-0 pb-7 pt-3"
          : "rounded-b-3xl border-t-0 pb-3 pt-7",
        "bg-muted-background dark:bg-stone-850",
        // Slides out from behind the composer and back; reduced motion keeps
        // only the fade.
        "transition-[opacity,translate] duration-(--transition-duration-enter) ease-emphasized motion-reduce:transition-opacity",
        "starting:opacity-0 motion-reduce:starting:translate-y-0",
        placement === "above"
          ? "starting:translate-y-full"
          : "starting:-translate-y-full",
        isLeaving &&
          cn(
            "pointer-events-none opacity-0 duration-(--transition-duration-exit) ease-enter motion-reduce:translate-y-0",
            placement === "above" ? "translate-y-full" : "-translate-y-full"
          )
      )}
    >
      {current.kind === "agent" ? (
        <Avatar size="xs" {...getAgentAvatarProps(current.agent)} />
      ) : (
        <Avatar
          size="xs"
          icon={current.skill.icon}
          backgroundColor={SKILL_TILE_BACKGROUND}
          iconColor={SKILL_TILE_ICON_COLOR}
          className="rounded-lg border-0"
        />
      )}
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="heading-sm truncate text-foreground">{headline}</span>
        <Tooltip
          tooltipTriggerAsChild
          trigger={
            <span className="flex items-center text-muted-foreground">
              <Icon visual={InfoCircle} size="xs" />
            </span>
          }
          label={`${
            current.kind === "agent"
              ? `@${current.agent.name}`
              : current.skill.name
          } ${current.reason}`}
        />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="xs"
          variant="primary"
          label={addLabel}
          isRounded
          onClick={() => onAdd(current)}
        />
        <Button
          size="xs"
          variant="ghost"
          icon={XClose}
          tooltip="Dismiss"
          onClick={() => onDismiss(current)}
        />
      </div>
    </div>
  );
}

// ── Agent picker (front/components/assistant/AgentPicker.tsx + InputBarButtons)

function AgentPicker({
  selectedAgent,
  onSelect,
}: {
  selectedAgent: Agent | null;
  onSelect: (agent: Agent | null) => void;
}) {
  const [search, setSearch] = useState("");

  const filteredAgents = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return needle
      ? PICKER_AGENTS.filter((a) => a.name.toLowerCase().includes(needle))
      : PICKER_AGENTS;
  }, [search]);

  return (
    <DropdownMenu
      modal={false}
      onOpenChange={(open) => {
        if (!open) {
          setSearch("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        {selectedAgent ? (
          <div
            role="button"
            tabIndex={0}
            aria-label={`Selected agent: ${selectedAgent.name}`}
            className={cn(
              "inline-flex box-border items-center rounded-full heading-xs px-2 gap-1.5 text-primary-900 transition-colors duration-200",
              "h-6",
              INPUT_BAR_PILL_SURFACE_CLASSNAME,
              "cursor-pointer",
              INPUT_BAR_PILL_HOVER_CLASSNAME
            )}
          >
            <Avatar size="3xs" {...getAgentAvatarProps(selectedAgent)} />
            <span className="grow truncate notranslate">
              {selectedAgent.name}
            </span>
          </div>
        ) : (
          <Button
            variant="ghost-secondary"
            size={BUTTON_SIZE}
            icon={Robot}
            label="Agent"
            isRounded
            className={cn(
              INPUT_BAR_PILL_SURFACE_CLASSNAME,
              INPUT_BAR_PILL_HOVER_CLASSNAME
            )}
          />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="start"
        className="w-80"
        dropdownHeaders={
          <DropdownMenuSearchbar
            name="agent-search"
            placeholder="Search agents"
            value={search}
            onChange={setSearch}
            autoFocus
          />
        }
      >
        {selectedAgent && (
          <>
            <DropdownMenuItem
              icon={XClose}
              label={`Remove @${selectedAgent.name}`}
              onClick={() => onSelect(null)}
            />
            <DropdownMenuSeparator />
          </>
        )}
        {filteredAgents.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs italic text-muted-foreground">
            No matches
          </div>
        ) : (
          filteredAgents.map((agent) => (
            <DropdownMenuItem
              key={agent.id}
              className="notranslate"
              label={agent.name}
              description={agent.description}
              truncateText
              icon={() => <Avatar size="sm" {...getAgentAvatarProps(agent)} />}
              onClick={() => onSelect(agent)}
            />
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Plus menu (front/components/assistant/conversation/input_bar/InputBarPlusMenu.tsx)

function PlusMenu() {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost-secondary"
          icon={Plus}
          size={BUTTON_SIZE}
          isRounded
          tooltip="More"
          className={cn(
            INPUT_BAR_PILL_SURFACE_CLASSNAME,
            INPUT_BAR_PILL_HOVER_CLASSNAME
          )}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuItem label="Capabilities" icon={ShapesPlus} />
        <DropdownMenuItem label="Attach" icon={Attachment01} />
        <DropdownMenuItem label="Spaces" icon={Planet} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Model picker (front/components/model_picker/ModelPicker.tsx) ────────────

function ModelPicker({
  value,
  onChange,
}: {
  value: ModelTierId;
  onChange: (tier: ModelTierId) => void;
}) {
  const current = MODEL_TIERS.find((t) => t.id === value) ?? MODEL_TIERS[1];

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          className="px-2"
          variant="ghost-secondary"
          size={BUTTON_SIZE}
          icon={MODEL_TIER_ICON[current.id]}
          label={current.name}
          isSelect
          aria-label={`Model picker: ${current.name}`}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end" className="w-64">
        <DropdownMenuLabel label="Model" />
        {MODEL_TIERS.map((tier) => (
          <DropdownMenuItem
            key={tier.id}
            icon={MODEL_TIER_ICON[tier.id]}
            label={tier.name}
            onClick={() => onChange(tier.id)}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Fake voice service ──────────────────────────────────────────────────────
// Stands in for the product's `useVoiceRecorderService`: animates a level
// meter while "recording" and drops a canned transcript into the input on stop.

function useFakeVoiceRecording({
  onTranscribed,
}: {
  onTranscribed: (transcript: string) => void;
}) {
  const [status, setStatus] = useState<VoicePickerStatus>("idle");
  const [level, setLevel] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (status !== "recording") {
      return;
    }
    const levelTimer = window.setInterval(() => {
      setLevel(0.2 + Math.random() * 0.7);
    }, 120);
    const clockTimer = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => {
      window.clearInterval(levelTimer);
      window.clearInterval(clockTimer);
    };
  }, [status]);

  const start = useCallback(() => {
    setElapsedSeconds(0);
    setStatus("recording");
  }, []);

  const stop = useCallback(() => {
    setStatus("transcribing");
    setLevel(0);
    window.setTimeout(() => {
      onTranscribed("Summarize what changed in the product this week.");
      setStatus("idle");
      setElapsedSeconds(0);
    }, 900);
  }, [onTranscribed]);

  return { status, level, elapsedSeconds, start, stop };
}
