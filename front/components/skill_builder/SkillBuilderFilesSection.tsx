import {
  FileExplorerItem,
  FileExplorerViewToggle,
  fileExplorerCardGridClasses,
  type ViewMode,
} from "@app/components/assistant/conversation/files_panel/FileExplorerItem";
import { getSingularFileCategoryLabelForContentType } from "@app/components/assistant/conversation/files_panel/utils";
import {
  FilePreviewDialog,
  needsFilePreviewTextContent,
} from "@app/components/files/FilePreviewDialog";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { useSkillVersionComparisonContext } from "@app/components/skill_builder/SkillBuilderVersionContext";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { useSendNotification } from "@app/hooks/useNotification";
import { getFileTypeIcon } from "@app/lib/file_icon_utils";
import {
  getFileDownloadUrl,
  getSkillFileContentUrl,
  useSkillFileContent,
} from "@app/lib/swr/files";
import {
  ArrowGoBackIcon,
  Button,
  CardGrid,
  EmptyCTA,
  PlusIcon,
  ScrollArea,
  Spinner,
} from "@dust-tt/sparkle";
import { useCallback, useMemo, useRef, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

type SkillBuilderFileAttachment =
  SkillBuilderFormData["fileAttachments"][number];

export function SkillBuilderFilesSection() {
  const { owner, skillId } = useSkillBuilderContext();
  const sendNotification = useSendNotification();
  const { setValue } = useFormContext<SkillBuilderFormData>();
  const { compareVersion, isDiffMode } = useSkillVersionComparisonContext();
  const [previewFileAttachment, setPreviewFileAttachment] =
    useState<SkillBuilderFileAttachment | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const { fields, append, remove } = useFieldArray<
    SkillBuilderFormData,
    "fileAttachments"
  >({
    name: "fileAttachments",
  });
  const hasFileAttachments = fields.length > 0;

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { handleFilesUpload, isProcessingFiles } = useFileUploaderService({
    hasSandboxTools: false,
    owner,
    useCase: "skill_attachment",
    useCaseMetadata: skillId ? { skillId } : undefined,
  });

  const existingFileNames = useMemo(
    () => new Set(fields.map((f) => f.fileName)),
    [fields]
  );

  const sortedFields = useMemo(
    () =>
      fields
        .map((field, index) => ({ field, originalIndex: index }))
        .sort((a, b) => a.field.fileName.localeCompare(b.field.fileName)),
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
    setPreviewFileAttachment(null);
  };

  const onUploadClick = () => {
    fileInputRef.current?.click();
  };

  const canPreviewFiles = !!skillId;
  const isPreviewOpen = canPreviewFiles && previewFileAttachment !== null;

  const { fileContent, isFileContentLoading, fileContentError } =
    useSkillFileContent({
      fileId: previewFileAttachment?.fileId ?? null,
      owner,
      skillId,
      disabled:
        !isPreviewOpen ||
        !skillId ||
        !needsFilePreviewTextContent(previewFileAttachment?.contentType ?? ""),
    });

  const openPreviewDialog = (fileAttachment: SkillBuilderFileAttachment) => {
    if (!canPreviewFiles) {
      return;
    }

    setPreviewFileAttachment(fileAttachment);
  };

  const previewIndex = previewFileAttachment
    ? sortedFields.findIndex(
        ({ field }) => field.fileId === previewFileAttachment.fileId
      )
    : -1;

  const handlePreviewPrev =
    previewIndex > 0
      ? () =>
          setPreviewFileAttachment(
            sortedFields[previewIndex - 1]?.field ?? null
          )
      : undefined;
  const handlePreviewNext =
    previewIndex >= 0 && previewIndex < sortedFields.length - 1
      ? () =>
          setPreviewFileAttachment(
            sortedFields[previewIndex + 1]?.field ?? null
          )
      : undefined;

  const downloadFile = async (fileAttachment: SkillBuilderFileAttachment) => {
    window.open(getFileDownloadUrl(owner, fileAttachment.fileId), "_blank");
  };

  const removeFile = async ({
    fileAttachment,
    originalIndex,
  }: {
    fileAttachment: SkillBuilderFileAttachment;
    originalIndex: number;
  }) => {
    remove(originalIndex);
    if (previewFileAttachment?.fileId === fileAttachment.fileId) {
      setPreviewFileAttachment(null);
    }
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
                contentType: blob.contentType,
                fileId: blob.fileId,
                fileName: blob.filename,
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

  const headerActions = (
    <>
      {hasFileAttachments && (
        <FileExplorerViewToggle value={viewMode} onValueChange={setViewMode} />
      )}
      {!isDiffMode && hasFileAttachments && (
        <Button
          type="button"
          onClick={onUploadClick}
          label="Upload files"
          icon={isProcessingFiles ? Spinner : PlusIcon}
          variant="outline"
          disabled={isProcessingFiles}
        />
      )}
    </>
  );

  const fileItems = sortedFields.map(({ field, originalIndex }) => {
    const isAdded = isDiffMode && !compareFileIds.has(field.fileId);
    const FileIcon = getFileTypeIcon(field.contentType, field.fileName);

    return (
      <FileExplorerItem
        key={field.id}
        kind="icon"
        visual={FileIcon}
        viewMode={viewMode}
        title={field.fileName}
        isAdded={isAdded}
        subtitle={getSingularFileCategoryLabelForContentType(field.contentType)}
        onOpen={canPreviewFiles ? () => openPreviewDialog(field) : undefined}
        onDownload={() => downloadFile(field)}
        onRemove={
          !isDiffMode
            ? () => removeFile({ fileAttachment: field, originalIndex })
            : undefined
        }
      />
    );
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="heading-lg font-semibold text-foreground dark:text-foreground-night">
            Files
          </h3>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Add files that will be available to the skill at runtime. Templates,
            schemas, scripts, or reference materials.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filesDiffer && (
            <Button
              variant="outline"
              size="sm"
              icon={ArrowGoBackIcon}
              onClick={restoreFiles}
              label="Restore files"
            />
          )}
          {headerActions}
        </div>
      </div>

      {!isDiffMode && (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={onFileInputChange}
        />
      )}

      {!hasFileAttachments ? (
        isDiffMode ? null : isProcessingFiles ? (
          <div className="flex h-40 w-full items-center justify-center">
            <Spinner />
          </div>
        ) : (
          <EmptyCTA
            action={
              <Button
                type="button"
                onClick={onUploadClick}
                label="Upload files"
                icon={PlusIcon}
                variant="outline"
                disabled={isProcessingFiles}
              />
            }
            className="py-8"
          />
        )
      ) : (
        <ScrollArea className="max-h-64">
          {viewMode === "list" ? (
            <div className="flex flex-col gap-0.5">{fileItems}</div>
          ) : (
            <CardGrid gridClassName={fileExplorerCardGridClasses}>
              {fileItems}
            </CardGrid>
          )}
        </ScrollArea>
      )}
      <FilePreviewDialog
        file={
          previewFileAttachment && skillId
            ? {
                content: fileContent,
                contentError: fileContentError,
                contentType: previewFileAttachment.contentType,
                fileName: previewFileAttachment.fileName,
                isContentLoading: isFileContentLoading,
                viewUrl: getSkillFileContentUrl(
                  owner,
                  skillId,
                  previewFileAttachment.fileId
                ),
              }
            : null
        }
        isOpen={isPreviewOpen}
        onDownload={async () => {
          if (previewFileAttachment) {
            await downloadFile(previewFileAttachment);
          }
        }}
        onPrev={handlePreviewPrev}
        onNext={handlePreviewNext}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewFileAttachment(null);
          }
        }}
      />
    </div>
  );
}
