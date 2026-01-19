import { Spinner, TextArea } from "@dust-tt/sparkle";
import { JsonViewer } from "@textea/json-viewer";
import Link from "next/link";

import { SkillOverviewTable } from "@app/components/poke/skills/SkillOverviewTable";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { usePokeSkillDetails } from "@app/poke/swr/skill_details";
import type { WorkspaceType } from "@app/types";

interface SkillDetailsPageProps {
  owner: WorkspaceType;
  sId: string;
}

export function SkillDetailsPage({ owner, sId }: SkillDetailsPageProps) {
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
        <Link href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </Link>
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
    </div>
  );
}
