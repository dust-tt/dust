import { getSpaceIcon } from "@app/lib/spaces";
import type { PodType } from "@app/types/space";
import {
  Building04,
  Button,
  CubeOutline,
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

// The single scope state driving the central Computer admin page. One Pod
// selected renders the full single-Pod editing view; two or more (or
// all-pods) render the read-only comparison views. "all-pods" stays symbolic
// so bulk reads can resolve it server-side.
export type SandboxAdminScope =
  | { kind: "workspace" }
  | { kind: "all-pods" }
  | { kind: "pods"; podIds: string[] };

function labelForScope(scope: SandboxAdminScope, pods: PodType[]): string {
  switch (scope.kind) {
    case "workspace":
      return "Workspace";
    case "all-pods":
      return `All Pods (${pods.length})`;
    case "pods": {
      if (scope.podIds.length === 1) {
        const pod = pods.find((p) => p.sId === scope.podIds[0]);
        return pod?.name ?? "1 Pod";
      }
      return `${scope.podIds.length} Pods`;
    }
  }
}

interface SandboxScopePickerProps {
  pods: PodType[];
  scope: SandboxAdminScope;
  onScopeChange: (scope: SandboxAdminScope) => void;
  isLoading: boolean;
  disabled?: boolean;
}

export function SandboxScopePicker({
  pods,
  scope,
  onScopeChange,
  isLoading,
  disabled = false,
}: SandboxScopePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState("");

  const selectedPodIds = useMemo(() => {
    switch (scope.kind) {
      case "workspace":
        return new Set<string>();
      case "all-pods":
        return new Set(pods.map((pod) => pod.sId));
      case "pods":
        return new Set(scope.podIds);
    }
  }, [scope, pods]);

  const filteredPods = useMemo(() => {
    const normalizedSearchText = searchText.trim().toLowerCase();
    if (!normalizedSearchText) {
      return pods;
    }
    return pods.filter((pod) =>
      pod.name.toLowerCase().includes(normalizedSearchText)
    );
  }, [searchText, pods]);

  const handlePodCheckedChange = (podId: string, checked: boolean) => {
    const next = checked
      ? [...selectedPodIds, podId]
      : [...selectedPodIds].filter((id) => id !== podId);
    // An empty selection falls back to the workspace view; "All Pods" is
    // only entered through its explicit item (it tracks Pods added later).
    onScopeChange(
      next.length === 0 ? { kind: "workspace" } : { kind: "pods", podIds: next }
    );
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
          label={labelForScope(scope, pods)}
          isSelect
          disabled={disabled}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-80 max-w-[calc(100vw-1rem)]"
        align="start"
        collisionPadding={8}
      >
        <DropdownMenuItem
          label="Workspace"
          icon={Building04}
          onClick={() => onScopeChange({ kind: "workspace" })}
        />
        <DropdownMenuItem
          label={`All Pods (${pods.length})`}
          icon={CubeOutline}
          disabled={pods.length === 0}
          onClick={() => onScopeChange({ kind: "all-pods" })}
        />
        <DropdownMenuSeparator />
        <DropdownMenuLabel label="Specific Pods" />
        <DropdownMenuSearchbar
          autoFocus
          name="search-pods"
          placeholder="Search Pods"
          value={searchText}
          onChange={setSearchText}
          disabled={isLoading}
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
                handlePodCheckedChange(pod.sId, checked === true)
              }
              onSelect={(event) => {
                event.preventDefault();
              }}
            />
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
