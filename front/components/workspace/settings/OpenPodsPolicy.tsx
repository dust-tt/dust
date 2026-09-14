import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useOpenPodsPolicy } from "@app/hooks/useOpenPodsPolicy";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

export const OPEN_PODS_POLICIES = [
  {
    value: "private_and_open",
    label: "Restricted and open Pods",
    description: "Members can create either restricted or open Pods",
    allowOpenProjects: true,
  },
  {
    value: "private_only",
    label: "Restricted Pods only",
    description: "Members can only create restricted Pods",
    allowOpenProjects: false,
  },
] as const;

export const OPEN_PODS_LABEL = "Restricted and Open Pods";
export const OPEN_PODS_DESCRIPTION =
  "Whether members are allowed to create open pods";

type OpenPodPolicy = (typeof OPEN_PODS_POLICIES)[number];

export function OpenPodPolicy({ owner }: { owner: WorkspaceType }) {
  const { allowOpenPods, isChanging, doUpdateOpenPodsPolicy } =
    useOpenPodsPolicy({ owner });

  const selectedPolicy = OPEN_PODS_POLICIES.find(
    (policy) => policy.allowOpenProjects === allowOpenPods
  );

  return (
    <GovernanceSettingRowLayout
      label={OPEN_PODS_LABEL}
      description={OPEN_PODS_DESCRIPTION}
      action={
        <OpenPodPolicyDropdown
          selectedPolicy={selectedPolicy}
          isChanging={isChanging}
          doUpdateOpenPodsPolicy={doUpdateOpenPodsPolicy}
        />
      }
    />
  );
}

interface OpenPodPolicyDropdownProps {
  selectedPolicy?: OpenPodPolicy;
  isChanging: boolean;
  doUpdateOpenPodsPolicy: (allowOpenProjects: boolean) => Promise<boolean>;
}

const OpenPodPolicyDropdown = ({
  selectedPolicy,
  isChanging,
  doUpdateOpenPodsPolicy,
}: OpenPodPolicyDropdownProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          isSelect
          label={selectedPolicy?.label}
          disabled={isChanging}
          className="grid grid-cols-[auto_1fr_auto] truncate"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-[320px]">
        <DropdownMenuRadioGroup value={selectedPolicy?.value}>
          {OPEN_PODS_POLICIES.map((policy) => (
            <DropdownMenuRadioItem
              key={policy.value}
              value={policy.value}
              label={policy.label}
              description={policy.description}
              onClick={() =>
                void doUpdateOpenPodsPolicy(policy.allowOpenProjects)
              }
            />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
