import { useOpenProjectsPolicy } from "@app/hooks/useOpenProjectsPolicy";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  ContextItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  SpaceClosed,
  SpaceOpen,
} from "@dust-tt/sparkle";

const OPEN_PROJECTS_POLICIES = [
  {
    value: "private_and_open",
    label: "Restricted and open Pods",
    description: "Members can create either restricted or open Pods.",
    icon: SpaceOpen,
    allowOpenProjects: true,
  },
  {
    value: "private_only",
    label: "Restricted Pods only",
    description: "Members can only create restricted Pods.",
    icon: SpaceClosed,
    allowOpenProjects: false,
  },
] as const;

export function OpenProjectsPolicy({ owner }: { owner: WorkspaceType }) {
  const { allowOpenProjects, isChanging, doUpdateOpenProjectsPolicy } =
    useOpenProjectsPolicy({ owner });

  const selectedPolicy = OPEN_PROJECTS_POLICIES.find(
    (policy) => policy.allowOpenProjects === allowOpenProjects
  );

  return (
    <ContextItem
      title="Pod access policy"
      subElement="Control whether Pods can be restricted only or restricted and open."
      visual={<SpaceClosed className="h-6 w-6" />}
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
          <DropdownMenuContent align="end" className="max-w-[320px]">
            <DropdownMenuRadioGroup value={selectedPolicy?.value}>
              {OPEN_PROJECTS_POLICIES.map((policy) => (
                <DropdownMenuRadioItem
                  key={policy.value}
                  value={policy.value}
                  label={policy.label}
                  description={policy.description}
                  icon={policy.icon}
                  onClick={() =>
                    void doUpdateOpenProjectsPolicy(policy.allowOpenProjects)
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
