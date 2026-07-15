import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { useOpenPodsPolicy } from "@app/hooks/useOpenProjectsPolicy";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  ContextItem,
  Cube01,
  CubeOutline,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@dust-tt/sparkle";

const OPEN_PODS_POLICIES = [
  {
    value: "private_and_open",
    label: "Restricted and open Pods",
    description: "Members can create either restricted or open Pods.",
    icon: Cube01,
    allowOpenProjects: true,
  },
  {
    value: "private_only",
    label: "Restricted Pods only",
    description: "Members can only create restricted Pods.",
    icon: CubeOutline,
    allowOpenProjects: false,
  },
] as const;

type OpenPodPolicy = (typeof OPEN_PODS_POLICIES)[number];

export function OpenPodPolicy({ owner }: { owner: WorkspaceType }) {
  const { allowOpenPods, isChanging, doUpdateOpenPodsPolicy } =
    useOpenPodsPolicy({ owner });
  const { hasFeature } = useFeatureFlags();

  const selectedPolicy = OPEN_PODS_POLICIES.find(
    (policy) => policy.allowOpenProjects === allowOpenPods
  );

  const label = "Pod access policy";
  const description =
    "Control whether Pods can be restricted only or restricted and open.";

  if (hasFeature("admin_governance")) {
    return (
      <GovernanceSettingRowLayout
        label={label}
        description={description}
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

  return (
    <ContextItem
      title={label}
      subElement={description}
      visual={<CubeOutline className="h-6 w-6" />}
      hasSeparatorIfLast={true}
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
          icon={selectedPolicy?.icon}
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
              icon={policy.icon}
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
