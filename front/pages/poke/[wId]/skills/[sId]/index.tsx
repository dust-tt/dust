import { TextArea } from "@dust-tt/sparkle";
import { JsonViewer } from "@textea/json-viewer";
import type { InferGetServerSidePropsType } from "next";
import Link from "next/link";
import type { ReactElement } from "react";

import PokeLayout from "@app/components/poke/PokeLayout";
import { SkillOverviewTable } from "@app/components/poke/skills/SkillOverviewTable";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { SpaceType, UserType, WorkspaceType } from "@app/types";
import { isString } from "@app/types";
import type { SkillType } from "@app/types/assistant/skill_configuration";

export const getServerSideProps = withSuperUserAuthRequirements<{
  skill: SkillType;
  author: UserType | null;
  spaces: SpaceType[];
  owner: WorkspaceType;
}>(async (context, auth) => {
  const sId = context.params?.sId;
  if (!isString(sId)) {
    return {
      notFound: true,
    };
  }

  const skill = await SkillResource.fetchById(auth, sId);

  if (!skill) {
    return {
      notFound: true,
    };
  }

  const serializedSkill = skill.toJSON(auth);
  const author = await skill.fetchAuthor(auth);
  const spaces = await SpaceResource.fetchByIds(
    auth,
    serializedSkill.requestedSpaceIds
  );

  return {
    props: {
      owner: auth.getNonNullableWorkspace(),
      skill: serializedSkill,
      author: author ? author.toJSON() : null,
      spaces: spaces.map((s) => s.toJSON()),
    },
  };
});

const SkillDetailsPage = ({
  owner,
  skill,
  author,
  spaces,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { isDark } = useTheme();

  return (
    <div>
      <h3 className="text-xl font-bold">
        Skill {skill.name} from workspace&nbsp;
        <Link href={`/poke/${owner.sId}`} className="text-highlight-500">
          {owner.name}
        </Link>
      </h3>

      <div className="mt-4 flex flex-row items-stretch space-x-3">
        <SkillOverviewTable skill={skill} author={author} spaces={spaces} />
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
};

SkillDetailsPage.getLayout = (
  page: ReactElement,
  { owner, skill }: { owner: WorkspaceType; skill: SkillType }
) => {
  return (
    <PokeLayout title={`${owner.name} - ${skill.name}`}>{page}</PokeLayout>
  );
};

export default SkillDetailsPage;
