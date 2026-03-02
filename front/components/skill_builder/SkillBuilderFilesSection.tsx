import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import { useFileUploaderService } from "@app/hooks/useFileUploaderService";
import {
  Button,
  ContextItem,
  DocumentIcon,
  EmptyCTA,
  PlusIcon,
  Spinner,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { useCallback, useRef } from "react";
import { useFieldArray } from "react-hook-form";

export function SkillBuilderFilesSection() {
  const { owner, skillId } = useSkillBuilderContext();
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

  const onUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) {
        return;
      }

      const uploaded = await handleFilesUpload(Array.from(files));
      if (uploaded) {
        for (const blob of uploaded) {
          if (blob.fileId) {
            append({ fileId: blob.fileId, fileName: blob.filename });
          }
        }
      }

      // Reset input so re-uploading the same file triggers onChange.
      e.target.value = "";
    },
    [handleFilesUpload, append]
  );

  const canUpload = !!skillId;

  const uploadDisabled = !canUpload || isProcessingFiles;

  const headerActions = fields.length > 0 && (
    <Button
      type="button"
      onClick={onUploadClick}
      label="Upload files"
      icon={isProcessingFiles ? Spinner : PlusIcon}
      variant="outline"
      disabled={uploadDisabled}
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
        {headerActions}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={onFileInputChange}
      />

      <div className="flex-1">
        {fields.length === 0 ? (
          isProcessingFiles ? (
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
                  disabled={!canUpload}
                />
              }
              className="py-8"
            />
          )
        ) : (
          <ContextItem.List>
            {fields.map((field, index) => (
              <ContextItem
                key={field.id}
                title={field.fileName}
                visual={<ContextItem.Visual visual={DocumentIcon} />}
                hasSeparator={false}
                hoverAction
                action={
                  <Button
                    type="button"
                    variant="ghost"
                    icon={XMarkIcon}
                    size="xs"
                    onClick={() => remove(index)}
                  />
                }
              />
            ))}
          </ContextItem.List>
        )}
      </div>
    </div>
  );
}
