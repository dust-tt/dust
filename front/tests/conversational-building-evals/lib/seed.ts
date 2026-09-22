import { Authenticator } from "@app/lib/auth";
import { convertMarkdownToBlockHtml } from "@app/lib/editor/skill_instructions_html";
import type {
  SeededScenario,
  TestCase,
} from "@app/tests/conversational-building-evals/lib/types";
import { runInCommittedTransaction } from "@app/tests/utils/eval_workspace";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";

/**
 * Creates the scenario's workspace, an admin member, and the seeded skills, then returns that
 * member's authenticator. One workspace per scenario keeps the listing tools isolated when
 * scenarios run concurrently. The `suggest_*` tools need an interactive user with write access,
 * which is why the skills are created by (and the run executes as) a real member rather than the
 * internal admin.
 */
export async function seedScenario(
  testCase: TestCase
): Promise<SeededScenario> {
  return runInCommittedTransaction(async () => {
    const workspace = await WorkspaceFactory.basic();
    const user = await UserFactory.basic();
    await SpaceFactory.defaults(
      await Authenticator.internalAdminForWorkspace(workspace.sId)
    );
    await MembershipFactory.associate(workspace, user, { role: "admin" });
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const memberIdsByKey = new Map<string, string>();
    for (const member of testCase.workspaceSeed.members ?? []) {
      const memberUser = await UserFactory.withName(
        member.firstName,
        member.lastName
      );
      await MembershipFactory.associate(workspace, memberUser, {
        role: "user",
      });
      memberIdsByKey.set(member.key, memberUser.sId);
    }

    const skillIdsByKey = new Map<string, string>();
    for (const seed of testCase.workspaceSeed.skills) {
      const skill = await SkillFactory.create(auth, {
        name: seed.name,
        agentFacingDescription: seed.agentFacingDescription,
        userFacingDescription: seed.userFacingDescription ?? "",
        instructions: seed.instructions,
        instructionsHtml: convertMarkdownToBlockHtml(seed.instructions),
        availability: seed.availability,
      });
      skillIdsByKey.set(seed.key, skill.sId);
    }

    // Pick up the editor group memberships created alongside the skills.
    await auth.refresh();

    return { auth, skillIdsByKey, memberIdsByKey };
  });
}
