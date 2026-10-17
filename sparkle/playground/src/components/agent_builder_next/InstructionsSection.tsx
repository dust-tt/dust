import {
  Avatar,
  Button,
  Check,
  ClockRewind,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Label,
  RefreshCw02,
  Separator,
  Spinner,
  XClose,
} from "@dust-tt/sparkle";
import { useEffect, useRef, useState } from "react";

import type { Agent } from "../../data/types";
import { RichTextArea, type RichTextAreaHandle } from "../RichTextArea";
import {
  INSTRUCTIONS_MAX_CHARS,
  INSTRUCTIONS_PLACEHOLDER,
  type InstructionVersion,
  mockInstructionVersions,
  mockSimilarAgents,
} from "./data";
import { BuilderSection } from "./SectionContainer";

type SimilarAgentsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "done"; agents: Agent[] };

export type InstructionsSectionProps = {
  editorRef: React.RefObject<RichTextAreaHandle | null>;
  scrollContainer: HTMLElement | null;
  isNewAgent: boolean;
  /** The current plain-text length, kept by the parent from onTextChange. */
  textLength: number;
  onTextChange: (value: string) => void;
  onEditorBlur: () => void;
  onAskSidekick: (payload: {
    selectedText: string;
    start: number;
    end: number;
  }) => void;
  hasSuggestions: boolean;
  onSuggestionsChange: (hasSuggestions: boolean) => void;
  onAcceptAllSuggestions: () => void;
  onRejectAllSuggestions: () => void;
  onOpenAgentDetails: (agent: Agent) => void;
};

export function InstructionsSection({
  editorRef,
  scrollContainer,
  isNewAgent,
  textLength,
  onTextChange,
  onEditorBlur,
  onAskSidekick,
  hasSuggestions,
  onSuggestionsChange,
  onAcceptAllSuggestions,
  onRejectAllSuggestions,
  onOpenAgentDetails,
}: InstructionsSectionProps) {
  const [comparedVersion, setComparedVersion] =
    useState<InstructionVersion | null>(null);
  const [isLoadingAuthors, setIsLoadingAuthors] = useState(false);
  const [similarAgents, setSimilarAgents] = useState<SimilarAgentsState>({
    status: "idle",
  });
  const similarCheckTimer = useRef<number | null>(null);

  // Similar-agents check: only for new agents, once the text is long enough.
  useEffect(() => {
    if (!isNewAgent) {
      return;
    }
    if (textLength < 30) {
      setSimilarAgents({ status: "idle" });
      return;
    }
    if (similarAgents.status !== "idle") {
      return;
    }
    setSimilarAgents({ status: "loading" });
    similarCheckTimer.current = window.setTimeout(() => {
      setSimilarAgents({ status: "done", agents: mockSimilarAgents });
    }, 900);
    return () => {
      if (similarCheckTimer.current) {
        window.clearTimeout(similarCheckTimer.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNewAgent, textLength >= 30]);

  const showCounter = textLength > INSTRUCTIONS_MAX_CHARS / 2;
  const isOverLimit = textLength > INSTRUCTIONS_MAX_CHARS;
  const showHistory = !isNewAgent && mockInstructionVersions.length > 1;
  const isComparing = comparedVersion !== null;

  const headerActions = (
    <>
      {hasSuggestions ? (
        <>
          <Button
            size="xs"
            variant="outline"
            icon={XClose}
            label="Reject all"
            tooltip="Reject all suggestions"
            onClick={onRejectAllSuggestions}
          />
          <Button
            size="xs"
            variant="highlight-secondary"
            icon={Check}
            label="Accept all"
            tooltip="Accept all suggestions"
            onClick={onAcceptAllSuggestions}
          />
        </>
      ) : null}
      {showHistory && !isComparing ? (
        <DropdownMenu
          onOpenChange={(open) => {
            if (open) {
              setIsLoadingAuthors(true);
              window.setTimeout(() => setIsLoadingAuthors(false), 500);
            }
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button
              icon={ClockRewind}
              size="sm"
              variant="ghost-secondary"
              isSelect
              tooltip="Compare with previous versions"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="h-96 w-72">
            <DropdownMenuLabel label="Choose version to compare" />
            <DropdownMenuSeparator />
            {isLoadingAuthors ? (
              <div className="flex justify-center py-6">
                <Spinner size="sm" />
              </div>
            ) : (
              <DropdownMenuRadioGroup
                value={comparedVersion?.id ?? ""}
                onValueChange={(id) => {
                  const version =
                    mockInstructionVersions.find(
                      (candidate) => candidate.id === id
                    ) ?? null;
                  window.setTimeout(() => setComparedVersion(version), 0);
                }}
              >
                {mockInstructionVersions.map((version) => (
                  <DropdownMenuRadioItem
                    key={version.id}
                    value={version.id}
                    label={version.label}
                    description={`by ${version.authorName}`}
                  />
                ))}
              </DropdownMenuRadioGroup>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );

  return (
    <BuilderSection
      title="Instructions"
      description="Command or guideline you provide to your agent to direct its responses."
      headerActions={hasSuggestions || showHistory ? headerActions : undefined}
    >
      {isComparing ? (
        <div className="flex flex-col gap-3">
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>
              Comparing current version with {comparedVersion.label}
            </Label>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                icon={XClose}
                label="Leave comparison mode"
                onClick={() => setComparedVersion(null)}
              />
              <Button
                size="sm"
                variant="warning"
                icon={RefreshCw02}
                label="Restore this version"
                onClick={() => setComparedVersion(null)}
              />
            </div>
          </div>
        </div>
      ) : null}
      <RichTextArea
        ref={editorRef}
        placeholder={INSTRUCTIONS_PLACEHOLDER}
        variant="embedded"
        showFormattingMenu
        readOnly={isComparing}
        onAskSidekick={onAskSidekick}
        onSuggestionsChange={onSuggestionsChange}
        onTextChange={onTextChange}
        onBlur={onEditorBlur}
        scrollContainer={scrollContainer}
        className="min-h-24 px-0 py-0"
      />
      {/* Always in the layout so the editor does not jump when it appears. */}
      <div
        aria-hidden={!showCounter}
        className={[
          "text-right text-xs tabular-nums",
          showCounter ? "" : "invisible",
          isOverLimit ? "text-foreground-warning" : "text-muted-foreground",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {textLength.toLocaleString("en-US")} /{" "}
        {INSTRUCTIONS_MAX_CHARS.toLocaleString("en-US")} characters
      </div>
      {similarAgents.status === "loading" ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner size="xs" />
          Checking for similar agents…
        </div>
      ) : null}
      {similarAgents.status === "error" ? (
        <div className="text-sm text-muted-foreground">
          Couldn’t check for similar agents.
        </div>
      ) : null}
      {similarAgents.status === "done" ? (
        <div className="flex flex-col gap-2">
          <div className="heading-sm text-foreground">Similar agents found</div>
          <div className="flex flex-col gap-1">
            {similarAgents.agents.map((agent) => (
              <button
                key={agent.id}
                type="button"
                className="group flex items-center gap-2 rounded-lg px-1 py-1 text-left hover:bg-muted-background"
                onClick={() => onOpenAgentDetails(agent)}
              >
                <Avatar
                  size="sm"
                  name={agent.name}
                  emoji={agent.emoji}
                  backgroundColor={agent.backgroundColor}
                />
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm font-medium text-foreground group-hover:underline">
                    {agent.name}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {agent.description}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </BuilderSection>
  );
}
