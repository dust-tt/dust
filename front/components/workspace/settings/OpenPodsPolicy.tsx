import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { OPEN_PODS_POLICIES } from "@app/components/workspace/settings/settings_metadata";
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
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";

type OpenPodPolicy = (typeof OPEN_PODS_POLICIES)[number];

const OPEN_PODS_POLICY_TEXTS: Record<
  OpenPodPolicy["value"],
  { label: MessageDescriptor; description: MessageDescriptor }
> = {
  private_and_open: {
    label: msg`Restricted and open Pods`,
    description: msg`Members can create either restricted or open Pods`,
  },
  private_only: {
    label: msg`Restricted Pods only`,
    description: msg`Members can only create restricted Pods`,
  },
};

interface OpenPodPolicyProps {
  owner: WorkspaceType;
}

export function OpenPodPolicy({ owner }: OpenPodPolicyProps) {
  const { t } = useLingui();
  const { allowOpenPods, isChanging, doUpdateOpenPodsPolicy } =
    useOpenPodsPolicy({ owner });

  const selectedPolicy = OPEN_PODS_POLICIES.find(
    (policy) => policy.allowOpenProjects === allowOpenPods
  );

  return (
    <GovernanceSettingRowLayout
      label={t`Restricted and open Pods`}
      description={t`Whether members are allowed to create open Pods`}
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
  const { t } = useLingui();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          isSelect
          label={
            selectedPolicy
              ? t(OPEN_PODS_POLICY_TEXTS[selectedPolicy.value].label)
              : undefined
          }
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
              label={t(OPEN_PODS_POLICY_TEXTS[policy.value].label)}
              description={t(OPEN_PODS_POLICY_TEXTS[policy.value].description)}
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
