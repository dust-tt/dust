import { FilesTab } from "@app/components/assistant/conversation/files_panel/FilesTab";
import type { FilePanelRow } from "@app/components/assistant/conversation/files_panel/types";
import {
  getCategoryFromContentType,
  getSingularFileCategoryLabelForContentType,
} from "@app/components/assistant/conversation/files_panel/utils";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { useSkillVersionComparisonContext } from "@app/components/skill_builder/SkillBuilderVersionContext";
import { FilePreviewSheet } from "@app/components/spaces/FilePreviewSheet";
import { AppLayoutTitle } from "@app/components/sparkle/AppLayoutTitle";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { useSendNotification } from "@app/hooks/useNotification";
import { getFileViewUrl } from "@app/lib/swr/files";
import { DEFAULT_FILE_CONTENT_TYPE } from "@app/types/files";
import {
  ArrowGoBackIcon,
  Button,
  FolderOpenIcon,
  Icon,
  PlusIcon,
  Spinner,
  XMarkIcon,
} from "@dust-tt/sparkle";
import type React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

type SkillFileAttachment = SkillBuilderFormData["fileAttachments"][number];

interface SkillBuilderFilesPanelProps {
  onClose: () => void;
}

export function SkillBuilderFilesPanel({
  onClose,
}: SkillBuilderFilesPanelProps) {
  const { owner, skillId } = useSkillBuilderContext();
  const sendNotification = useSendNotification();
  const { setValue } = useFormContext<SkillBuilderFormData>();
  const { compareVersion, isDiffMode } = useSkillVersionComparisonContext();
  const [previewFile, setPreviewFile] = useState<SkillFileAttachment | null>(
    null
  );
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const { fields, append, remove } = useFieldArray<
    SkillBuilderFormData,
    "fileAttachments"
  >({
    name: "fileAttachments",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { handleFilesUpload, isProcessingFiles } = useFileUploaderService({
    owner,
    useCase: "skill_attachment",
    useCaseMetadata: skillId ? { skillId } : undefined,
  });

  const existingFileNames = useMemo(
    () => new Set(fields.map((f) => f.fileName)),
    [fields]
  );

  const currentFileIds = useMemo(
    () => new Set(fields.map((f) => f.fileId)),
    [fields]
  );

  const compareFileIds = useMemo(
    () =>
      compareVersion
        ? new Set(compareVersion.fileAttachments.map((f) => f.fileId))
        : new Set<string>(),
    [compareVersion]
  );

  const filesDiffer =
    isDiffMode &&
    (currentFileIds.size !== compareFileIds.size ||
      [...currentFileIds].some((id) => !compareFileIds.has(id)));

  const restoreFiles = () => {
    if (!compareVersion) {
      return;
    }
    setValue("fileAttachments", compareVersion.fileAttachments, {
      shouldDirty: true,
    });
  };

  const onUploadClick = () => {
    fileInputRef.current?.click();
  };

  const onFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) {
        return;
      }

      const allFiles = Array.from(files);
      const newFiles = allFiles.filter((f) => !existingFileNames.has(f.name));
      const duplicates = allFiles.filter((f) => existingFileNames.has(f.name));

      if (duplicates.length > 0) {
        sendNotification({
          type: "error",
          title: "Duplicate files skipped.",
          description: `Already attached: ${duplicates.map((f) => f.name).join(", ")}`,
        });
      }

      if (newFiles.length > 0) {
        const uploaded = await handleFilesUpload(newFiles);
        if (uploaded) {
          for (const blob of uploaded) {
            if (blob.fileId) {
              append({
                fileId: blob.fileId,
                fileName: blob.filename,
                contentType: blob.contentType,
              });
            }
          }
        }
      }

      // Reset input so re-uploading the same file triggers onChange.
      e.target.value = "";
    },
    [handleFilesUpload, append, existingFileNames, sendNotification]
  );

  const openPreview = useCallback((file: SkillFileAttachment) => {
    setPreviewFile(file);
    setIsPreviewOpen(true);
  }, []);

  return (
    <>
      <div className="flex h-full flex-col">
        <AppLayoutTitle>
          <div className="flex h-full items-center justify-between">
            <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
              Files
            </span>
            <div className="flex items-center gap-2">
              {filesDiffer && (
                <Button
                  variant="outline"
                  size="sm"
                  icon={ArrowGoBackIcon}
                  onClick={restoreFiles}
                  label="Restore"
                />
              )}
              {!isDiffMode && (
                <Button
                  type="button"
                  onClick={onUploadClick}
                  label="Upload"
                  icon={isProcessingFiles ? Spinner : PlusIcon}
                  variant="outline"
                  size="sm"
                  disabled={isProcessingFiles}
                />
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                icon={XMarkIcon}
              />
            </div>
          </div>
        </AppLayoutTitle>

        {!isDiffMode && (
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={onFileInputChange}
          />
        )}

        <SkillBuilderFilesPanelContent
          compareFileIds={compareFileIds}
          fields={fields}
          isDiffMode={isDiffMode}
          isProcessingFiles={isProcessingFiles}
          onRemove={remove}
          onUploadClick={onUploadClick}
          onOpenPreview={openPreview}
        />
      </div>

      <FilePreviewSheet
        owner={owner}
        file={
          previewFile
            ? {
                sId: previewFile.fileId,
                fileName: previewFile.fileName,
                contentType:
                  previewFile.contentType ?? DEFAULT_FILE_CONTENT_TYPE,
              }
            : null
        }
        isOpen={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
      />
    </>
  );
}

interface SkillBuilderFilesPanelContentProps {
  compareFileIds: Set<string>;
  fields: (SkillFileAttachment & { id: string })[];
  isDiffMode: boolean;
  isProcessingFiles: boolean;
  onRemove: (index: number) => void;
  onOpenPreview: (file: SkillFileAttachment) => void;
  onUploadClick: () => void;
}

function SkillBuilderFilesPanelContent({
  compareFileIds,
  fields,
  isDiffMode,
  isProcessingFiles,
  onRemove,
  onOpenPreview,
  onUploadClick,
}: SkillBuilderFilesPanelContentProps) {
  const { owner } = useSkillBuilderContext();

  const rows = useMemo<FilePanelRow[]>(
    () =>
      fields
        .map((field, originalIndex) => {
          const contentType = field.contentType ?? DEFAULT_FILE_CONTENT_TYPE;
          const isAdded = isDiffMode && !compareFileIds.has(field.fileId);
          return {
            id: field.id,
            title: field.fileName,
            fileId: field.fileId,
            contentType,
            category: getCategoryFromContentType(contentType),
            creator: null,
            date: null,
            isHighlighted: isAdded,
            isInProjectContext: false,
            onClick: () => onOpenPreview(field),
            subtitle: isAdded
              ? "Added in this version"
              : getSingularFileCategoryLabelForContentType(contentType),
            thumbnailUrl: getFileViewUrl(owner, field.fileId),
            action: !isDiffMode ? (
              <Button
                type="button"
                variant="ghost"
                icon={XMarkIcon}
                size="xs"
                onClick={(e: React.MouseEvent) => {
                  e.stopPropagation();
                  onRemove(originalIndex);
                }}
              />
            ) : undefined,
          };
        })
        .sort((a, b) => a.title.localeCompare(b.title)),
    [fields, isDiffMode, compareFileIds, owner, onOpenPreview, onRemove]
  );

  const emptyContent = isDiffMode ? (
    <div className="p-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
      No files in this version.
    </div>
  ) : (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
      <Icon
        visual={FolderOpenIcon}
        size="lg"
        className="text-muted-foreground dark:text-muted-foreground-night"
      />
      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        No files yet
      </div>
      <Button
        type="button"
        onClick={onUploadClick}
        label="Upload files"
        icon={PlusIcon}
        variant="outline"
        disabled={isProcessingFiles}
      />
    </div>
  );

  return (
    <FilesTab
      emptyContent={emptyContent}
      isLoading={isProcessingFiles && fields.length === 0}
      owner={owner}
      rows={rows}
      searchInputName="skill-file-search"
    />
  );
}
