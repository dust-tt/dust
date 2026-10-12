import {
  Avatar,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Edit04,
  Eye,
  EyeOff,
  Users01,
} from "@dust-tt/sparkle";
import { forwardRef, useEffect, useState } from "react";

import { mockUsers } from "../../data/users";
import { InviteUsersScreen } from "../InviteUsersScreen";
import {
  type BuilderSpace,
  getBuilderSpaceById,
  validateAgentName,
} from "./data";
import { InlineText } from "./InlineText";
import {
  type AgentAvatar,
  type AgentScope,
  AvatarPickerSheet,
} from "./AvatarPickerSheet";
import { TagsPicker } from "./TagsPicker";

// The identity block at the top of the builder: avatar, then the name and
// description edited in place (no input chrome), with the editors and
// publish controls on the right. `IdentityStickyBar` is its condensed twin,
// pinned to the top of the scroll area once the block has scrolled away.

type IdentityProps = {
  name: string;
  description: string;
  avatar: AgentAvatar;
  scope: AgentScope;
  onScopeChange: (scope: AgentScope) => void;
  canPublish: boolean;
  editorIds: string[];
  onManageEditors: () => void;
  tagIds: string[];
  onTagsChange: (ids: string[]) => void;
};

/** The editors pill: stacked portraits and a count, opening the editors sheet. */
function EditorsButton({
  editorIds,
  onClick,
}: {
  editorIds: string[];
  onClick: () => void;
}) {
  const editors = mockUsers.filter((user) => editorIds.includes(user.id));
  return (
    <Button
      size="sm"
      variant="outline"
      isRounded
      icon={
        editors.length > 0 ? (
          <span className="flex items-center -space-x-1.5">
            {editors.slice(0, 3).map((user) => (
              <Avatar
                key={user.id}
                size="xxs"
                name={user.fullName}
                visual={user.portrait}
                isRounded
                className="ring-2 ring-background"
              />
            ))}
          </span>
        ) : (
          Users01
        )
      }
      label={
        editors.length > 0
          ? `${editors.length} editor${editors.length === 1 ? "" : "s"}`
          : "Editors"
      }
      tooltip={editors.length > 0 ? "Manage editors" : "Add editors"}
      onClick={onClick}
    />
  );
}

