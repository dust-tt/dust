import { Button, XMarkIcon } from "@dust-tt/sparkle";
import React from "react";

import type {
  ConversationType,
  LightWorkspaceType,
  UserType,
} from "@app/types";

import { useContentContext } from "./ContentContext";

interface ContentContainerProps {
  conversation: ConversationType | null;
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
  user: UserType;
}

export function ContentContainer({
  conversation,
  isOpen,
  onClose,
  owner,
  user,
}: ContentContainerProps) {
  const { contentId } = useContentContext();

  if (!isOpen || !contentId) {
    return null;
  }

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="border-structure-200 bg-structure-50 flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-element-900 text-sm font-medium">
            Content Drawer
          </span>
          {contentId && (
            <span className="text-element-700 text-xs">{contentId}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          icon={XMarkIcon}
          className="text-element-600 hover:text-element-900"
        />
      </div>

      {/* Content - Skeleton */}
      <div className="bg-structure-50 flex-1 overflow-hidden p-4">
        <div className="text-element-700 text-center">
          <p className="text-sm">Content Drawer Skeleton</p>
          <p className="mt-2 text-xs">File ID: {contentId}</p>
        </div>
      </div>
    </div>
  );
}
