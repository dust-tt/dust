import {
  Avatar,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { useState, type Dispatch, type SetStateAction } from "react";

import {
  AgentInfoTab,
  AgentInsightsTab,
  EditorsList,
  SkillInfoTab,
  ToolGeneralTab,
  ToolStakesTab,
  formFor,
  type ToolForm,
} from "../BuildDetailSheets";
import { FilePreviewPanel } from "../FilePreviewPanel";
import type { WorkspaceFile } from "./model";
import { fileIcons } from "./ResourceRow";
import {
  resolveAgent,
  resolveSkill,
  resolveTool,
  type WorkspaceRecords,
} from "./records";

function ToolFileView({
  file,
  records,
  setRecords,
  setFiles,
  onFileUpdated,
}: {
  file: WorkspaceFile;
  records: WorkspaceRecords;
  setRecords: Dispatch<SetStateAction<WorkspaceRecords>>;
  setFiles: Dispatch<SetStateAction<WorkspaceFile[]>>;
  onFileUpdated: (file: WorkspaceFile) => void;
}) {
  const tool = resolveTool(file, records);
  const [form, setForm] = useState<ToolForm>(() => formFor(tool));
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const patch = (changes: Partial<ToolForm>) => {
    setForm((current) => ({ ...current, ...changes }));
    setDirty(true);
  };
  if (!tool) {
    return (
      <p className="text-sm text-muted-foreground">
        Tool configuration unavailable.
      </p>
    );
  }
  const operations = form.operations.filter((operation) =>
    `${operation.name} ${operation.description}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );
  return (
    <div className="flex flex-col gap-5">
      <Avatar icon={tool.icon} size="lg" />
      <p className="whitespace-pre-wrap text-sm leading-relaxed">
        {file.content}
      </p>
      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general" label="Settings" />
          <TabsTrigger value="operations" label="Tools" />
        </TabsList>
        <TabsContent value="general" className="flex flex-col gap-5 pt-5">
          <ToolGeneralTab tool={tool} form={form} onPatch={patch} />
        </TabsContent>
        <TabsContent value="operations" className="flex flex-col gap-5 pt-5">
          <ToolStakesTab
            operations={form.operations}
            visibleOperations={operations}
            search={search}
            onSearchChange={(value) => {
              setSearch(value);
              setSelected([]);
            }}
            selectedNames={selected}
            onSelectedNamesChange={setSelected}
            onOperationsChange={(value) => patch({ operations: value })}
          />
        </TabsContent>
      </Tabs>
      <div className="flex justify-end">
        <Button
          label="Save changes"
          variant="highlight"
          disabled={!dirty || !form.name.trim()}
          onClick={() => {
            setRecords((current) => ({
              ...current,
              tools: {
                ...current.tools,
                [tool.id]: { ...tool, ...form, updatedAt: new Date() },
              },
            }));
            setFiles((current) =>
              current.map((entry) =>
                entry.id === file.id
                  ? {
                      ...entry,
                      name: form.name.trim(),
                      description: form.description,
                    }
                  : entry
              )
            );
            onFileUpdated({
              ...file,
              name: form.name.trim(),
              description: form.description,
            });
            setDirty(false);
          }}
        />
      </div>
    </div>
  );
}

export function SpecialFileView({
  file,
  files,
  records,
  setRecords,
  setFiles,
  onFileUpdated,
}: {
  file: WorkspaceFile;
  files: WorkspaceFile[];
  records: WorkspaceRecords;
  setRecords: Dispatch<SetStateAction<WorkspaceRecords>>;
  setFiles: Dispatch<SetStateAction<WorkspaceFile[]>>;
  onFileUpdated: (file: WorkspaceFile) => void;
}) {
  const byRecord = new Map(
    files
      .filter((entry) => entry.recordId)
      .map((entry) => [entry.recordId, entry])
  );
  switch (file.kind) {
    case "agent": {
      const agent = resolveAgent(file, records);
      if (!agent) {
        return (
          <p className="text-sm text-muted-foreground">
            Agent configuration unavailable.
          </p>
        );
      }
      return (
        <div className="flex flex-col gap-5">
          <Avatar
            emoji={agent.emoji}
            backgroundColor={agent.backgroundColor}
            size="lg"
          />
          <Tabs defaultValue="info">
            <TabsList>
              <TabsTrigger value="info" label="Info" />
              <TabsTrigger value="insights" label="Insights" />
              <TabsTrigger value="editors" label="Editors" />
            </TabsList>
            <TabsContent value="info" className="flex flex-col gap-5 pt-5">
              <AgentInfoTab
                agent={agent}
                knowledge={
                  <p className="text-sm text-muted-foreground">
                    Pod context is added when you start a conversation in a pod.
                  </p>
                }
                getSkill={(id) => {
                  const source = byRecord.get(id);
                  return source ? resolveSkill(source, records) : undefined;
                }}
              />
            </TabsContent>
            <TabsContent value="insights" className="flex flex-col gap-5 pt-5">
              <AgentInsightsTab agent={agent} />
            </TabsContent>
            <TabsContent value="editors" className="pt-5">
              <EditorsList userIds={agent.editorIds} />
            </TabsContent>
          </Tabs>
        </div>
      );
    }
    case "skill": {
      const skill = resolveSkill(file, records);
      if (!skill) {
        return (
          <p className="text-sm text-muted-foreground">
            Skill configuration unavailable.
          </p>
        );
      }
      return (
        <div className="flex flex-col gap-5">
          <Avatar
            icon={skill.icon}
            size="lg"
            backgroundColor="bg-highlight-50"
            iconColor="text-highlight-700"
          />
          <Tabs defaultValue="info">
            <TabsList>
              <TabsTrigger value="info" label="Info" />
              <TabsTrigger value="editors" label="Editors" />
            </TabsList>
            <TabsContent value="info" className="flex flex-col gap-5 pt-5">
              <SkillInfoTab
                skill={skill}
                getAgent={(id) => {
                  const source = byRecord.get(id);
                  return source ? resolveAgent(source, records) : undefined;
                }}
                getTool={(id) => {
                  const source = byRecord.get(id);
                  return source ? resolveTool(source, records) : undefined;
                }}
              />
            </TabsContent>
            <TabsContent value="editors" className="pt-5">
              <EditorsList userIds={skill.editorIds} />
            </TabsContent>
          </Tabs>
        </div>
      );
    }
    case "tool":
      return (
        <ToolFileView
          file={file}
          records={records}
          setRecords={setRecords}
          setFiles={setFiles}
          onFileUpdated={onFileUpdated}
        />
      );
    case "frame": {
      const frame = file.recordId ? records.frames[file.recordId] : undefined;
      if (!frame) {
        return (
          <p className="text-sm text-muted-foreground">Frame unavailable.</p>
        );
      }
      return (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Version {file.revision ?? frame.version} · Updated {frame.updatedAt}
          </p>
          <Tabs defaultValue="preview">
            <TabsList>
              <TabsTrigger value="preview" label="Preview" />
              <TabsTrigger value="source" label="Code" />
            </TabsList>
            <TabsContent value="preview" className="pt-4">
              <FilePreviewPanel
                dataSource={{
                  id: file.id,
                  kind: "file",
                  fileName: file.name,
                  fileType: "frame",
                  parentId: file.parentId ?? null,
                  source: "company",
                  createdBy: "1",
                  createdAt: new Date("2026-10-01"),
                  updatedAt: new Date("2026-10-06"),
                  icon: fileIcons.frame,
                }}
                frameDocument={file.content}
              />
            </TabsContent>
            <TabsContent value="source" className="pt-4">
              <pre className="overflow-x-auto rounded-xl bg-muted-background p-4 text-xs leading-6">
                <code>{file.content}</code>
              </pre>
            </TabsContent>
          </Tabs>
        </div>
      );
    }
    default:
      return null;
  }
}
