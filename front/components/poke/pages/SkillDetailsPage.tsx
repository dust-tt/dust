import { SelfImprovingSkillsConversationDataTable } from "@app/components/poke/conversation/self_improving_skills_table";
import { PluginList } from "@app/components/poke/plugins/PluginList";
import { SkillSuggestionDataTable } from "@app/components/poke/skill_suggestions/table";
import { SkillOverviewTable } from "@app/components/poke/skills/SkillOverviewTable";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import { usePokePageMetadata } from "@app/poke/swr/currentPage";
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

  usePokePageMetadata({
    name: skillDetails?.skill.name,
    subtitle: owner.name,
    sId,
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

  const { skill, editedByUser, spaces, agentsUsage, usedBySkills } =
    skillDetails;

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
        <div className="flex flex-grow flex-col">
          <PluginList
            pluginResourceTarget={{
              resourceId: sId,
              resourceType: "skills",
              workspace: owner,
            }}
          />
        </div>
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
          <h2 className="text-md pb-4 font-bold">Instructions HTML</h2>
          <TextArea
            value={skill.instructionsHtml ?? ""}
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
                Used by ({agentsUsage.count} agents, {usedBySkills.length}{" "}
                skills)
              </h2>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-4 flex flex-row gap-4">
                <div className="flex-1">
                  <h3 className="pb-2 text-sm font-bold">
                    Agents ({agentsUsage.count})
                  </h3>
                  {agentsUsage.agents.length === 0 ? (
                    <p className="text-muted-foreground dark:text-muted-foreground-night text-sm">
                      No agents use this skill.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {agentsUsage.agents.map((agent) => (
                        <div key={agent.sId}>
                          <LinkWrapper
                            href={`/poke/${owner.sId}/assistants/${agent.sId}`}
                            className="text-highlight-500"
                          >
                            {agent.name}
                          </LinkWrapper>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="pb-2 text-sm font-bold">
                    Skills ({usedBySkills.length})
                  </h3>
                  {usedBySkills.length === 0 ? (
                    <p className="text-muted-foreground dark:text-muted-foreground-night text-sm">
                      No skills use this skill.
                    </p>
                  ) : (
                    <div className="space-y-1">
                      {usedBySkills.map((usedBySkill) => (
                        <div key={usedBySkill.sId}>
                          <LinkWrapper
                            href={`/poke/${owner.sId}/skills/${usedBySkill.sId}`}
                            className="text-highlight-500"
                          >
                            {usedBySkill.name}
                          </LinkWrapper>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>

      <div className="mt-4">
        <SelfImprovingSkillsConversationDataTable owner={owner} skillId={sId} />
      </div>

      <SkillSuggestionDataTable owner={owner} skillId={sId} />

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
