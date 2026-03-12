import type { DetectedSkillSummary } from "@app/lib/skill_detection";
import {
  type DetectedSkillStatus,
  isImportableSkillStatus,
  parseGitHubRepoUrl,
} from "@app/lib/skill_detection";
import {
  useDetectSkillsFromFiles,
  useDetectSkillsFromRepo,
  useImportSkills,
  useImportSkillsFromFiles,
} from "@app/lib/swr/skill_configurations";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Checkbox,
  Chip,
  ContentMessage,
  ContextItem,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  InformationCircleIcon,
  Input,
  PlusIcon,
  PuzzleIcon,
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

const STATUS_CHIP_LABEL: Record<
  Exclude<DetectedSkillStatus, "ready">,
  string
> = {
  name_conflict: "Skill name already in use",
  skill_already_exists: "Override existing skill",
  invalid: "Invalid skill format",
};

const ACCEPTED_FILE_TYPES = ".md,.zip,.skill";

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
                <FileDropzone
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

interface DetectedSkillsListProps {
  detectedSkills: DetectedSkillSummary[];
  selectedNames: Set<string>;
  toggleSkill: (name: string) => void;
  isDetecting: boolean;
  detectError: string | null;
}

function DetectedSkillsList({
  detectedSkills,
  selectedNames,
  toggleSkill,
  isDetecting,
  detectError,
}: DetectedSkillsListProps) {
  return (
    <>
      {detectError && (
        <ContentMessage
          title="Detection failed"
          icon={InformationCircleIcon}
          variant="rose"
          size="lg"
        >
          {detectError}
        </ContentMessage>
      )}
      {isDetecting && (
        <div className="flex items-center justify-center py-4">
          <Spinner size="md" />
        </div>
      )}
      {detectedSkills.length > 0 && (
        <ContextItem.List>
          {detectedSkills.map((skill) => (
            <ContextItem
              key={skill.name}
              title={<span className="text-sm font-normal">{skill.name}</span>}
              visual={
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedNames.has(skill.name)}
                    disabled={!isImportableSkillStatus(skill.status)}
                    onCheckedChange={() => toggleSkill(skill.name)}
                  />
                  <ContextItem.Visual visual={PuzzleIcon} />
                </div>
              }
              action={
                skill.status !== "ready" ? (
                  <Chip
                    label={STATUS_CHIP_LABEL[skill.status]}
                    size="xs"
                    color={
                      skill.status === "skill_already_exists"
                        ? "info"
                        : "warning"
                    }
                  />
                ) : undefined
              }
            />
          ))}
        </ContextItem.List>
      )}
    </>
  );
}

interface FileDropzoneProps {
  onDrop: (e: React.DragEvent) => void;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  disabled: boolean;
  isLoading: boolean;
}

// TODO(2026-03-12 aubin): move this to sparkle.
function FileDropzone({
  onDrop,
  onFileInputChange,
  fileInputRef,
  disabled,
  isLoading,
}: FileDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <div
      className={`flex flex-col items-center gap-3 rounded-xl border-2 border-dashed px-4 py-6 transition-colors ${
        isDragOver
          ? "border-action-300 bg-action-50 dark:border-action-300-night dark:bg-action-50-night"
          : "border-border bg-muted-background dark:border-border-night dark:bg-muted-background-night"
      }`}
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
          The SKILL.md file must contain the skill name and description
          formatted in YAML
        </li>
      </ul>
      <a
        href="https://agentskills.io/specification"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 inline-block text-sm text-action-500 hover:text-action-600 dark:text-action-500-night dark:hover:text-action-600-night"
      >
        Read more about importing skills
      </a>
    </ContentMessage>
  );
}
