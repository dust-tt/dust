import type {
  PendingSkillBuilderFileAttachment,
  SkillBuilderFormData,
} from "@app/components/skill_builder/SkillBuilderFormContext";
import { useSkillVersionComparisonContext } from "@app/components/skill_builder/SkillBuilderVersionContext";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  contentTypeFromFileName,
  DEFAULT_FILE_CONTENT_TYPE,
  type FileFormatCategory,
  fileSizeToHumanReadable,
  getFileFormatCategory,
  isSupportedFileContentType,
  resolveFileContentType,
  resolveMaxFileSizes,
} from "@app/types/files";
import {
  ArrowGoBackIcon,
  Button,
  ContextItem,
  cn,
  DocumentIcon,
  EmptyCTA,
  PlusIcon,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

const SKILL_ATTACHMENT_FILE_UPLOAD_OPTIONS = {
  hasSandboxTools: false,
  useCase: "skill_attachment",
} as const;

const SKILL_ATTACHMENT_MAX_FILE_SIZES = resolveMaxFileSizes(
  SKILL_ATTACHMENT_FILE_UPLOAD_OPTIONS
);

function resolveSkillAttachmentContentType(file: File): string {
  const resolvedContentType = resolveFileContentType(file.type, file.name);
  if (isSupportedFileContentType(resolvedContentType)) {
    return resolvedContentType;
  }

  return (
    contentTypeFromFileName(file.name) ??
    (resolvedContentType || DEFAULT_FILE_CONTENT_TYPE)
  );
}

function getSkillAttachmentSizeLimitError({
  contentType,
  file,
}: {
  contentType: string;
  file: File;
}): { category: FileFormatCategory; maxFileSize: number } | null {
  const category = getFileFormatCategory(contentType) ?? "data";
  const maxFileSize = SKILL_ATTACHMENT_MAX_FILE_SIZES[category];

  if (file.size <= maxFileSize) {
    return null;
  }

  return { category, maxFileSize };
}

export function SkillBuilderFilesSection() {
  const sendNotification = useSendNotification();
  const { setValue } = useFormContext<SkillBuilderFormData>();
  const { compareVersion, isDiffMode } = useSkillVersionComparisonContext();
  const [canScrollFilesDown, setCanScrollFilesDown] = useState(false);

  const { fields, append, remove } = useFieldArray<
    SkillBuilderFormData,
    "fileAttachments"
  >({
    name: "fileAttachments",
  });
  const hasFileAttachments = fields.length > 0;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileListRef = useRef<HTMLDivElement>(null);
  const fileListBottomSentinelRef = useRef<HTMLDivElement>(null);

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
    () => new Set<string | null>(fields.map((f) => f.fileId)),
    [fields]
  );

  const compareFileIds = useMemo(
    () =>
      compareVersion
        ? new Set<string | null>(
            compareVersion.fileAttachments.map((f) => f.fileId)
          )
        : new Set<string | null>(),
    [compareVersion]
  );

  const filesDiffer =
    isDiffMode &&
    (currentFileIds.size !== compareFileIds.size ||
      [...currentFileIds].some((id) => !compareFileIds.has(id)));

  useEffect(() => {
    const list = fileListRef.current;
    const sentinel = fileListBottomSentinelRef.current;

    if (
      !hasFileAttachments ||
      !list ||
      !sentinel ||
      typeof IntersectionObserver === "undefined"
    ) {
      setCanScrollFilesDown(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setCanScrollFilesDown(!entry.isIntersecting),
      { root: list, threshold: 0.1 }
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasFileAttachments]);

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
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) {
        return;
      }

      const allFiles = Array.from(files);
      const seenFileNames = new Set(existingFileNames);
      const duplicates: File[] = [];
      const newAttachments: PendingSkillBuilderFileAttachment[] = [];

      for (const file of allFiles) {
        if (seenFileNames.has(file.name)) {
          duplicates.push(file);
          continue;
        }

        seenFileNames.add(file.name);

        const contentType = resolveSkillAttachmentContentType(file);
        if (!isSupportedFileContentType(contentType)) {
          sendNotification({
            type: "error",
            title: "Unsupported file skipped.",
            description: `File "${file.name}" is not supported (${contentType}).`,
          });
          continue;
        }

        const sizeLimitError = getSkillAttachmentSizeLimitError({
          file,
          contentType,
        });
        if (sizeLimitError) {
          sendNotification({
            type: "error",
            title: "File too large.",
            description: `File "${file.name}" (${fileSizeToHumanReadable(file.size)}) exceeds the ${sizeLimitError.category} limit of ${fileSizeToHumanReadable(sizeLimitError.maxFileSize)}. Please upload a smaller file.`,
          });
          continue;
        }

        newAttachments.push({
          fileId: null,
          fileName: file.name,
          file,
          contentType,
        });
      }

      if (duplicates.length > 0) {
        sendNotification({
          type: "error",
          title: "Duplicate files skipped.",
          description: `Already attached: ${duplicates.map((f) => f.name).join(", ")}`,
        });
      }

      if (newAttachments.length > 0) {
        append(newAttachments);
      }

      // Reset input so re-uploading the same file triggers onChange.
      e.target.value = "";
    },
    [append, existingFileNames, sendNotification]
  );

  const headerActions = !isDiffMode && hasFileAttachments && (
    <Button
      type="button"
      onClick={onUploadClick}
      label="Upload files"
      icon={PlusIcon}
      variant="outline"
    />
  );

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
        isDiffMode ? null : (
          <EmptyCTA
            action={
              <Button
                type="button"
                onClick={onUploadClick}
                label="Upload files"
                icon={PlusIcon}
                variant="outline"
              />
            }
            className="py-8"
          />
        )
      ) : (
        <div className="relative">
          <div
            ref={fileListRef}
            className="max-h-64 overflow-y-auto overflow-x-hidden"
          >
            <ContextItem.List>
              {sortedFields.map(({ field, originalIndex }) => {
                const isAdded =
                  isDiffMode &&
                  (field.fileId === null || !compareFileIds.has(field.fileId));
                return (
                  <ContextItem
                    key={field.id}
                    title={
                      <span
                        className={cn(
                          "text-sm font-normal",
                          isAdded && "text-success dark:text-success-night"
                        )}
                      >
                        {field.fileName}
                      </span>
                    }
                    visual={<ContextItem.Visual visual={DocumentIcon} />}
                    hoverAction={!isDiffMode}
                    action={
                      !isDiffMode ? (
                        <Button
                          type="button"
                          variant="ghost"
                          icon={XMarkIcon}
                          size="xs"
                          onClick={() => remove(originalIndex)}
                        />
                      ) : undefined
                    }
                  />
                );
              })}
            </ContextItem.List>
            <div ref={fileListBottomSentinelRef} className="h-px" aria-hidden />
          </div>
          <div
            className={cn(
              "pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t",
              "from-background via-background/60 to-transparent transition-opacity duration-300",
              "dark:from-background-night dark:via-background-night/60",
              canScrollFilesDown ? "opacity-100" : "opacity-0"
            )}
            aria-hidden
          />
        </div>
      )}
    </div>
  );
}
