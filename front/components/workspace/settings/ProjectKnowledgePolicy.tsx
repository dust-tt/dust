import { useProjectKnowledgePolicy } from "@app/hooks/useProjectKnowledgePolicy";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { WorkspaceType } from "@app/types/user";
import {
  BookOpenIcon,
  Button,
  ContextItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  LockIcon,
} from "@dust-tt/sparkle";

const PROJECT_KNOWLEDGE_POLICIES = [
  {
    value: "enabled",
    label: "Manual updates allowed",
    description:
      "Members can manually add knowledge to project knowledge bases.",
    icon: BookOpenIcon,
    allowManualProjectKnowledgeManagement: true,
  },
  {
    value: "disabled",
    label: "Manual updates disabled",
    description:
      "Members cannot manually add knowledge to project knowledge bases.",
    icon: LockIcon,
    allowManualProjectKnowledgeManagement: false,
  },
] as const;

export function ProjectKnowledgePolicy({ owner }: { owner: WorkspaceType }) {
  const { featureFlags } = useFeatureFlags();
  const {
    allowManualProjectKnowledgeManagement,
    isChanging,
    doUpdateProjectKnowledgePolicy,
  } = useProjectKnowledgePolicy({ owner });

  if (!featureFlags.includes("projects")) {
    return null;
  }

  const selectedPolicy = PROJECT_KNOWLEDGE_POLICIES.find(
    (policy) =>
      policy.allowManualProjectKnowledgeManagement ===
      allowManualProjectKnowledgeManagement
  );

  return (
    <ContextItem
      title="Project knowledge base policy"
      subElement="Control whether members can manually add knowledge to project knowledge bases."
      visual={<BookOpenIcon className="h-6 w-6" />}
      hasSeparatorIfLast={true}
      action={
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
          <DropdownMenuContent align="end" className="max-w-[360px]">
            <DropdownMenuRadioGroup value={selectedPolicy?.value}>
              {PROJECT_KNOWLEDGE_POLICIES.map((policy) => (
                <DropdownMenuRadioItem
                  key={policy.value}
                  value={policy.value}
                  label={policy.label}
                  description={policy.description}
                  icon={policy.icon}
                  onClick={() =>
                    void doUpdateProjectKnowledgePolicy(
                      policy.allowManualProjectKnowledgeManagement
                    )
                  }
                />
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      }
    />
  );
}
