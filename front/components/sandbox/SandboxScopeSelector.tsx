import { getSpaceIcon } from "@app/lib/spaces";
import type { PodType } from "@app/types/space";
import {
  Building04,
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSearchbar,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

// The scopes edited together on the central Computer admin page: the workspace
// baseline and/or any Pods. Every selected scope is a write target.
export type SandboxScopeSelection = {
  includeWorkspace: boolean;
  podIds: string[];
};

function labelForSelection(
  selection: SandboxScopeSelection,
  pods: PodType[]
): string {
  const allPodsSelected =
    pods.length > 0 && selection.podIds.length === pods.length;
  if (selection.includeWorkspace && allPodsSelected) {
    return "All scopes";
  }

  const parts: string[] = [];
  if (selection.includeWorkspace) {
    parts.push("Workspace");
  }
  if (selection.podIds.length === 1) {
    const pod = pods.find((candidate) => candidate.sId === selection.podIds[0]);
    parts.push(pod?.name ?? "1 Pod");
  } else if (selection.podIds.length > 1) {
    parts.push(
      allPodsSelected ? "all Pods" : `${selection.podIds.length} Pods`
    );
  }
  return parts.length === 0 ? "Select scope" : parts.join(" + ");
}

interface SandboxScopeSelectorProps {
  pods: PodType[];
  selection: SandboxScopeSelection;
  onChange: (selection: SandboxScopeSelection) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function SandboxScopeSelector({
  pods,
  selection,
  onChange,
  isLoading,
  disabled = false,
}: SandboxScopeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");

  const selectedPodIds = useMemo(
    () => new Set(selection.podIds),
    [selection.podIds]
  );

  const filteredPods = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return query
      ? pods.filter((pod) => pod.name.toLowerCase().includes(query))
      : pods;
  }, [searchText, pods]);

  const allPodsSelected =
    pods.length > 0 && selection.podIds.length === pods.length;

  const togglePod = (podId: string, checked: boolean) => {
    onChange({
      ...selection,
      podIds: checked
        ? [...selection.podIds, podId]
        : selection.podIds.filter((id) => id !== podId),
    });
  };

  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) {
          setSearchText("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          label={labelForSelection(selection, pods)}
          isSelect
          disabled={disabled}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-80 max-w-[calc(100vw-1rem)]"
        align="start"
        collisionPadding={8}
      >
        <DropdownMenuCheckboxItem
          label="Workspace"
          icon={Building04}
          checked={selection.includeWorkspace}
          onCheckedChange={(checked) =>
            onChange({ ...selection, includeWorkspace: checked === true })
          }
          onSelect={(event) => {
            event.preventDefault();
          }}
        />
        <DropdownMenuSeparator />
        <DropdownMenuLabel label="Pods" />
        <DropdownMenuSearchbar
          autoFocus
          name="search-pods"
          placeholder="Search Pods"
          value={searchText}
          onChange={setSearchText}
          disabled={isLoading}
        />
        <DropdownMenuItem
          label={allPodsSelected ? "Clear all" : "Select all"}
          disabled={pods.length === 0}
          onClick={() =>
            onChange({
              ...selection,
              podIds: allPodsSelected ? [] : pods.map((pod) => pod.sId),
            })
          }
          onSelect={(event) => {
            event.preventDefault();
          }}
        />
        {isLoading ? (
          <DropdownMenuItem
            label="Loading"
            disabled
            endComponent={<Spinner size="xs" />}
          />
        ) : pods.length === 0 ? (
          <DropdownMenuItem label="No Pods in this workspace" disabled />
        ) : filteredPods.length === 0 ? (
          <DropdownMenuItem label="No matching Pods" disabled />
        ) : (
          filteredPods.map((pod) => (
            <DropdownMenuCheckboxItem
              key={pod.sId}
              label={pod.name}
              icon={getSpaceIcon(pod)}
              checked={selectedPodIds.has(pod.sId)}
              onCheckedChange={(checked) =>
                togglePod(pod.sId, checked === true)
              }
              onSelect={(event) => {
                event.preventDefault();
              }}
            />
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          label="Clear selection"
          disabled={
            !selection.includeWorkspace && selection.podIds.length === 0
          }
          onClick={() => onChange({ includeWorkspace: false, podIds: [] })}
          onSelect={(event) => {
            event.preventDefault();
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
