import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { makeScript } from "@app/scripts/helpers";
import type {
  ConversationAsset,
  FrameAsset,
  SeedContext,
} from "@app/scripts/seed/factories";
import {
  createSeedContext,
  WORKSPACE_SID,
  getFrameManifestPath,
  seedConversations,
  seedFrames,
} from "@app/scripts/seed/factories";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { FileShareScope } from "@app/types/files";
import { frameV2ContentType } from "@app/types/files";
import * as path from "path";

const ASSETS_DIR = path.join(__dirname, "assets");

interface FrameSeed {
  assetFolder: string;
  conversationSId: string;
  conversationTitle: string;
  shareScope: FileShareScope;
  userMessage: string;
  agentMessage: string;
}

const FRAMES: FrameSeed[] = [
  {
    assetFolder: "SalesDashboard",
    conversationSId: "SeedFrameConv01",
    shareScope: "public",
    conversationTitle: "Frames v2: client-only Frame",
    userMessage: "Build me a dashboard of quarterly sales by region.",
    agentMessage:
      "I published the **SalesDashboard** Frame and shared it publicly. It is client-only: no " +
      "functions and no database. Open it below and switch quarters with the buttons.",
  },
  {
    assetFolder: "TeamTasks",
    conversationSId: "SeedFrameConv02",
    shareScope: "workspace_and_emails",
    conversationTitle: "Frames v2: functions and database",
    userMessage:
      "Build me a shared task list for the team, stored in a database.",
    agentMessage:
      "I published the **TeamTasks** Frame and shared it with the workspace. Each function " +
      "uses a different caller policy: `list-tasks` and `toggle-task` accept any workspace " +
      "member (`workspace_user_required`), `add-task` needs a live session " +
      "(`interactive_workspace_user_required`), and `delete-task` is for the author only " +
      "(`frame_author_required`, which follows access to this conversation). Open it below: " +
      "the first call wakes the sandbox and takes a few seconds.",
  },
];

// Login matches users by WorkOS id, so the viewer must sign in once before this runs.
async function addViewer(
  { workspace, logger }: SeedContext,
  viewerEmail: string
) {
  const viewer = await UserResource.fetchByEmail(viewerEmail);
  if (!viewer) {
    throw new Error(
      `No user with email ${viewerEmail}. Sign in once with that email, then re-run the seed.`
    );
  }

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user: viewer,
      workspace,
    });
  if (!membership) {
    await MembershipResource.createMembership({
      user: viewer,
      workspace,
      role: "user",
    });
  }
  logger.info({ viewerEmail }, "Viewer added to the workspace");
}

makeScript(
  {
    viewerEmail: {
      type: "string",
      description: "Email of a second user to add as a workspace member.",
    },
  },
  async ({ execute, viewerEmail }, logger) => {
    if (!execute) {
      logger.info(
        { frames: FRAMES.map((frame) => frame.assetFolder) },
        "[DRYRUN]: Would enable Frames v2 flags, allow public sharing and publish these Frames"
      );
      return;
    }

    const workspace = await WorkspaceResource.fetchById(WORKSPACE_SID);
    if (!workspace) {
      throw new Error(`Workspace ${WORKSPACE_SID} not found.`);
    }
    await workspace.updateWorkspaceSettings({ sharingPolicy: "all_scopes" });

    const ctx = await createSeedContext({ execute, logger });

    await FeatureFlagResource.enableMany(ctx.workspace, [
      "frames_v2",
      "frames_v2_functions",
    ]);

    const frameAssets: FrameAsset[] = FRAMES.map((frame) => ({
      name: frame.assetFolder,
      sourceDir: path.join(ASSETS_DIR, frame.assetFolder),
      conversationId: frame.conversationSId,
      shareScope: frame.shareScope,
    }));

    const conversations: ConversationAsset[] = FRAMES.map((frame, i) => {
      const manifestPath = getFrameManifestPath(frameAssets[i]);
      const framePreview = `:preview_file{path="${manifestPath}" title="${frame.assetFolder}" contentType="${frameV2ContentType}"}`;

      return {
        sId: frame.conversationSId,
        title: frame.conversationTitle,
        userId: ctx.user.sId,
        exchanges: [
          {
            user: { sId: `SeedFrameUMsg0${i + 1}`, content: frame.userMessage },
            agent: {
              sId: `SeedFrameAMsg0${i + 1}`,
              content: `${frame.agentMessage}\n\n${framePreview}`,
            },
          },
        ],
      };
    });
    await seedConversations(ctx, conversations, {
      defaultAgentId: GLOBAL_AGENTS_SID.DUST,
      additionalUsers: new Map([[ctx.user.sId, ctx.user]]),
    });

    await seedFrames(ctx, frameAssets);

    if (viewerEmail) {
      await addViewer(ctx, viewerEmail);
    }
  }
);
