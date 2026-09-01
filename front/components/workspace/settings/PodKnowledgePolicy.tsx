import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
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

export const POD_KNOWLEDGE_POLICIES = [
  {
    value: "enabled",
    label: "Manual updates allowed",
    description: "Members can manually add files to Pod",
    allowManualProjectKnowledgeManagement: true,
  },
  {
    value: "disabled",
    label: "Manual updates disabled",
    description: "Members cannot manually add files to Pod",
    allowManualProjectKnowledgeManagement: false,
  },
] as const;

type PodKnowledgePolicy = (typeof POD_KNOWLEDGE_POLICIES)[number];

export const POD_KNOWLEDGE_LABEL = "Pod files";
export const POD_KNOWLEDGE_DESCRIPTION =
  "Whether members can manually add files to Pods";

export function PodKnowledgePolicy({ owner }: { owner: WorkspaceType }) {
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
      label={POD_KNOWLEDGE_LABEL}
      description={POD_KNOWLEDGE_DESCRIPTION}
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
      <DropdownMenuContent align="end" className="max-w-90">
        <DropdownMenuRadioGroup value={selectedPolicy?.value}>
          {POD_KNOWLEDGE_POLICIES.map((policy) => (
            <DropdownMenuRadioItem
              key={policy.value}
              value={policy.value}
              label={policy.label}
              description={policy.description}
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
