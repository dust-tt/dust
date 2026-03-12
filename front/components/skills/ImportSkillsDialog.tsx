import { ImportFromFilesTab } from "@app/components/skills/ImportFromFilesTab";
import { ImportFromRepositoryTab } from "@app/components/skills/ImportFromRepositoryTab";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useCallback, useRef, useState } from "react";

const IMPORT_TABS = ["repository", "files"] as const;
type ImportTab = (typeof IMPORT_TABS)[number];

function isImportTab(value: string): value is ImportTab {
  return (IMPORT_TABS as readonly string[]).includes(value);
}

interface TabState {
  selectedCount: number;
  isDetecting: boolean;
  isImporting: boolean;
}

interface ImportSkillsDialogProps {
  onClose: () => void;
  owner: LightWorkspaceType;
}

export function ImportSkillsDialog({
  onClose,
  owner,
}: ImportSkillsDialogProps) {
  const [activeTab, setActiveTab] = useState<ImportTab>("repository");
  const [tabState, setTabState] = useState<TabState>({
    selectedCount: 0,
    isDetecting: false,
    isImporting: false,
  });
  const importHandlerRef = useRef<(() => Promise<void>) | null>(null);

  const handleTabChange = useCallback((tab: string) => {
    if (!isImportTab(tab)) {
      return;
    }
    setActiveTab(tab);
    setTabState({ selectedCount: 0, isDetecting: false, isImporting: false });
  }, []);

  const registerImportHandler = useCallback(
    (handler: () => Promise<void>) => {
      importHandlerRef.current = handler;
    },
    []
  );

  const handleImportClick = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    await importHandlerRef.current?.();
  }, []);

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
          </Tabs>
          {activeTab === "repository" && (
            <ImportFromRepositoryTab
              owner={owner}
              onStateChange={setTabState}
              onImportSuccess={onClose}
              registerImportHandler={registerImportHandler}
            />
          )}
          {activeTab === "files" && (
            <ImportFromFilesTab
              owner={owner}
              onStateChange={setTabState}
              onImportSuccess={onClose}
              registerImportHandler={registerImportHandler}
            />
          )}
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            disabled: tabState.isDetecting || tabState.isImporting,
          }}
          rightButtonProps={{
            label: "Import",
            disabled: tabState.isImporting || tabState.selectedCount === 0,
            isLoading: tabState.isImporting,
            onClick: handleImportClick,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
