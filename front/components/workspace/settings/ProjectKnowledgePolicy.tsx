import { useProjectKnowledgePolicy } from "@app/hooks/useProjectKnowledgePolicy";
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

const PROJECT_KNOWLEDGE_POLICIES = [
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

export function ProjectKnowledgePolicy({ owner }: { owner: WorkspaceType }) {
  const {
    allowManualProjectKnowledgeManagement,
    isChanging,
    doUpdateProjectKnowledgePolicy,
  } = useProjectKnowledgePolicy({ owner });

  const selectedPolicy = PROJECT_KNOWLEDGE_POLICIES.find(
    (policy) =>
      policy.allowManualProjectKnowledgeManagement ===
      allowManualProjectKnowledgeManagement
  );

  return (
    <ContextItem
      title="Pod files policy"
      subElement="Control whether members can manually add files to Pods."
      visual={<BookOpen01 className="h-6 w-6" />}
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
