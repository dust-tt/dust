import { podIcon } from "@app/components/sandbox/pod_icon";
import type { SandboxAdminPod } from "@app/types/api/sandbox/egress_policy";
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
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";

type Translate = (descriptor: MessageDescriptor) => string;

// The scopes edited together on the central Computer admin page: the workspace
// baseline and/or any Pods. Every selected scope is a write target.
export type SandboxScopeSelection = {
  includeWorkspace: boolean;
  podIds: string[];
};

export function labelForSelection(
  selection: SandboxScopeSelection,
  pods: SandboxAdminPod[],
  t: Translate
): string {
  const podIds = new Set(selection.podIds);
  // Count only Pods still present in the list: a selected Pod that lost its
  // policy (and dropped out of `pods`) is no longer a real scope, so it must
  // not inflate the label.
  const selectedPods = pods.filter((pod) => podIds.has(pod.sId));
  const allPodsSelected =
    pods.length > 0 && selectedPods.length === pods.length;
  if (selection.includeWorkspace && allPodsSelected) {
    return t(msg`All scopes`);
  }

  const podCount = selectedPods.length;
  if (podCount === 0) {
    return selection.includeWorkspace
      ? t(msg`Workspace`)
      : t(msg`Select scope`);
  }
  if (podCount === 1) {
    const podName = selectedPods[0].name;
    return selection.includeWorkspace
      ? t(msg`Workspace + ${podName}`)
      : podName;
  }
  if (selection.includeWorkspace) {
    return t(
      msg`Workspace + ${plural(podCount, { one: "# Pod", other: "# Pods" })}`
    );
  }
  return allPodsSelected
    ? t(msg`All Pods`)
    : t(msg`${plural(podCount, { one: "# Pod", other: "# Pods" })}`);
}

interface SandboxScopeSelectorProps {
  pods: SandboxAdminPod[];
  selection: SandboxScopeSelection;
  onChange: (selection: SandboxScopeSelection) => void;
  isLoading: boolean;
  isError?: boolean;
  disabled?: boolean;
}

export function SandboxScopeSelector({
  pods,
  selection,
  onChange,
  isLoading,
  isError = false,
  disabled = false,
}: SandboxScopeSelectorProps) {
  const { t } = useLingui();
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

  // Set-membership, not a length compare: a stale selected id (a Pod that
  // dropped out of `pods`) must not make a partial selection read as "all".
  const allPodsSelected =
    pods.length > 0 && pods.every((pod) => selectedPodIds.has(pod.sId));

  const togglePod = (podId: string, checked: boolean) => {
    onChange({
      ...selection,
      podIds: checked
        ? [...selection.podIds, podId]
        : selection.podIds.filter((id) => id !== podId),
    });
  };

  // The Pods area shows exactly one of: loading, error, empty, no-search-match,
  // or the checkbox list.
  const renderPodItems = () => {
    if (isLoading) {
      return (
        <DropdownMenuItem
          label={t`Loading`}
          disabled
          endComponent={<Spinner size="xs" />}
        />
      );
    }
    if (isError) {
      return <DropdownMenuItem label={t`Failed to load Pods`} disabled />;
    }
    if (pods.length === 0) {
      return (
        <DropdownMenuItem label={t`No Pods with their own policy`} disabled />
      );
    }
    if (filteredPods.length === 0) {
      return <DropdownMenuItem label={t`No matching Pods`} disabled />;
    }
    return filteredPods.map((pod) => (
      <DropdownMenuCheckboxItem
        key={pod.sId}
        label={pod.name}
        icon={podIcon(pod)}
        checked={selectedPodIds.has(pod.sId)}
        onCheckedChange={(checked) => togglePod(pod.sId, checked === true)}
        onSelect={(event) => {
          event.preventDefault();
        }}
      />
    ));
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
          label={labelForSelection(selection, pods, t)}
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
          label={t`Workspace`}
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
        <DropdownMenuLabel label={t`Pods`} />
        <DropdownMenuSearchbar
          autoFocus
          name="search-pods"
          placeholder={t`Search Pods`}
          value={searchText}
          onChange={setSearchText}
          disabled={isLoading}
        />
        <DropdownMenuItem
          label={allPodsSelected ? t`Clear all` : t`Select all`}
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
        {renderPodItems()}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          label={t`Reset`}
          disabled={selection.includeWorkspace && selection.podIds.length === 0}
          onClick={() => onChange({ includeWorkspace: true, podIds: [] })}
          onSelect={(event) => {
            event.preventDefault();
          }}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
