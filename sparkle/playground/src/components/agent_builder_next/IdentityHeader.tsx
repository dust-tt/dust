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
import { useState } from "react";

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
// publish controls on the right.

export function IdentityHeader({
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
  tagIds,
  onTagsChange,
  selectedSpaceIds,
}: {
  name: string;
  onNameChange: (name: string) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  avatar: AgentAvatar;
  onAvatarChange: (avatar: AgentAvatar) => void;
  scope: AgentScope;
  onScopeChange: (scope: AgentScope) => void;
  canPublish: boolean;
  editorIds: string[];
  onEditorsChange: (ids: string[]) => void;
  tagIds: string[];
  onTagsChange: (ids: string[]) => void;
  selectedSpaceIds: string[];
}) {
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [isEditorsOpen, setIsEditorsOpen] = useState(false);
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
  const editors = mockUsers.filter((user) => editorIds.includes(user.id));

  return (
    <header className="flex items-start justify-between gap-6">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="group relative w-fit">
          <Avatar
            size="xl"
            name={name || "Agent"}
            emoji={avatar.emoji}
            backgroundColor={avatar.backgroundColor}
            className="border-0"
          />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
            <Button
              size="sm"
              variant="outline"
              icon={Edit04}
              className="h-10 w-10"
              tooltip="Change avatar"
              onClick={() => setIsAvatarPickerOpen(true)}
            />
          </div>
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
            onClick={() => setIsEditorsOpen(true)}
          />
          <TagsPicker
            tagIds={tagIds}
            onTagsChange={onTagsChange}
            canPublish={canPublish}
          />
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-2">
        <div className="flex items-center gap-2">
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
        </div>
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
        onClose={() => setIsEditorsOpen(false)}
        onInvite={(_selected, editors) => {
          if (editors.length > 0) {
            onEditorsChange(editors);
          }
          setIsEditorsOpen(false);
        }}
      />
    </header>
  );
}
