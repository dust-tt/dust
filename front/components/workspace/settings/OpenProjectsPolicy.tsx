import { useOpenProjectsPolicy } from "@app/hooks/useOpenProjectsPolicy";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  ContextItem,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  SpaceClosedIcon,
  SpaceOpenIcon,
} from "@dust-tt/sparkle";

const OPEN_PROJECTS_POLICIES = [
  {
    value: "private_and_open",
    label: "Private and open projects",
    description: "Members can create either private or open projects.",
    icon: SpaceOpenIcon,
    allowOpenProjects: true,
  },
  {
    value: "private_only",
    label: "Private projects only",
    description: "Members can only create private projects.",
    icon: SpaceClosedIcon,
    allowOpenProjects: false,
  },
] as const;

export function OpenProjectsPolicy({ owner }: { owner: WorkspaceType }) {
  const { featureFlags } = useFeatureFlags();
  const { allowOpenProjects, isChanging, doUpdateOpenProjectsPolicy } =
    useOpenProjectsPolicy({ owner });

  if (!featureFlags.includes("projects")) {
    return null;
  }

  const selectedPolicy = OPEN_PROJECTS_POLICIES.find(
    (policy) => policy.allowOpenProjects === allowOpenProjects
  );

  return (
    <ContextItem
      title="Project visibility policy"
      subElement="Control whether projects can be private only or private and open."
      visual={<SpaceClosedIcon className="h-6 w-6" />}
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
