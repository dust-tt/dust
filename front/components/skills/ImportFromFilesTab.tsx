import { DetectedSkillsList } from "@app/components/skills/DetectedSkillsList";
import { isImportableSkillStatus } from "@app/lib/skill_detection";
import {
  useDetectSkillsFromFiles,
  useImportSkillsFromFiles,
} from "@app/lib/swr/skill_configurations";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  cn,
  ContentMessage,
  DropzoneOverlay,
  Hoverable,
  InformationCircleIcon,
  PlusIcon,
  Spinner,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useRef, useState } from "react";

const ACCEPTED_FILE_TYPES = ".md,.zip";

interface ImportFromFilesTabProps {
  owner: LightWorkspaceType;
  onStateChange: (state: {
    selectedCount: number;
    isDetecting: boolean;
    isImporting: boolean;
  }) => void;
  onImportSuccess: () => void;
  registerImportHandler: (handler: () => Promise<void>) => void;
}

export function ImportFromFilesTab({
  owner,
  onStateChange,
  onImportSuccess,
  registerImportHandler,
}: ImportFromFilesTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());

  const { detectedSkills, isDetecting, detectError, triggerDetect } =
    useDetectSkillsFromFiles({ owner });
  const { importSkillsFromFiles, isImporting } = useImportSkillsFromFiles({
    owner,
  });

  // Pre-select all importable skills when detection completes.
  useEffect(() => {
    const initial = new Set<string>();
    for (const skill of detectedSkills) {
      if (isImportableSkillStatus(skill.status)) {
        initial.add(skill.name);
      }
    }
    setSelectedNames(initial);
  }, [detectedSkills]);

  // Report state to parent.
  useEffect(() => {
    onStateChange({
      selectedCount: selectedNames.size,
      isDetecting,
      isImporting,
    });
  }, [selectedNames.size, isDetecting, isImporting, onStateChange]);

  // Register import handler with parent.
  const handleImport = useCallback(async () => {
    if (selectedNames.size === 0) {
      return;
    }
    const result = await importSkillsFromFiles(uploadedFiles, [
      ...selectedNames,
    ]);
    if (result.successCount > 0) {
      onImportSuccess();
    }
  }, [selectedNames, uploadedFiles, importSkillsFromFiles, onImportSuccess]);

  useEffect(() => {
    registerImportHandler(handleImport);
  }, [handleImport, registerImportHandler]);

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      if (files.length === 0) {
        return;
      }
      setUploadedFiles(files);
      void triggerDetect(files);
    },
    [triggerDetect]
  );

  const toggleSkill = useCallback((name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      handleFilesSelected(Array.from(e.dataTransfer.files));
    },
    [handleFilesSelected]
  );

  return (
    <div className="flex flex-col gap-4 pt-2">
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
        selectedNames={selectedNames}
        toggleSkill={toggleSkill}
        isDetecting={isDetecting}
        detectError={detectError}
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
        setIsDragOver(false);
        if (!isLoading) {
          onDrop(e);
        }
      }}
    >
      <DropzoneOverlay
        isDragActive={isDragOver}
        title="Drop files here"
        description="Upload .md, .zip or .skill files"
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
            accept={ACCEPTED_FILE_TYPES}
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
        <li>The imported .zip or file must include a SKILL.md file</li>
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
