import { GovernanceSettingRowLayout } from "@app/components/pages/workspace/governance/GovernanceSettingRowLayout";
import { usePodKnowledgePolicy } from "@app/hooks/usePodKnowledgePolicy";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { WorkspaceType } from "@app/types/user";
import {
  BookOpen01,
  Button,
  ContextItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Lock01,
} from "@dust-tt/sparkle";

const POD_KNOWLEDGE_POLICIES = [
  {
    value: "enabled",
    label: "Manual updates allowed",
    description: "Members can manually add files to Pod.",
    icon: BookOpen01,
    allowManualProjectKnowledgeManagement: true,
  },
  {
    value: "disabled",
    label: "Manual updates disabled",
    description: "Members cannot manually add files to Pod.",
    icon: Lock01,
    allowManualProjectKnowledgeManagement: false,
  },
] as const;

type PodKnowledgePolicy = (typeof POD_KNOWLEDGE_POLICIES)[number];

export function PodKnowledgePolicy({ owner }: { owner: WorkspaceType }) {
  const {
    allowManualPodKnowledgeManagement,
    isChanging,
    doUpdatePodKnowledgePolicy,
  } = usePodKnowledgePolicy({ owner });
  const { hasFeature } = useFeatureFlags();

  const selectedPolicy = POD_KNOWLEDGE_POLICIES.find(
    (policy) =>
      policy.allowManualProjectKnowledgeManagement ===
      allowManualPodKnowledgeManagement
  );

  const label = "Pod files policy";
  const description = "Control whether members can manually add files to Pods.";

  if (hasFeature("admin_governance")) {
    return (
      <GovernanceSettingRowLayout
        label={label}
        description={description}
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

  return (
    <ContextItem
      title={label}
      subElement={description}
      visual={<BookOpen01 className="h-6 w-6" />}
      hasSeparatorIfLast={true}
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
          icon={selectedPolicy?.icon}
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
              icon={policy.icon}
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
