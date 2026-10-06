import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { POD_KNOWLEDGE_POLICIES } from "@app/components/workspace/settings/settings_metadata";
import { usePodKnowledgePolicy } from "@app/hooks/usePodKnowledgePolicy";
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

type PodKnowledgePolicy = (typeof POD_KNOWLEDGE_POLICIES)[number];

const POD_KNOWLEDGE_POLICY_TEXTS: Record<
  PodKnowledgePolicy["value"],
  { label: MessageDescriptor; description: MessageDescriptor }
> = {
  enabled: {
    label: msg`Manual updates allowed`,
    description: msg`Members can manually add files to Pods`,
  },
  disabled: {
    label: msg`Manual updates disabled`,
    description: msg`Members cannot manually add files to Pods`,
  },
};

interface PodKnowledgePolicyProps {
  owner: WorkspaceType;
}

export function PodKnowledgePolicy({ owner }: PodKnowledgePolicyProps) {
  const { t } = useLingui();
  const {
    allowManualPodKnowledgeManagement,
    isChanging,
    doUpdatePodKnowledgePolicy,
  } = usePodKnowledgePolicy({ owner });

  const selectedPolicy = POD_KNOWLEDGE_POLICIES.find(
    (policy) =>
      policy.allowManualProjectKnowledgeManagement ===
      allowManualPodKnowledgeManagement
  );

  return (
    <GovernanceSettingRowLayout
      label={t`Pod files`}
      description={t`Whether members can manually add files to Pods`}
      action={
        <PodKnowledgePolicyDropdown
          selectedPolicy={selectedPolicy}
          isChanging={isChanging}
          doUpdatePodKnowledgePolicy={doUpdatePodKnowledgePolicy}
        />
      }
    />
  );
}

interface PodKnowledgePolicyDropdownProps {
  selectedPolicy?: PodKnowledgePolicy;
  isChanging: boolean;
  doUpdatePodKnowledgePolicy: (
    allowManualProjectKnowledgeManagement: boolean
  ) => Promise<boolean>;
}

const PodKnowledgePolicyDropdown = ({
  selectedPolicy,
  isChanging,
  doUpdatePodKnowledgePolicy,
}: PodKnowledgePolicyDropdownProps) => {
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
              ? t(POD_KNOWLEDGE_POLICY_TEXTS[selectedPolicy.value].label)
              : undefined
          }
          disabled={isChanging}
          className="grid grid-cols-[auto_1fr_auto] truncate"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-w-90">
        <DropdownMenuRadioGroup value={selectedPolicy?.value}>
          {POD_KNOWLEDGE_POLICIES.map((policy) => (
            <DropdownMenuRadioItem
              key={policy.value}
              value={policy.value}
              label={t(POD_KNOWLEDGE_POLICY_TEXTS[policy.value].label)}
              description={t(
                POD_KNOWLEDGE_POLICY_TEXTS[policy.value].description
              )}
              onClick={() =>
                void doUpdatePodKnowledgePolicy(
                  policy.allowManualProjectKnowledgeManagement
                )
              }
            />
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
