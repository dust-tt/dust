import {
  Avatar,
  BarFooter,
  BarHeader,
  BoldIcon,
  Button,
  Checkbox,
  CheckIcon,
  Chip,
  CodeBlockIcon,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  EmptyCTA,
  HeadingIcon,
  HistoryIcon,
  Icon,
  Input,
  ItalicIcon,
  Label,
  LinkIcon,
  ListCheckIcon,
  ListGroup,
  ListItem,
  ListOrdered2Icon,
  LockIcon,
  QuoteTextIcon,
  ScrollArea,
  ScrollBar,
  Separator,
  ServerIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SpaceClosedIcon as SpaceCloseIcon,
  SpaceOpenIcon,
  SpacesIcon,
  SparklesIcon,
  TagBlockIcon,
  ToolsIcon,
  UserGroupIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";

import { customColors } from "@dust-tt/sparkle/lib/colors";

import { InviteUsersScreen } from "./InviteUsersScreen";
import { RichTextArea, type RichTextAreaHandle } from "./RichTextArea";
import {
  getRandomAgents,
  mockInstructionCases,
  mockSpaces,
  mockSuggestionChanges,
  mockUsers,
} from "../data";

function parseDiffLinesForVersionPreview(): string {
  const baseInstruction =
    mockInstructionCases[
      Math.floor(Math.random() * mockInstructionCases.length)
    ];
  const lines = baseInstruction.split("\n");
  const additionStyle =
    "s-rounded s-bg-success-100 dark:s-bg-success-100-night s-px-0.5 s-text-success-600 dark:s-text-success-600-night";
  const removalStyle =
    "s-rounded s-bg-warning-100 dark:s-bg-warning-100-night s-px-0.5 s-text-warning-600 dark:s-text-warning-600-night s-line-through";
  const modifiedLines = lines.map((line, index) => {
    if (!line.trim()) return line;
    if (index === 3) {
      return `${line} <span data-diff-add class="${additionStyle}">Include response time targets.</span>`;
    }
    if (index === 7 && line.length > 20) {
      const midPoint = Math.floor(line.length / 2);
      const removedPart = line.substring(midPoint - 10, midPoint + 10);
      return (
        line.substring(0, midPoint - 10) +
        `<span data-diff-remove class="${removalStyle}">${removedPart}</span>` +
        line.substring(midPoint + 10)
      );
    }
    if (index === 12) {
      return `<span data-diff-remove class="${removalStyle}">Old requirement removed.</span> <span data-diff-add class="${additionStyle}">New requirement: prioritize clarity.</span>`;
    }
    return line;
  });
  return `<p>${modifiedLines.join("<br>")}</p>`;
}

/** Line from `mockInstructionCases[0]` — must match seeded instruction text. */
const DEMO_SUGGESTION_OLD = "- Never promise timelines or fixes.";
const DEMO_SUGGESTION_NEW =
  "- Never promise timelines; offer the next concrete step instead.";

export function SkillsAgentBuilderPlaygroundView({
  onClose,
}: {
  onClose?: () => void;
}) {
  const agent = useMemo(() => getRandomAgents(1)[0], []);
  const [skillName, setSkillName] = useState(agent?.name ?? "New skill");
  const [userFacingDescription, setUserFacingDescription] = useState(
    agent?.description ?? ""
  );

  const nameSuggestions = useMemo(() => {
    const count = Math.floor(Math.random() * 3) + 2;
    return getRandomAgents(count).map((a) => a.name);
  }, []);

  const versionHistoryItems = useMemo(() => {
    const dates = [
      "Jan 20, 2026 at 2:34 PM",
      "Jan 19, 2026 at 11:15 AM",
      "Jan 17, 2026 at 4:52 PM",
    ];
    return dates.map((date, index) => ({
      id: `version-${index}`,
      date,
      author: mockUsers[index % mockUsers.length].fullName,
    }));
  }, []);

  const initialEditorIds = useMemo(() => {
    const count = Math.floor(Math.random() * 4) + 1;
    return mockUsers.slice(0, count).map((u) => u.id);
  }, []);

  const [selectedEditorIds, setSelectedEditorIds] = useState<Set<string>>(
    () => new Set(initialEditorIds)
  );
  const [isInviteEditorsOpen, setIsInviteEditorsOpen] = useState(false);
  const selectedEditorIdList = useMemo(
    () => Array.from(selectedEditorIds),
    [selectedEditorIds]
  );

  const richTextAreaRef = useRef<RichTextAreaHandle | null>(null);
  const [hasSuggestionsState, setHasSuggestionsState] = useState(false);
  const instructionLocked = hasSuggestionsState;

  const [selectedVersion, setSelectedVersion] = useState<{
    id: string;
    date: string;
    author: string;
  } | null>(null);

  const selectableSpaces = useMemo(() => mockSpaces.slice(0, 12), []);
  const [isSpacesSheetOpen, setIsSpacesSheetOpen] = useState(false);
  const [selectedSpaceIds, setSelectedSpaceIds] = useState<Set<string>>(() => {
    const first = mockSpaces[0];
    return first ? new Set([first.id]) : new Set();
  });
  const [draftSpaceIds, setDraftSpaceIds] = useState<Set<string>>(
    () => new Set(selectedSpaceIds)
  );

  const isRestrictedSpace = (spaceId: string) =>
    spaceId.charCodeAt(spaceId.length - 1) % 2 === 0;

  const selectedSpaces = useMemo(
    () => selectableSpaces.filter((s) => selectedSpaceIds.has(s.id)),
    [selectableSpaces, selectedSpaceIds]
  );

  const editorNames = useMemo(() => {
    return mockUsers
      .filter((user) => selectedEditorIds.has(user.id))
      .map((user) => user.fullName || `${user.firstName} ${user.lastName}`);
  }, [selectedEditorIds]);

  const initialInstruction = useMemo(() => mockInstructionCases[0] ?? "", []);

  const versionDiffContent = useMemo(
    () => parseDiffLinesForVersionPreview(),
    []
  );

  const seedInstructionsDemo = useCallback(() => {
    const api = richTextAreaRef.current;
    if (!api) {
      return;
    }
    api.setContent(initialInstruction);
    queueMicrotask(() => {
      const ed = richTextAreaRef.current;
      if (!ed) {
        return;
      }
      const applied = ed.applyInlineSuggestion(
        DEMO_SUGGESTION_OLD,
        DEMO_SUGGESTION_NEW
      );
      if (applied) {
        setHasSuggestionsState(ed.hasSuggestions());
      } else {
        ed.applyRandomSuggestions(mockSuggestionChanges.slice(0, 8));
        setHasSuggestionsState(ed.hasSuggestions());
      }
    });
  }, [initialInstruction]);

  useEffect(() => {
    if (!isSpacesSheetOpen) return;
    setDraftSpaceIds(new Set(selectedSpaceIds));
  }, [isSpacesSheetOpen, selectedSpaceIds]);

  const checkForSuggestions = () => {
    setHasSuggestionsState(richTextAreaRef.current?.hasSuggestions() ?? false);
  };

  const toggleDraftSpace = (spaceId: string) => {
    setDraftSpaceIds((prev) => {
      const next = new Set(prev);
      if (next.has(spaceId)) next.delete(spaceId);
      else next.add(spaceId);
      return next;
    });
  };

  const removeSpace = (spaceId: string) => {
    setSelectedSpaceIds((prev) => {
      const next = new Set(prev);
      next.delete(spaceId);
      return next;
    });
  };

  const handleCancel = useCallback(() => {
    onClose?.();
  }, [onClose]);

  return (
    <div className="s-flex s-h-screen s-w-full s-flex-col s-bg-background dark:s-bg-background-night">
      <style>{`
        :root {
          --focus-border: linear-gradient(to bottom, ${customColors.gray[100]}, ${customColors.blue[400]}, ${customColors.gray[100]});
        }
        .s-dark {
          --focus-border: linear-gradient(to bottom, ${customColors.gray[900]}, ${customColors.blue[600]}, ${customColors.gray[900]});
        }
      `}</style>
      <BarHeader
        variant="default"
        className="s-mx-4"
        title="Create new skill"
        rightActions={
          <BarHeader.ButtonBar variant="close" onClose={handleCancel} />
        }
      />

      <ScrollArea className="s-min-h-0 s-flex-1">
        <ScrollBar orientation="vertical" size="minimal" />
        <div className="s-mx-auto s-space-y-10 s-p-8 2xl:s-max-w-5xl">
          <div className="s-space-y-3">
            <div>
              <h3 className="s-heading-lg s-font-semibold s-text-foreground dark:s-text-foreground-night">
                Spaces
              </h3>
              <p className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                Sets what knowledge and tools the skill can access.
              </p>
            </div>
            <div className="s-flex s-flex-wrap s-gap-2">
              <Button
                size="sm"
                variant="outline"
                label="Manage"
                icon={SpacesIcon}
                onClick={() => setIsSpacesSheetOpen(true)}
              />
              {selectedSpaces.map((space) => {
                const restricted = isRestrictedSpace(space.id);
                return (
                  <Chip
                    key={space.id}
                    icon={restricted ? SpaceCloseIcon : SpaceOpenIcon}
                    size="sm"
                    color={restricted ? "rose" : "primary"}
                    label={space.name}
                    onRemove={() => removeSpace(space.id)}
                  />
                );
              })}
            </div>
          </div>

          <section className="s-flex s-flex-col s-gap-3">
            <div>
              <div className="s-flex s-flex-wrap s-items-center s-gap-2">
                <h3
                  id="playground-instructions-heading"
                  className="s-heading-lg s-font-semibold s-text-foreground dark:s-text-foreground-night"
                >
                  Instructions
                </h3>
                {instructionLocked ? (
                  <Chip
                    size="sm"
                    color="warning"
                    icon={LockIcon}
                    label="Editing locked"
                  />
                ) : null}
              </div>
              <p className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                Commands and constraints the model follows when this skill runs.
              </p>
            </div>
            <div role="group" aria-labelledby="playground-instructions-heading">
              <RichTextArea
                ref={richTextAreaRef}
                placeholder="Write instructions for your skill..."
                readOnly={instructionLocked}
                onSuggestionsChange={setHasSuggestionsState}
                onEditorReady={seedInstructionsDemo}
                topBar={
                  <div className="s-flex s-flex-1 s-flex-wrap s-items-center s-gap-2 s-px-3 s-py-2">
                    <Button
                      icon={HeadingIcon}
                      size="icon"
                      variant="ghost-secondary"
                      tooltip="Heading"
                    />
                    <Button
                      icon={BoldIcon}
                      size="icon"
                      variant="ghost-secondary"
                      tooltip="Bold"
                      tooltipShortcut="Cmd+B"
                    />
                    <Button
                      icon={ItalicIcon}
                      size="icon"
                      variant="ghost-secondary"
                      tooltip="Italic"
                      tooltipShortcut="Cmd+I"
                    />
                    <Separator orientation="vertical" />
                    <Button
                      icon={LinkIcon}
                      size="icon"
                      variant="ghost-secondary"
                      tooltip="Insert a link"
                    />
                    <Button
                      icon={ListCheckIcon}
                      size="icon"
                      variant="ghost-secondary"
                      tooltip="Bulleted list"
                    />
                    <Button
                      icon={ListOrdered2Icon}
                      size="icon"
                      variant="ghost-secondary"
                      tooltip="Ordered list"
                    />
                    <Separator orientation="vertical" />
                    <Button
                      icon={QuoteTextIcon}
                      size="icon"
                      variant="ghost-secondary"
                      tooltip="Quotation block"
                    />
                    <Button
                      icon={CodeBlockIcon}
                      size="icon"
                      variant="ghost-secondary"
                      tooltip="Code Block"
                    />
                    <Separator orientation="vertical" />
                    <Button
                      icon={TagBlockIcon}
                      size="icon"
                      variant="ghost-secondary"
                      tooltip="XML tag"
                    />
                    <Separator orientation="vertical" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost-secondary"
                          icon={HistoryIcon}
                          isSelect
                        />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuLabel label="Version history" />
                        {versionHistoryItems.map((item) => (
                          <DropdownMenuItem
                            key={item.id}
                            label={item.date}
                            description={item.author}
                            onSelect={() => {
                              window.setTimeout(
                                () => setSelectedVersion(item),
                                0
                              );
                            }}
                          />
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                    <Button
                      size="xs"
                      variant="outline"
                      label="Suggest"
                      disabled={instructionLocked}
                      onClick={() => {
                        richTextAreaRef.current?.applyRandomSuggestions(
                          mockSuggestionChanges
                        );
                        setTimeout(checkForSuggestions, 100);
                      }}
                    />
                    <Button
                      size="xs"
                      variant="outline"
                      label="Add fake"
                      disabled={instructionLocked}
                      onClick={() => {
                        if (!mockInstructionCases.length) return;
                        const i = Math.floor(
                          Math.random() * mockInstructionCases.length
                        );
                        richTextAreaRef.current?.setContent(
                          mockInstructionCases[i]
                        );
                      }}
                    />
                    <Button
                      size="xs"
                      variant="outline"
                      label="Reset demo"
                      disabled={instructionLocked}
                      onClick={seedInstructionsDemo}
                    />
                    <div className="s-flex-1" />
                    {hasSuggestionsState ? (
                      <div className="s-ml-auto s-flex s-gap-2">
                        <Button
                          size="xs"
                          variant="outline"
                          icon={XMarkIcon}
                          label="Reject all"
                          tooltip="Reject all suggestions"
                          onClick={() => {
                            richTextAreaRef.current?.rejectAllSuggestions();
                            checkForSuggestions();
                          }}
                        />
                        <Button
                          size="xs"
                          icon={CheckIcon}
                          variant="highlight-secondary"
                          label="Accept all"
                          tooltip="Accept all suggestions"
                          onClick={() => {
                            richTextAreaRef.current?.acceptAllSuggestions();
                            checkForSuggestions();
                          }}
                        />
                      </div>
                    ) : null}
                  </div>
                }
              />
            </div>
          </section>

          <div className="s-space-y-3">
            <div className="s-flex s-items-center s-justify-between">
              <h3 className="s-heading-lg s-font-semibold s-text-foreground dark:s-text-foreground-night">
                Tools
              </h3>
            </div>
            <EmptyCTA
              message="No tools yet"
              action={
                <Button
                  type="button"
                  label="Add tools"
                  icon={ToolsIcon}
                  variant="outline"
                />
              }
              className="s-py-8"
            />
          </div>

          <div className="s-space-y-5">
            <h2 className="s-heading-lg s-text-foreground dark:s-text-foreground-night">
              Skill settings
            </h2>
            <div className="s-flex s-items-end s-gap-8">
              <div className="s-flex s-min-w-0 s-flex-1 s-flex-col s-gap-2">
                <div className="s-flex s-items-center s-gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={SparklesIcon}
                        tooltip="Suggest"
                      />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuLabel label="Suggestion" />
                      {nameSuggestions.map((s) => (
                        <DropdownMenuItem
                          key={s}
                          label={s}
                          onSelect={() => setSkillName(s)}
                        />
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Input
                    placeholder="Skill name"
                    containerClassName="s-flex-1"
                    value={skillName}
                    onChange={(e) => setSkillName(e.target.value)}
                  />
                </div>
              </div>
              <Avatar
                size="lg"
                name={skillName}
                emoji={agent?.emoji}
                backgroundColor={agent?.backgroundColor}
                isRounded={false}
                className="s-mb-2"
              />
            </div>
            <Input
              placeholder="User-facing description"
              value={userFacingDescription}
              onChange={(e) => setUserFacingDescription(e.target.value)}
            />
            <div className="s-flex s-flex-col s-space-y-3">
              <Label className="s-text-base s-font-semibold s-text-foreground dark:s-text-foreground-night">
                Editors
              </Label>
              <div className="s-mt-2 s-flex s-flex-row s-flex-wrap s-items-center s-gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  label="Manage"
                  icon={UserGroupIcon}
                  onClick={() => setIsInviteEditorsOpen(true)}
                />
                <span className="s-truncate s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
                  {editorNames.join(", ")}
                </span>
              </div>
            </div>
            <Collapsible defaultOpen>
              <CollapsibleTrigger variant="secondary">
                Advanced
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="s-pt-3">
                  <label className="s-flex s-items-center s-gap-2 s-text-sm">
                    <Checkbox checked={false} />
                    Offer this skill by default in new conversations
                  </label>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>
      </ScrollArea>

      <BarFooter
        variant="default"
        className="s-mx-4 s-justify-between"
        leftActions={
          <Button
            variant="outline"
            label="Cancel"
            onClick={handleCancel}
            type="button"
          />
        }
        rightActions={<Button variant="highlight" label="Save" type="button" />}
      />

      <Sheet open={isSpacesSheetOpen} onOpenChange={setIsSpacesSheetOpen}>
        <SheetContent size="md" side="right">
          <SheetHeader>
            <SheetTitle>Select spaces</SheetTitle>
            <SheetDescription>
              Choose the spaces you want the skill to have access to.
            </SheetDescription>
          </SheetHeader>
          <SheetContainer isListSelector>
            <ListGroup>
              {selectableSpaces.map((space) => {
                const selected = draftSpaceIds.has(space.id);
                const restricted = isRestrictedSpace(space.id);
                return (
                  <ListItem
                    key={space.id}
                    itemsAlignment="center"
                    onClick={() => toggleDraftSpace(space.id)}
                    className={
                      selected
                        ? "s-bg-primary-50 dark:s-bg-primary-50-night"
                        : ""
                    }
                  >
                    <Icon
                      visual={restricted ? LockIcon : ServerIcon}
                      size="sm"
                    />
                    <div className="s-flex s-min-w-0 s-flex-1 s-flex-col">
                      <span className="s-heading-sm s-truncate s-text-foreground dark:s-text-foreground-night">
                        {space.name}
                      </span>
                      <span className="s-truncate s-text-xs s-text-muted-foreground dark:s-text-muted-foreground-night">
                        {space.description}
                      </span>
                    </div>
                    <Checkbox
                      checked={selected}
                      onCheckedChange={(checked: boolean | "indeterminate") => {
                        if (checked !== "indeterminate")
                          toggleDraftSpace(space.id);
                      }}
                      onClick={(e: MouseEvent<HTMLButtonElement>) => {
                        e.stopPropagation();
                      }}
                    />
                  </ListItem>
                );
              })}
            </ListGroup>
          </SheetContainer>
          <SheetFooter
            leftButtonProps={{
              label: "Close",
              variant: "outline",
              onClick: () => setIsSpacesSheetOpen(false),
            }}
            rightButtonProps={{
              label: "Save",
              variant: "highlight",
              onClick: () => {
                setSelectedSpaceIds(new Set(draftSpaceIds));
                setIsSpacesSheetOpen(false);
              },
            }}
          />
        </SheetContent>
      </Sheet>

      <InviteUsersScreen
        isOpen={isInviteEditorsOpen}
        spaceId={null}
        title="Select editors"
        actionLabel="Save"
        initialSelectedUserIds={selectedEditorIdList}
        initialEditorUserIds={selectedEditorIdList}
        hasMultipleSelect={true}
        onClose={() => setIsInviteEditorsOpen(false)}
        onInvite={(_ids, editorUserIds) => {
          setSelectedEditorIds(new Set(editorUserIds));
          setIsInviteEditorsOpen(false);
        }}
      />

      <Sheet
        open={selectedVersion !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedVersion(null);
        }}
      >
        <SheetContent
          size="xl"
          side="right"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            (document.activeElement as HTMLElement)?.blur();
          }}
        >
          <SheetHeader>
            <SheetTitle>{selectedVersion?.date ?? "Version"}</SheetTitle>
            <SheetDescription>
              By:{" "}
              <span className="s-heading-ws">
                {selectedVersion?.author ?? "Unknown"}
              </span>
            </SheetDescription>
          </SheetHeader>
          <SheetContainer>
            <div className="s-flex s-flex-1 s-flex-col s-gap-3 s-overflow-auto">
              <div className="s-flex s-w-full s-justify-end">
                <Button
                  label="Restore this version"
                  icon={HistoryIcon}
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedVersion(null)}
                />
              </div>
              <RichTextArea
                readOnly
                defaultValue={versionDiffContent}
                className="s-min-h-[400px]"
              />
            </div>
          </SheetContainer>
        </SheetContent>
      </Sheet>
    </div>
  );
}
