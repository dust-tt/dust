import { ActionIcons, Button, Edit04 } from "@dust-tt/sparkle";

import type { DataSource } from "../../data/types";
import { PodCustomizationSection } from "../PodCustomizationSection";
import { podSources, type WorkspaceState } from "./engine";
import { podFileTabs, setPodFileTabs } from "./fileTabs";
import type { WorkspaceFile } from "./model";
import { fileIcons } from "./ResourceRow";

function isActionIcon(name: string): name is keyof typeof ActionIcons {
  return Object.prototype.hasOwnProperty.call(ActionIcons, name);
}

export function fileTabIcon(file: WorkspaceFile, icon?: string) {
  return icon && isActionIcon(icon) ? ActionIcons[icon] : fileIcons[file.kind];
}

export function tabDataSource(file: WorkspaceFile): DataSource {
  return {
    id: file.id,
    kind: "file",
    fileName: file.name,
    fileType: file.kind === "frame" ? "frame" : "txt",
    parentId: file.parentId ?? null,
    source: "company",
    createdBy: "1",
    createdAt: new Date("2026-10-01"),
    updatedAt: new Date("2026-10-06"),
    icon: fileIcons[file.kind],
  };
}

export function PodFileTabsSettings({
  state,
  podId,
  onChange,
  onOpen,
}: {
  state: WorkspaceState;
  podId: string;
  onChange: (update: (state: WorkspaceState) => WorkspaceState) => void;
  onOpen: (fileId: string) => void;
}) {
  const tabs = podFileTabs(state, podId);
  const changeTab = (id: string, changes: { title?: string; icon?: string }) =>
    onChange((current) =>
      setPodFileTabs(
        current,
        podId,
        podFileTabs(current, podId).map((tab) =>
          tab.fileId === id ? { ...tab, ...changes } : tab
        )
      )
    );
  return (
    <section className="flex flex-col gap-4">
      <h2 className="heading-lg">Pod Customization</h2>
      <PodCustomizationSection
        tabs={tabs.flatMap((tab) => {
          const file = state.files.find((file) => file.id === tab.fileId);
          return file
            ? [
                {
                  value: tab.fileId,
                  label: tab.title,
                  icon: fileTabIcon(file, tab.icon),
                  iconName: tab.icon,
                  action: (
                    <Button
                      size="xs"
                      variant="ghost"
                      icon={Edit04}
                      tooltip={
                        file.kind === "frame"
                          ? "Edit frame conversation"
                          : "Open file"
                      }
                      onClick={() =>
                        onOpen(
                          file.kind === "frame" && file.parentId
                            ? file.parentId
                            : file.id
                        )
                      }
                    />
                  ),
                },
              ]
            : [];
        })}
        addableFiles={podSources(state, podId)
          .filter(
            (file) =>
              ["frame", "document", "email"].includes(file.kind) &&
              !tabs.some((tab) => tab.fileId === file.id)
          )
          .map(tabDataSource)}
        onAdd={(file) =>
          onChange((current) =>
            setPodFileTabs(current, podId, [
              ...podFileTabs(current, podId),
              { fileId: file.id, title: file.fileName },
            ])
          )
        }
        onRename={(id, title) => changeTab(id, { title })}
        onChangeIcon={(id, icon) => changeTab(id, { icon })}
        onRemove={(id) =>
          onChange((current) =>
            setPodFileTabs(
              current,
              podId,
              podFileTabs(current, podId).filter((tab) => tab.fileId !== id)
            )
          )
        }
        onReorder={(dragged, target) =>
          onChange((current) => {
            const reordered = [...podFileTabs(current, podId)];
            const from = reordered.findIndex((tab) => tab.fileId === dragged);
            const to = reordered.findIndex((tab) => tab.fileId === target);
            if (from < 0 || to < 0) {
              return current;
            }
            const [tab] = reordered.splice(from, 1);
            reordered.splice(to, 0, tab);
            return setPodFileTabs(current, podId, reordered);
          })
        }
      />
    </section>
  );
}
