import { Button, Spinner, XMarkIcon } from "@dust-tt/sparkle";
import React from "react";

import { useFileMetadata } from "@app/lib/swr/files";
import type {
  ConversationType,
  LightWorkspaceType,
  UserType,
} from "@app/types";
import {
  clientExecutableContentType,
  isInteractiveContentType,
} from "@app/types";

import { ClientExecutableRenderer } from "./ClientExecutableRenderer";
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
  const { fileMetadata, isFileMetadataLoading, isFileMetadataError } =
    useFileMetadata({
      fileId: contentId,
      owner,
    });

  if (!isOpen || !contentId) {
    return null;
  }

  const renderContent = () => {
    if (isFileMetadataLoading) {
      return (
        <div className="flex items-center justify-center p-8">
          <Spinner size="sm" />
          <span className="ml-2">Loading file...</span>
        </div>
      );
    }

    if (isFileMetadataError || !fileMetadata) {
      return (
        <div className="p-4 text-red-600">
          <p>Error loading file metadata</p>
        </div>
      );
    }

    if (!isInteractiveContentType(fileMetadata.contentType)) {
      return (
        <div className="p-4">
          <p>File Type is not interactive</p>
        </div>
      );
    }

    // FIXME: Use a switch statement instead of an if statement.
    if (fileMetadata.contentType === clientExecutableContentType) {
      return <ClientExecutableRenderer fileId={contentId} owner={owner} />;
    }

    // Default fallback for other file types
    return (
      <div className="p-4">
        <div className="bg-structure-50 text-element-700 rounded border p-4 text-center">
          <p className="text-sm">File Type: {fileMetadata.contentType}</p>
          <p className="mt-2 text-xs">
            Renderer not implemented for this file type
          </p>
          <p className="mt-1 text-xs">File: {fileMetadata.fileName}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full w-full flex-col">
      {/* Header */}
      <div className="border-structure-200 bg-structure-50 flex items-center justify-between border-b px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="text-element-900 text-sm font-medium">
            {fileMetadata?.fileName || "Content Drawer"}
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

      {/* Content */}
      <div className="flex-1 overflow-hidden">{renderContent()}</div>
    </div>
  );
}
