// @vitest-environment node
import {
  createDfsMasterSession,
  createDfsSession,
  DFS_MASTER_SUBJECT,
  getDfsSessionSubjects,
} from "@app/lib/api/dfs/sessions";
import { Authenticator } from "@app/lib/auth";
import { DfsClient } from "@app/lib/dfs/client";
import { DfsWireFactory } from "@app/tests/utils/dfs/DfsWireFactory";
import { FakeDfsTransport } from "@app/tests/utils/dfs/FakeDfsTransport";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GroupFactory } from "@app/tests/utils/GroupFactory";
import { KeyFactory } from "@app/tests/utils/KeyFactory";
import { Ok } from "@app/types/shared/result";
import { describe, expect, it } from "vitest";

const TENANT_KEY = "t".repeat(64);
const SESSION_KEY = "k".repeat(64);

describe("getDfsSessionSubjects", () => {
  it("returns the user's sId and the sIds of their groups", async () => {
    const { authenticator, workspace, user, globalGroup } =
      await createResourceTest({ role: "admin" });
    const group = await GroupFactory.regularAuto(workspace, "eng");
    await GroupFactory.withMembers(authenticator, group, [user]);
    const auth = await Authenticator.fromUserIdAndWorkspaceId(
      user.sId,
      workspace.sId
    );

    const subjects = await getDfsSessionSubjects(auth);

    expect(subjects[0]).toBe(`u:${user.sId}`);
    expect(subjects.slice(1).sort()).toEqual(
      [`g:${globalGroup.sId}`, `g:${group.sId}`].sort()
    );
  });

  it("returns only the groups of an API key, without a user subject", async () => {
    const { workspace } = await createResourceTest({ role: "admin" });
    const group = await GroupFactory.regularAuto(workspace, "eng");
    const key = await KeyFactory.regular(group);
    const auth = await Authenticator.fromKey(key, workspace.sId);

    expect(await getDfsSessionSubjects(auth)).toEqual([`g:${group.sId}`]);
  });

  it("follows the groups a system key is narrowed to", async () => {
    const { workspace, systemGroup } = await createResourceTest({
      role: "admin",
    });
    const group = await GroupFactory.regularAuto(workspace, "eng");
    const key = await KeyFactory.system(systemGroup);
    const auth = await Authenticator.fromKey(key, workspace.sId, [group.sId]);

    expect(await getDfsSessionSubjects(auth)).toEqual([`g:${group.sId}`]);
  });
});

describe("createDfsSession", () => {
  it("creates a session with the auth's subjects and returns a client using its key", async () => {
    const { workspace } = await createResourceTest({ role: "admin" });
    const group = await GroupFactory.regularAuto(workspace, "eng");
    const auth = await Authenticator.fromKey(
      await KeyFactory.regular(group),
      workspace.sId
    );
    const session = DfsWireFactory.session({
      tenantId: workspace.sId,
      subjects: [`g:${group.sId}`],
      sessionKey: SESSION_KEY,
    });
    const transport = new FakeDfsTransport({
      CreateSession: new Ok(session),
      CurrentSession: new Ok({ ...session, sessionKey: "" }),
    });

    const res = await createDfsSession(auth, {
      tenantClient: new DfsClient(transport, TENANT_KEY),
    });

    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      expect(res.value.session.sessionKey).toBe(SESSION_KEY);
      await res.value.sessionClient.currentSession();
    }
    expect(transport.calls).toEqual([
      {
        method: "CreateSession",
        request: { subjects: [`g:${group.sId}`] },
        key: TENANT_KEY,
      },
      { method: "CurrentSession", request: {}, key: SESSION_KEY },
    ]);
  });

  it("refuses a session created in another tenant", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const transport = new FakeDfsTransport({
      CreateSession: new Ok(
        DfsWireFactory.session({
          tenantId: "another-workspace",
          sessionKey: SESSION_KEY,
        })
      ),
    });

    const res = await createDfsSession(authenticator, {
      tenantClient: new DfsClient(transport, TENANT_KEY),
    });

    expect(res.isErr() && res.error.code).toBe("invalid_response");
  });
});

describe("createDfsMasterSession", () => {
  it("creates a session holding only the master subject and returns a client using its key", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const session = DfsWireFactory.session({
      tenantId: workspace.sId,
      subjects: [DFS_MASTER_SUBJECT],
      sessionKey: SESSION_KEY,
    });
    const transport = new FakeDfsTransport({
      CreateSession: new Ok(session),
      CurrentSession: new Ok({ ...session, sessionKey: "" }),
    });

    const res = await createDfsMasterSession(authenticator, {
      tenantClient: new DfsClient(transport, TENANT_KEY),
    });

    expect(res.isOk()).toBe(true);
    if (res.isOk()) {
      await res.value.sessionClient.currentSession();
    }
    expect(transport.calls).toEqual([
      {
        method: "CreateSession",
        request: { subjects: ["v:master"] },
        key: TENANT_KEY,
      },
      { method: "CurrentSession", request: {}, key: SESSION_KEY },
    ]);
  });

  it("refuses a session created in another tenant", async () => {
    const { authenticator } = await createResourceTest({ role: "admin" });
    const transport = new FakeDfsTransport({
      CreateSession: new Ok(
        DfsWireFactory.session({
          tenantId: "another-workspace",
          sessionKey: SESSION_KEY,
        })
      ),
    });

    const res = await createDfsMasterSession(authenticator, {
      tenantClient: new DfsClient(transport, TENANT_KEY),
    });

    expect(res.isErr() && res.error.code).toBe("invalid_response");
  });
});
