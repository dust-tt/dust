import {
  Button,
  Checkbox,
  Chip,
  ContentMessage,
  Icon,
  ListGroup,
  ListItem,
  ListItemSection,
  Lock01,
  Planet,
  SearchInput,
  Server03,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SpaceClosed,
} from "@dust-tt/sparkle";
import { useEffect, useMemo, useState } from "react";

import { type BuilderSpace, mockBuilderSpaces } from "./data";
import { ConfirmDialog } from "./dialogs";
import { BuilderSection, FieldGroup, FieldRow } from "./SectionContainer";

function spaceIcon(space: BuilderSpace) {
  if (space.kind === "pod") {
    return SpaceClosed;
  }
  return space.isRestricted ? Lock01 : Server03;
}

export function SpaceSelectionSheet({
  open,
  onOpenChange,
  selectedIds,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  onSave: (ids: string[]) => void;
}) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selectedIds));
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (open) {
      setDraft(new Set(selectedIds));
      setSearch("");
    }
  }, [open, selectedIds]);

  const needle = search.trim().toLowerCase();
  const matches = (space: BuilderSpace) =>
    !needle ||
    space.name.toLowerCase().includes(needle) ||
    space.description.toLowerCase().includes(needle);
  const spaces = mockBuilderSpaces.filter(
    (space) => space.kind === "space" && matches(space)
  );
  const pods = mockBuilderSpaces.filter(
    (space) => space.kind === "pod" && matches(space)
  );

  const toggle = (id: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const renderRow = (space: BuilderSpace) => {
    const isSelected = draft.has(space.id);
    const isDisabled =
      Boolean(space.isUsedElsewhere) || Boolean(space.isGlobal);
    return (
      <ListItem
        key={space.id}
        itemsAlignment="center"
        onClick={isDisabled ? undefined : () => toggle(space.id)}
        className={isDisabled ? "opacity-60" : undefined}
      >
        <Icon visual={spaceIcon(space)} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="heading-sm truncate text-foreground">
            {space.name}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {space.description}
          </span>
        </div>
        <Checkbox
          checked={isSelected}
          disabled={isDisabled}
          tooltip={
            space.isUsedElsewhere ? "Used by other resources" : undefined
          }
          onCheckedChange={() => toggle(space.id)}
          onClick={(event) => event.stopPropagation()}
        />
      </ListItem>
    );
  };

  const isEmpty = spaces.length === 0 && pods.length === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="lg" side="right">
        <SheetHeader>
          <SheetTitle>Data and access</SheetTitle>
          <SheetDescription>
            Adding spaces or pods will make the data from each of them available
            to the agent.
          </SheetDescription>
          <div className="pt-3">
            <SearchInput
              name="space-search"
              placeholder="Search spaces and Pods"
              value={search}
              onChange={setSearch}
            />
          </div>
        </SheetHeader>
        <SheetContainer isListSelector>
          {isEmpty ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {needle
                ? `No spaces or Pods match “${search.trim()}”. Try another name.`
                : "No spaces or Pods yet. Ask an admin to create one."}
            </div>
          ) : (
            <div className="flex flex-col">
              {spaces.length > 0 ? (
                <>
                  <ListItemSection size="sm">Spaces</ListItemSection>
                  <ListGroup>{spaces.map(renderRow)}</ListGroup>
                </>
              ) : null}
              {pods.length > 0 ? (
                <>
                  <ListItemSection size="sm">Pods</ListItemSection>
                  <ListGroup>{pods.map(renderRow)}</ListGroup>
                </>
              ) : null}
            </div>
          )}
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: () => onOpenChange(false),
          }}
          rightButtonProps={{
            label: "Save",
            variant: "primary",
            onClick: () => {
              onSave(Array.from(draft));
              onOpenChange(false);
            },
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

export function DataAccessSection({
  selectedSpaceIds,
  onChange,
  /** Names of knowledge or tools attached through each space, for the remove confirm. */
  getDependents,
}: {
  selectedSpaceIds: string[];
  onChange: (ids: string[]) => void;
  getDependents: (spaceId: string) => string[];
}) {
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [spaceToRemove, setSpaceToRemove] = useState<BuilderSpace | null>(null);
  // The last chip removed, so a slip can be undone until the next change.
  const [lastRemoved, setLastRemoved] = useState<BuilderSpace | null>(null);

  const selected = useMemo(
    () =>
      selectedSpaceIds
        .map((id) => mockBuilderSpaces.find((space) => space.id === id))
        .filter((space): space is BuilderSpace => Boolean(space)),
    [selectedSpaceIds]
  );

  const removeSpace = (id: string) => {
    setLastRemoved(mockBuilderSpaces.find((space) => space.id === id) ?? null);
    onChange(selectedSpaceIds.filter((candidate) => candidate !== id));
  };
  const restricted = selected.filter((space) => space.isRestricted);
  const audience =
    restricted.length === 0
      ? "All workspace members"
      : `Members of ${restricted.map((space) => space.name).join(", ")} only`;

  const dependents = spaceToRemove ? getDependents(spaceToRemove.id) : [];
  const hasKnowledgeReference = dependents.some((name) =>
    name.startsWith("Knowledge:")
  );

  return (
    <BuilderSection
      title="Data and access"
      collapsible
      defaultOpen={selected.length > 1}
      summary={
        selected.length === 0
          ? "None"
          : `${
              selected.length === 1
                ? selected[0].name
                : `${selected[0].name} +${selected.length - 1}`
            } · ${restricted.length === 0 ? "all members" : "members only"}`
      }
      description="Spaces and Pods your agent can read."
    >
      <FieldGroup>
        <FieldRow
          label="Spaces and Pods"
          hint="Pods are team workspaces. Spaces hold shared data."
        >
          {selected.map((space) => (
            <Chip
              key={space.id}
              size="xs"
              icon={spaceIcon(space)}
              color={space.isRestricted ? "info" : "primary"}
              label={space.name}
              onRemove={
                space.isGlobal
                  ? undefined
                  : () => {
                      if (getDependents(space.id).length > 0) {
                        setSpaceToRemove(space);
                      } else {
                        removeSpace(space.id);
                      }
                    }
              }
            />
          ))}
          {lastRemoved ? (
            <Button
              size="sm"
              variant="ghost"
              label={`Undo remove ${lastRemoved.name}`}
              onClick={() => {
                onChange([...selectedSpaceIds, lastRemoved.id]);
                setLastRemoved(null);
              }}
            />
          ) : null}
          <Button
            size="sm"
            variant="outline"
            icon={Planet}
            label="Manage"
            onClick={() => setIsSheetOpen(true)}
          />
        </FieldRow>
        <FieldRow
          label="Who can use the agent"
          hint={
            restricted.length === 0
              ? "No restricted space selected."
              : "A restricted space limits the agent to its members."
          }
        >
          <span className="text-sm text-foreground">{audience}</span>
        </FieldRow>
      </FieldGroup>
      {restricted.length > 0 ? (
        <ContentMessage variant="warning" size="sm" icon={Lock01}>
          Only members of {restricted.map((space) => space.name).join(", ")} can
          use this agent. Remove the restricted space to open it to the whole
          workspace.
        </ContentMessage>
      ) : null}
      <SpaceSelectionSheet
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        selectedIds={selectedSpaceIds}
        onSave={(ids) => {
          setLastRemoved(null);
          onChange(ids);
        }}
      />
      <ConfirmDialog
        open={spaceToRemove !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSpaceToRemove(null);
          }
        }}
        title={
          spaceToRemove
            ? `Remove ${spaceToRemove.name} ${spaceToRemove.kind === "pod" ? "Pod" : "space"}`
            : ""
        }
        confirmLabel="Remove"
        confirmVariant="warning"
        confirmDisabled={hasKnowledgeReference}
        onConfirm={() => {
          if (spaceToRemove) {
            removeSpace(spaceToRemove.id);
          }
        }}
      >
        <div className="flex flex-col gap-2">
          <span>This will remove the following elements from the agent:</span>
          <ul className="list-disc pl-5">
            {dependents.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          {hasKnowledgeReference ? (
            <span className="text-foreground-warning">
              To remove this space, first update your instructions so they no
              longer reference its knowledge.
            </span>
          ) : null}
        </div>
      </ConfirmDialog>
    </BuilderSection>
  );
}