/** Published / unpublished, as a select-style button. */
function PublishMenu({
  scope,
  onScopeChange,
  canPublish,
}: {
  scope: AgentScope;
  onScopeChange: (scope: AgentScope) => void;
  canPublish: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="outline"
          isSelect
          icon={scope === "visible" ? Eye : EyeOff}
          label={scope === "visible" ? "Published" : "Unpublished"}
          disabled={!canPublish}
          tooltip={
            canPublish
              ? undefined
              : "You don’t have permission to publish agents."
          }
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          icon={Eye}
          label="Published"
          description="Visible & usable by all members of the workspace."
          onSelect={() => onScopeChange("visible")}
        />
        <DropdownMenuItem
          icon={EyeOff}
          label="Unpublished"
          description="Visible & usable by editors only."
          onSelect={() => onScopeChange("hidden")}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const IdentityHeader = forwardRef<
  HTMLElement,
  IdentityProps & {
    onNameChange: (name: string) => void;
    onDescriptionChange: (description: string) => void;
    onAvatarChange: (avatar: AgentAvatar) => void;
    onEditorsChange: (ids: string[]) => void;
    isEditorsOpen: boolean;
    onEditorsOpenChange: (open: boolean) => void;
    selectedSpaceIds: string[];
  }
>(function IdentityHeader(
  {
    name,
    onNameChange,
    description,
    onDescriptionChange,
    avatar,
    onAvatarChange,
    scope,
    onScopeChange,
    canPublish,
    editorIds,
    onEditorsChange,
    onManageEditors,
    isEditorsOpen,
    onEditorsOpenChange,
    tagIds,
    onTagsChange,
    selectedSpaceIds,
  },
  ref
) {
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [isNameTouched, setIsNameTouched] = useState(false);
  const nameError = isNameTouched ? validateAgentName(name) : null;
  const restrictedSpaces = selectedSpaceIds
    .map((id) => getBuilderSpaceById(id))
    .filter((space): space is BuilderSpace => Boolean(space?.isRestricted));
  const who = scope === "visible" ? "All members" : "Only editors";
  const accessCaption =
    restrictedSpaces.length === 0
      ? `${who} can use this agent.`
      : `${who} with access to ${restrictedSpaces.map((space) => space.name).join(", ")} can use this agent.`;

  return (
    <header ref={ref} className="flex items-start justify-between gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="relative w-fit">
          <Avatar
            size="xl"
            name={name || "Agent"}
            emoji={avatar.emoji}
            backgroundColor={avatar.backgroundColor}
            className="border-0"
          />
          <Button
            size="xs"
            variant="outline"
            isRounded
            icon={Edit04}
            className="absolute -bottom-1.5 -right-1.5 shadow-sm ring-2 ring-background"
            tooltip="Change avatar"
            onClick={() => setIsAvatarPickerOpen(true)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <InlineText
            value={name}
            placeholder="Name your agent"
            onChange={onNameChange}
            onBlur={() => setIsNameTouched(true)}
            invalid={nameError !== null}
            ariaLabel="Agent name"
            className="heading-2xl text-foreground"
            placeholderClassName="text-muted-foreground"
          />
          {nameError ? (
            <span className="text-xs text-foreground-warning">{nameError}</span>
          ) : null}
          <InlineText
            value={description}
            placeholder="Add a short description"
            onChange={onDescriptionChange}
            ariaLabel="Agent description"
            className="text-base text-foreground"
            placeholderClassName="text-muted-foreground"
            singleLine={false}
          />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <EditorsButton editorIds={editorIds} onClick={onManageEditors} />
          <TagsPicker
            tagIds={tagIds}
            onTagsChange={onTagsChange}
            canPublish={canPublish}
          />
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <PublishMenu
          scope={scope}
          onScopeChange={onScopeChange}
          canPublish={canPublish}
        />
        <span className="max-w-xs text-right text-xs text-muted-foreground">
          {accessCaption}
        </span>
      </div>

      <AvatarPickerSheet
        open={isAvatarPickerOpen}
        onOpenChange={setIsAvatarPickerOpen}
        avatar={avatar}
        name={name}
        onSave={onAvatarChange}
      />
      <InviteUsersScreen
        isOpen={isEditorsOpen}
        spaceId={null}
        title="Manage Editors"
        actionLabel="Save"
        initialSelectedUserIds={editorIds}
        initialEditorUserIds={editorIds}
        hasMultipleSelect
        onClose={() => onEditorsOpenChange(false)}
        onInvite={(_selected, editors) => {
          if (editors.length > 0) {
            onEditorsChange(editors);
          }
          onEditorsOpenChange(false);
        }}
      />
    </header>
  );
});

/**
 * Tracks whether `target` has scrolled fully out of `root` (or the viewport).
 * Starts false so the sticky bar never flashes on first paint.
 */
export function useIsScrolledAway(
  target: HTMLElement | null,
  root: HTMLElement | null,
  /** Height of chrome floating over the top of `root`, in px. */
  topInset = 0
) {
  const [isScrolledAway, setIsScrolledAway] = useState(false);
  useEffect(() => {
    if (!target) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setIsScrolledAway(!entry.isIntersecting),
      { root, threshold: 0, rootMargin: `-${topInset}px 0px 0px 0px` }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [target, root, topInset]);
  return isScrolledAway;
}

/**
 * The condensed identity row, pinned to the top of the scroll area while the
 * full header is out of view: small avatar, name and description (click to
 * jump back up and edit), then the same editors, tags and publish controls.
 * It lines up with the panel header's close button and title, not the form
 * column, so it reads as part of the chrome.
 * Rendered only while condensed so its controls never sit hidden in the tab
 * order; it fades in from the edge and leaves instantly.
 */
export function IdentityStickyBar({
  name,
  description,
  avatar,
  scope,
  onScopeChange,
  canPublish,
  editorIds,
  onManageEditors,
  tagIds,
  onTagsChange,
  onReveal,
}: IdentityProps & {
  /** Scrolls the full header back into view. */
  onReveal: () => void;
}) {
  return (
    <div className="sticky top-0 z-10 h-0">
      <div className="absolute inset-x-0 top-0 border-b border-border bg-background transition-[opacity,translate] duration-150 ease-out starting:-translate-y-2 starting:opacity-0 motion-reduce:transition-none">
        {/* Aligned to the panel header above it (its mx-4 plus the Bar's own
            px-4 put the close button at 32px), not the form column. */}
        <div className="flex w-full items-center gap-3 px-8 py-2">
          <button
            type="button"
            onClick={onReveal}
            aria-label="Edit name and description"
            className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left transition-colors hover:bg-muted-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            <Avatar
              size="sm"
              name={name || "Agent"}
              emoji={avatar.emoji}
              backgroundColor={avatar.backgroundColor}
              className="border-0"
            />
            <span className="flex min-w-0 flex-col">
              <span className="heading-sm truncate text-foreground">
                {name || "Name your agent"}
              </span>
              {description ? (
                <span className="truncate text-xs text-muted-foreground">
                  {description}
                </span>
              ) : null}
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-2">
            <EditorsButton editorIds={editorIds} onClick={onManageEditors} />
            <TagsPicker
              tagIds={tagIds}
              onTagsChange={onTagsChange}
              canPublish={canPublish}
            />
            <PublishMenu
              scope={scope}
              onScopeChange={onScopeChange}
              canPublish={canPublish}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
