import { DetectedSkillsList } from "@app/components/skills/DetectedSkillsList";
import { isImportableSkillStatus, parseGitHubRepoUrl } from "@app/lib/skill_detection";
import {
  useDetectSkillsFromFiles,
  useDetectSkillsFromRepo,
  useImportSkills,
  useImportSkillsFromFiles,
} from "@app/lib/swr/skill_configurations";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  cn,
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropzoneOverlay,
  Hoverable,
  InformationCircleIcon,
  Input,
  PlusIcon,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useRef, useState } from "react";

const IMPORT_TABS = ["repository", "files"] as const;
type ImportTab = (typeof IMPORT_TABS)[number];

function isImportTab(value: string): value is ImportTab {
  return (IMPORT_TABS as readonly string[]).includes(value);
}

interface ImportSkillsDialogProps {
  onClose: () => void;
  owner: LightWorkspaceType;
}

const ACCEPTED_FILE_TYPES = ".md,.zip";

export function ImportSkillsDialog({
  onClose,
  owner,
}: ImportSkillsDialogProps) {
  const [activeTab, setActiveTab] = useState<ImportTab>("repository");
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());

  // Repository tab state.
  const [repoUrl, setRepoUrl] = useState("");
  const {
    detectedSkills: repoDetectedSkills,
    isDetecting: isRepoDetecting,
    detectError: repoDetectError,
    triggerDetect: triggerRepoDetect,
  } = useDetectSkillsFromRepo({ owner });
  const { importSkills: importRepoSkills, isImporting: isRepoImporting } =
    useImportSkills({ owner });

  // Files tab state.
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const {
    detectedSkills: fileDetectedSkills,
    isDetecting: isFileDetecting,
    detectError: fileDetectError,
    triggerDetect: triggerFileDetect,
    resetDetection: resetFileDetection,
  } = useDetectSkillsFromFiles({ owner });
  const { importSkillsFromFiles, isImporting: isFileImporting } =
    useImportSkillsFromFiles({ owner });

  const detectedSkills =
    activeTab === "files" ? fileDetectedSkills : repoDetectedSkills;
  const isDetecting = activeTab === "files" ? isFileDetecting : isRepoDetecting;
  const isImporting = activeTab === "files" ? isFileImporting : isRepoImporting;

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

  const handleFilesSelected = useCallback(
    (files: File[]) => {
      if (files.length === 0) {
        return;
      }
      setUploadedFiles(files);
      void triggerFileDetect(files);
    },
    [triggerFileDetect]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files);
      handleFilesSelected(files);
    },
    [handleFilesSelected]
  );

  const handleImport = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      if (selectedNames.size === 0) {
        return;
      }

      if (activeTab === "files") {
        const result = await importSkillsFromFiles(uploadedFiles, [
          ...selectedNames,
        ]);
        if (result.successCount > 0) {
          onClose();
        }
      } else {
        const result = await importRepoSkills(repoUrl, [...selectedNames]);
        if (result.successCount > 0) {
          onClose();
        }
      }
    },
    [
      activeTab,
      selectedNames,
      uploadedFiles,
      importSkillsFromFiles,
      repoUrl,
      importRepoSkills,
      onClose,
    ]
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

  const handleTabChange = useCallback(
    (tab: string) => {
      if (!isImportTab(tab)) {
        return;
      }
      setActiveTab(tab);
      setSelectedNames(new Set());
      if (tab === "files") {
        setRepoUrl("");
      } else {
        setUploadedFiles([]);
        resetFileDetection();
      }
    },
    [resetFileDetection]
  );

  const detectError = activeTab === "files" ? fileDetectError : repoDetectError;
  const selectedCount = selectedNames.size;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Import skills</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger value="repository" label="From a repository" />
              <TabsTrigger value="files" label="From files" />
            </TabsList>

            <TabsContent value="files">
              <div className="flex flex-col gap-4 pt-2">
                <SkillFileDropzone
                  onDrop={handleDrop}
                  onFileInputChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    handleFilesSelected(files);
                  }}
                  fileInputRef={fileInputRef}
                  disabled={isImporting}
                  isLoading={isFileDetecting}
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
            </TabsContent>

            <TabsContent value="repository">
              <div className="flex flex-col gap-4 pt-2">
                <Input
                  placeholder="https://github.com/owner/repo"
                  value={repoUrl}
                  onChange={(e) => {
                    const url = e.target.value;
                    setRepoUrl(url.trim());
                    const trimmed = url.trim();
                    if (trimmed && parseGitHubRepoUrl(trimmed).isOk()) {
                      triggerRepoDetect(trimmed);
                    }
                  }}
                  name="repoUrl"
                  disabled={isImporting}
                />
                <DetectedSkillsList
                  detectedSkills={detectedSkills}
                  selectedNames={selectedNames}
                  toggleSkill={toggleSkill}
                  isDetecting={isDetecting}
                  detectError={detectError}
                />
              </div>
            </TabsContent>
          </Tabs>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            disabled: isDetecting || isImporting,
          }}
          rightButtonProps={{
            label: "Import",
            disabled: isImporting || selectedCount === 0,
            isLoading: isImporting,
            onClick: handleImport,
          }}
        />
      </DialogContent>
    </Dialog>
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
