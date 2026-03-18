import { DetectedSkillsList } from "@app/components/skills/import/DetectedSkillsList";
import type { FilesImportFormValues } from "@app/components/skills/import/formSchema";
import { isImportableSkillStatus } from "@app/lib/skill_detection";
import { useDetectSkillsFromFiles } from "@app/lib/swr/skill_configurations";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  ContentMessage,
  cn,
  DropzoneOverlay,
  Hoverable,
  InformationCircleIcon,
  PlusIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFormContext } from "react-hook-form";

const ACCEPTED_EXTENSIONS = [".zip"];

interface ImportFromFilesTabProps {
  owner: LightWorkspaceType;
  isActive: boolean;
  onDetectingChange: (isDetecting: boolean) => void;
  onDetectedCountChange: (count: number) => void;
  onFilesChange: (files: File[]) => void;
  isImporting: boolean;
}

export function ImportFromFilesTab({
  owner,
  isActive,
  onDetectingChange,
  onDetectedCountChange,
  onFilesChange,
  isImporting,
}: ImportFromFilesTabProps) {
  const { setValue } = useFormContext<FilesImportFormValues>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { detectedSkills, isDetecting, detectError, triggerDetect } =
    useDetectSkillsFromFiles({ owner });

  // Re-sync selected skills when detection completes or when this tab becomes active.
  useEffect(() => {
    if (!isActive) {
      return;
    }
    setValue(
      "selectedSkillNames",
      detectedSkills
        .filter((skill) => isImportableSkillStatus(skill.status))
        .map((skill) => skill.name)
    );
  }, [isActive, detectedSkills, setValue]);

  useEffect(() => {
    onDetectingChange(isDetecting);
  }, [isDetecting, onDetectingChange]);

  useEffect(() => {
    onDetectedCountChange(detectedSkills.length);
  }, [detectedSkills.length, onDetectedCountChange]);

  const [fileTypeError, setFileTypeError] = useState<string | null>(null);

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      if (files.length === 0) {
        return;
      }
      const rejected = files.filter(
        (f) => !ACCEPTED_EXTENSIONS.some((ext) => f.name.endsWith(ext))
      );
      if (rejected.length > 0) {
        setFileTypeError("Only .zip files are accepted.");
        return;
      }
      setFileTypeError(null);
      onFilesChange(files);
      void triggerDetect(files);
    },
    [triggerDetect, onFilesChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      handleFilesSelected(Array.from(e.dataTransfer.files));
    },
    [handleFilesSelected]
  );

  return (
    <div className="flex flex-col gap-3 pt-4">
      <SkillFileDropzone
        onDrop={handleDrop}
        onFileInputChange={(e) => {
          handleFilesSelected(Array.from(e.target.files ?? []));
        }}
        fileInputRef={fileInputRef}
        disabled={isImporting}
        isLoading={isDetecting}
      />
      <DetectedSkillsList
        detectedSkills={detectedSkills}
        isDetecting={isDetecting}
        detectError={fileTypeError ?? detectError}
      />
      <FileRequirements />
    </div>
  );
}

interface SkillFileDropzoneProps {
  onDrop: (e: React.DragEvent) => void;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  disabled: boolean;
  isLoading: boolean;
}

function SkillFileDropzone({
  onDrop,
  onFileInputChange,
  fileInputRef,
  disabled,
  isLoading,
}: SkillFileDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-3 overflow-hidden rounded-xl",
        "border-2 border-dashed border-border bg-muted-background px-4 py-6",
        "transition-colors dark:border-border-night dark:bg-muted-background-night"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        if (!isLoading) {
          setIsDragOver(true);
        }
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        if (!isLoading) {
          onDrop(e);
        }
      }}
    >
      <DropzoneOverlay
        isDragActive={isDragOver}
        title="Drop files here"
        description="Upload .zip files"
      />
      {isLoading ? (
        <>
          <Spinner size="md" />
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Detecting skills...
          </p>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            Drag and drop or click to upload
          </p>
          <input
            className="hidden"
            type="file"
            accept={ACCEPTED_EXTENSIONS.join(",")}
            ref={fileInputRef}
            multiple
            onChange={onFileInputChange}
          />
          <Button
            label="Upload files"
            icon={PlusIcon}
            variant="primary"
            size="sm"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
          />
        </>
      )}
    </div>
  );
}

function FileRequirements() {
  return (
    <ContentMessage
      title="File requirements"
      icon={InformationCircleIcon}
      variant="outline"
      size="lg"
    >
      <ul className="list-disc pl-4 text-sm">
        <li>The imported .zip must include a SKILL.md file</li>
        <li>
          This file must contain the skill name and description formatted in
          YAML
        </li>
      </ul>
      Read more about importing skills&nbsp;
      <Hoverable
        variant="highlight"
        href="https://agentskills.io/specification"
        target="_blank"
      >
        here
      </Hoverable>
      .
    </ContentMessage>
  );
}
