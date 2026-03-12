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
import { useCallback, useMemo, useRef } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

export function SkillBuilderFilesSection() {
  const { owner, skillId } = useSkillBuilderContext();
  const sendNotification = useSendNotification();
  const { setValue } = useFormContext<SkillBuilderFormData>();
  const { compareVersion, isDiffMode } = useSkillVersionComparisonContext();

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

  const headerActions = !isDiffMode && fields.length > 0 && (
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
    <div className="space-y-3">
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

      <div className="flex-1">
        {fields.length === 0 ? (
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
        )}
      </div>
    </div>
  );
}
