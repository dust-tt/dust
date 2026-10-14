// @vitest-environment node
import type { DfsFolderContext } from "@app/lib/api/dfs/folders";
import {
  getOrCreateConversationFolder,
  getOrCreatePodFolder,
  getOrCreateUserFolder,
} from "@app/lib/api/dfs/folders";
import { Authenticator } from "@app/lib/auth";
import { DfsClient } from "@app/lib/dfs/client";
import { DfsFileSystem } from "@app/lib/dfs/file_system";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { DfsUserFolderResource } from "@app/lib/resources/dfs_user_folder_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { FakeDfsTransport } from "@app/tests/utils/dfs/FakeDfsTransport";
import { InMemoryDfs } from "@app/tests/utils/dfs/InMemoryDfs";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it } from "vitest";

function setup() {
  const dfs = new InMemoryDfs();
  const transport = new FakeDfsTransport({ UpdateGrants: new Ok({}) });
  const context: DfsFolderContext = {
    fs: new DfsFileSystem(dfs),
    tenantClient: new DfsClient(transport, "t".repeat(64)),
    rootId: dfs.rootId,
  };
  return { dfs, transport, context };
}

async function createConversation(
  auth: Authenticator,
  { spaceModelId }: { spaceModelId?: number } = {}
) {
  const conversation = await ConversationFactory.create(auth, {
    agentConfigurationId: "dust",
    messagesCreatedAt: [],
    spaceId: spaceModelId,
  });
  const resource = await ConversationResource.fetchById(auth, conversation.sId);
  if (!resource) {
    throw new Error("Conversation not found.");
  }
  return resource;
}

describe("getOrCreateUserFolder", () => {
  it("creates the folder, restricts it to the user and stores it", async () => {
    const { authenticator, user } = await createResourceTest({});
    const { dfs, transport, context } = setup();

    const res = await getOrCreateUserFolder(authenticator, context, user);

    expect(res.isOk()).toBe(true);
    expect(dfs.paths()).toEqual(["/users", `/users/${user.email}`]);
    const stored = await DfsUserFolderResource.fetchByUser(authenticator, user);
    expect(res.isOk() && res.value).toBe(stored?.dfsObjectId);
    expect(transport.calls.map((c) => c.request)).toEqual([
      {
        objectId: { value: Buffer.from(stored?.dfsObjectId ?? "", "hex") },
        changes: [
          { grant: { deny: { mode: 6 } }, remove: false },
          {
            grant: { allow: { subject: `u:${user.email}`, mode: 6 } },
            remove: false,
          },
        ],
      },
    ]);
  });

  it("returns the stored folder without calling dfs", async () => {
    const { authenticator, user } = await createResourceTest({});
    const { dfs, transport, context } = setup();
    const first = await getOrCreateUserFolder(authenticator, context, user);
    const applyCalls = dfs.applyCalls.length;
    const grantCalls = transport.calls.length;

    const second = await getOrCreateUserFolder(authenticator, context, user);

    expect(second.isOk() && first.isOk() && second.value).toBe(
      first.isOk() && first.value
    );
    expect(dfs.applyCalls).toHaveLength(applyCalls);
    expect(transport.calls).toHaveLength(grantCalls);
  });

  it("reuses a folder that exists in dfs but is not stored, without changing its grants", async () => {
    const { authenticator, user } = await createResourceTest({});
    const { dfs, transport, context } = setup();
    const users = dfs.createDirectory(dfs.rootId, "users");
    const existing = dfs.createDirectory(users, user.email);

    const res = await getOrCreateUserFolder(authenticator, context, user);

    expect(res.isOk() && res.value).toBe(existing);
    expect(transport.calls).toHaveLength(0);
  });
});

describe("getOrCreatePodFolder", () => {
  it("creates the pod folder under the given user's folder", async () => {
    const { authenticator, workspace, user } = await createResourceTest({});
    const { dfs, context } = setup();
    const pod = await SpaceFactory.project(workspace);

    const res = await getOrCreatePodFolder(authenticator, context, pod, {
      user,
    });

    expect(res.isOk()).toBe(true);
    expect(dfs.paths()).toContain(`/users/${user.email}/pods/pod-${pod.sId}`);
    const stored = await SpaceResource.fetchById(authenticator, pod.sId);
    expect(res.isOk() && res.value).toBe(stored?.dfsObjectId);
  });

  it("uses the first editor of the pod when no user is given", async () => {
    const { authenticator, workspace } = await createResourceTest({});
    const { dfs, context } = setup();
    const editor = await UserFactory.basic();
    await MembershipFactory.associate(workspace, editor, { role: "user" });
    const pod = await SpaceFactory.project(workspace, editor.id);

    const res = await getOrCreatePodFolder(authenticator, context, pod);

    expect(res.isOk()).toBe(true);
    expect(dfs.paths()).toContain(`/users/${editor.email}/pods/pod-${pod.sId}`);
  });

  it("returns the folder stored by a concurrent call", async () => {
    const { authenticator, workspace, user } = await createResourceTest({});
    const { context } = setup();
    const other = await UserFactory.basic();
    const pod = await SpaceFactory.project(workspace);
    // Two snapshots fetched before either call stored a folder.
    const [first] = await SpaceResource.fetchByModelIds(authenticator, [
      pod.id,
    ]);
    const [second] = await SpaceResource.fetchByModelIds(authenticator, [
      pod.id,
    ]);

    const stored = await getOrCreatePodFolder(authenticator, context, first, {
      user,
    });
    const res = await getOrCreatePodFolder(authenticator, context, second, {
      user: other,
    });

    expect(stored.isOk()).toBe(true);
    expect(res.isOk() && stored.isOk() && res.value).toBe(
      stored.isOk() && stored.value
    );
  });

  it("refuses a space that is not a pod", async () => {
    const { authenticator, workspace } = await createResourceTest({});
    const { context } = setup();
    const space = await SpaceFactory.regular(workspace);

    const res = await getOrCreatePodFolder(authenticator, context, space);

    expect(res.isErr() && res.error.code).toBe("invalid_input");
  });
});

describe("getOrCreateConversationFolder", () => {
  it("creates a conversation outside pods under its first participant's folder", async () => {
    const { authenticator, user } = await createResourceTest({});
    const { dfs, context } = setup();
    const conversation = await createConversation(authenticator);
    await ConversationResource.upsertParticipation(authenticator, {
      conversation,
      action: "posted",
      user: user.toJSON(),
    });

    const res = await getOrCreateConversationFolder(
      authenticator,
      context,
      conversation
    );

    expect(res.isOk()).toBe(true);
    expect(dfs.paths()).toContain(
      `/users/${user.email}/conversations/conv-${conversation.sId}`
    );
    const stored = await ConversationResource.fetchById(
      authenticator,
      conversation.sId
    );
    expect(res.isOk() && res.value).toBe(stored?.dfsObjectId);
  });

  it("creates a conversation of a pod under the pod's folder", async () => {
    const { workspace, user } = await createResourceTest({});
    const { dfs, context } = setup();
    const pod = await SpaceFactory.project(workspace, user.id);
    // Refreshed so that it includes the new pod's groups.
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );
    const conversation = await createConversation(auth, {
      spaceModelId: pod.id,
    });

    const res = await getOrCreateConversationFolder(
      auth,
      context,
      conversation,
      { user }
    );

    expect(res.isOk()).toBe(true);
    expect(dfs.paths()).toContain(
      `/users/${user.email}/pods/pod-${pod.sId}/conversations/conv-${conversation.sId}`
    );
  });
});
