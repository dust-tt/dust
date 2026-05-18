import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { useSkillVersionComparisonContext } from "@app/components/skill_builder/SkillBuilderVersionContext";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import { useSendNotification } from "@app/hooks/useNotification";
import {
  ArrowGoBackIcon,
  Button,
  ContextItem,
  cn,
  DocumentIcon,
  EmptyCTA,
  PlusIcon,
  Spinner,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

export function SkillBuilderFilesSection() {
  const { owner, skillId } = useSkillBuilderContext();
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
              append({ fileId: blob.fileId, fileName: blob.filename });
            }
          }
        }
      }

      // Reset input so re-uploading the same file triggers onChange.
      e.target.value = "";
    },
    [handleFilesUpload, append, existingFileNames, sendNotification]
  );

  const headerActions = !isDiffMode && hasFileAttachments && (
    <Button
      type="button"
      onClick={onUploadClick}
      label="Upload files"
      icon={isProcessingFiles ? Spinner : PlusIcon}
      variant="outline"
      disabled={isProcessingFiles}
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
        <div className="relative">
          <div
            ref={fileListRef}
            className="max-h-64 overflow-y-auto overflow-x-hidden"
          >
            <ContextItem.List>
              {sortedFields.map(({ field, originalIndex }) => {
                const isAdded = isDiffMode && !compareFileIds.has(field.fileId);
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
