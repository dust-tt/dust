import { useSetPokePageTitle } from "@app/components/poke/PokeLayout";
import { SkillOverviewTable } from "@app/components/poke/skills/SkillOverviewTable";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import {
  usePokeSkillDetails,
  usePokeSkillVersions,
} from "@app/poke/swr/skill_details";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  LinkWrapper,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import { JsonViewer } from "@textea/json-viewer";

export function SkillDetailsPage() {
  const owner = useWorkspace();
  useSetPokePageTitle(`${owner.name} - Skill`);

  const sId = useRequiredPathParam("sId");
  const { isDark } = useTheme();

  const {
    data: skillDetails,
    isLoading,
    isError,
  } = usePokeSkillDetails({
    owner,
    skillId: sId,
    disabled: false,
  });

  const { versions, isLoading: isLoadingVersions } = usePokeSkillVersions({
    owner,
    skillId: sId,
    disabled: false,
  });

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !skillDetails) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Error loading skill details.</p>
      </div>
    );
  }

  const { skill, editedByUser, spaces } = skillDetails;

  return (
    <div>
      <h3 className="text-xl font-bold">
        Skill {skill.name} from workspace&nbsp;
        <LinkWrapper href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </LinkWrapper>
      </h3>

      <div className="mt-4 flex flex-row items-stretch space-x-3">
        <SkillOverviewTable
          skill={skill}
          editedByUser={editedByUser}
          spaces={spaces}
        />
      </div>

      <div className="mt-4 flex flex-row gap-4">
        <div className="border-material-200 flex-1 rounded-lg border p-4">
          <h2 className="text-md pb-4 font-bold">User-facing description</h2>
          <TextArea
            value={skill.userFacingDescription}
            readOnly
            minRows={4}
            resize="none"
            isDisplay
          />
        </div>
        <div className="border-material-200 flex-1 rounded-lg border p-4">
          <h2 className="text-md pb-4 font-bold">Agent-facing description</h2>
          <TextArea
            value={skill.agentFacingDescription}
            readOnly
            minRows={4}
            resize="none"
            isDisplay
          />
        </div>
      </div>

      <div className="mt-4">
        <div className="border-material-200 rounded-lg border p-4">
          <h2 className="text-md pb-4 font-bold">Instructions</h2>
          <TextArea
            value={skill.instructions ?? ""}
            readOnly
            resize="none"
            isDisplay
          />
        </div>
      </div>

      <div className="mt-4">
        <div className="border-material-200 rounded-lg border p-4">
          <h2 className="text-md pb-4 font-bold">
            Tools ({skill.tools.length})
          </h2>
          {skill.tools.map((tool, index) => (
            <div key={index} className="mb-4">
              <div className="text-sm font-medium">{tool.name}</div>
              <JsonViewer
                theme={isDark ? "dark" : "light"}
                value={tool}
                rootName={false}
                defaultInspectDepth={1}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <div className="border-material-200 rounded-lg border p-4">
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger>
              <h2 className="text-md font-bold">
                Versions ({isLoadingVersions ? "..." : versions.length})
              </h2>
            </CollapsibleTrigger>
            <CollapsibleContent>
              {isLoadingVersions ? (
                <div className="flex h-32 items-center justify-center">
                  <Spinner />
                </div>
              ) : versions.length === 0 ? (
                <p className="text-muted-foreground dark:text-muted-foreground-night py-4 text-sm">
                  No previous versions.
                </p>
              ) : (
                <div className="mt-4 space-y-4">
                  {versions.map((version) => (
                    <div
                      key={version.version}
                      className="border-material-200 rounded-lg border p-4"
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span className="font-bold">v{version.version}</span>
                        <span className="text-foreground dark:text-foreground-night">
                          {version.createdAt
                            ? formatTimestampToFriendlyDate(version.createdAt)
                            : "N/A"}
                        </span>
                      </div>
                      <JsonViewer
                        theme={isDark ? "dark" : "light"}
                        value={version}
                        rootName={false}
                        defaultInspectDepth={1}
                      />
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </div>
  );
}
