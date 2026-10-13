import { createSpaceAndGroup } from "@app/lib/api/spaces";
import { FeatureFlagResource } from "@app/lib/resources/feature_flag_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
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
import { assertNever } from "@app/types/shared/utils/assert_never";
import * as path from "path";

const ASSETS_DIR = path.join(__dirname, "assets");
const POD_NAME = "Frames v2 playground";
const VIEWER_POD_ACCESS = ["none", "member"] as const;

interface FrameSeed {
  assetFolder: string;
  conversationSId: string;
  conversationTitle: string;
  inPod?: boolean;
  shareScope?: FileShareScope;
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
  {
    assetFolder: "PublicTodo",
    conversationSId: "SeedFrameConv03",
    inPod: true,
    conversationTitle: "Frames v2: public todo list",
    userMessage: "Build a todo list anyone with the link can edit.",
    agentMessage:
      "I published the **PublicTodo** Frame in this Pod. Listing, adding and ticking todos are " +
      "`public` fast functions. Clearing done todos and resetting the sample data are " +
      "`frame_author_required`.",
  },
  {
    assetFolder: "FeedbackForm",
    conversationSId: "SeedFrameConv04",
    inPod: true,
    conversationTitle: "Frames v2: public feedback form",
    userMessage: "Build a feedback form for our customers.",
    agentMessage:
      "I published the **FeedbackForm** Frame in this Pod. Submitting is a `public` fast " +
      "function that only returns `{ ok }`. Reading the responses is `frame_author_required`.",
  },
  {
    assetFolder: "TeamDirectory",
    conversationSId: "SeedFrameConv05",
    inPod: true,
    conversationTitle: "Frames v2: public team directory",
    userMessage: "Build a team directory with private details for me only.",
    agentMessage:
      "I published the **TeamDirectory** Frame in this Pod. `list-people` and `whoami` are " +
      "`public`: private people and fields are returned only when `isFrameAuthor` is true. " +
      "Editing is `frame_author_required`.",
  },
  {
    assetFolder: "StatusDashboard",
    conversationSId: "SeedFrameConv06",
    inPod: true,
    conversationTitle: "Frames v2: public status dashboard",
    userMessage: "Build a status dashboard refreshed from a Dust tool.",
    agentMessage:
      "I published the **StatusDashboard** Frame in this Pod. `get-dashboard` is a `public` " +
      "fast read of the stored snapshot, and `probe-tools` shows a public function cannot call " +
      "Dust tools. `refresh-dashboard` is durable, calls a Dust tool and is " +
      "`frame_author_required`.",
  },
];

async function getOrCreatePod({ auth, logger }: SeedContext) {
  const existing = await SpaceResource.fetchByName(auth, POD_NAME);
  if (existing) {
    logger.info({ podId: existing.sId }, "Pod already exists");
    return existing;
  }

  const created = await createSpaceAndGroup(auth, {
    name: POD_NAME,
    isRestricted: false,
    spaceKind: "project",
  });
  if (created.isErr()) {
    throw created.error;
  }
  logger.info({ podId: created.value.sId }, "Pod created");

  return created.value;
}

type ViewerPodAccess = (typeof VIEWER_POD_ACCESS)[number];

function isViewerPodAccess(value: unknown): value is ViewerPodAccess {
  return VIEWER_POD_ACCESS.some((access) => access === value);
}

async function setViewerPodAccess(
  { auth, logger }: SeedContext,
  pod: SpaceResource,
  viewer: UserResource,
  viewerPodAccess: ViewerPodAccess
) {
  switch (viewerPodAccess) {
    case "member": {
      const added = await pod.addMembers(auth, { userIds: [viewer.sId] });
      if (added.isErr() && added.error.code !== "user_already_member") {
        throw added.error;
      }
      break;
    }
    case "none": {
      const removed = await pod.removeMembers(auth, { userIds: [viewer.sId] });
      if (removed.isErr() && removed.error.code !== "user_not_member") {
        throw removed.error;
      }
      break;
    }
    default:
      assertNever(viewerPodAccess);
  }
  logger.info({ viewerPodAccess }, "Viewer Pod access set");
}

// Login matches users by WorkOS id, so the viewer must sign in once before this runs.
async function addViewer(
  { workspace, logger }: SeedContext,
  viewerEmail: string
): Promise<UserResource> {
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

  return viewer;
}

makeScript(
  {
    viewerEmail: {
      type: "string",
      description: "Email of a second user to add as a workspace member.",
    },
    viewerPodAccess: {
      type: "string",
      choices: [...VIEWER_POD_ACCESS],
      description:
        "Pod access of the viewer: `member` gives them write access to the Pod Frames, `none` " +
        "removes it. Requires --viewerEmail.",
    },
  },
  async ({ execute, viewerEmail, viewerPodAccess }, logger) => {
    if (viewerPodAccess !== undefined && !viewerEmail) {
      throw new Error("--viewerPodAccess requires --viewerEmail.");
    }

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
      "frames_v2_public_functions",
    ]);

    const pod = await getOrCreatePod(ctx);
    const frameAssets: FrameAsset[] = FRAMES.map((frame) => ({
      name: frame.assetFolder,
      sourceDir: path.join(ASSETS_DIR, frame.assetFolder),
      conversationId: frame.conversationSId,
      podId: frame.inPod ? pod.sId : undefined,
      shareScope: frame.shareScope,
    }));

    const conversations: ConversationAsset[] = FRAMES.map((frame, i) => {
      const manifestPath = getFrameManifestPath(frameAssets[i]);
      const framePreview = `:preview_file{path="${manifestPath}" title="${frame.assetFolder}" contentType="${frameV2ContentType}"}`;

      return {
        sId: frame.conversationSId,
        title: frame.conversationTitle,
        userId: ctx.user.sId,
        spaceId: frame.inPod ? pod.sId : undefined,
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
      const viewer = await addViewer(ctx, viewerEmail);
      if (isViewerPodAccess(viewerPodAccess)) {
        await setViewerPodAccess(ctx, pod, viewer, viewerPodAccess);
      }
    }
  }
);
