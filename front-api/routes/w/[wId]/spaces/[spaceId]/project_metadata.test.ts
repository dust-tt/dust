import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockLaunchOrSignalProjectTodoWorkflow,
  mockStartImmediateProjectTodoWorkflowOnce,
  mockStopProjectTodoWorkflow,
} = vi.hoisted(() => ({
  mockLaunchOrSignalProjectTodoWorkflow: vi.fn(),
  mockStartImmediateProjectTodoWorkflowOnce: vi.fn(),
  mockStopProjectTodoWorkflow: vi.fn(),
}));

vi.mock("@app/temporal/project_task/client", () => ({
  launchOrSignalProjectTodoWorkflow: mockLaunchOrSignalProjectTodoWorkflow,
  startImmediateProjectTodoWorkflowOnce:
    mockStartImmediateProjectTodoWorkflowOnce,
  stopProjectTodoWorkflow: mockStopProjectTodoWorkflow,
}));

import { ProjectMetadataResource } from "@app/lib/resources/project_metadata_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { ProjectFileFactory } from "@app/tests/utils/ProjectFileFactory";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { frameContentType } from "@app/types/files";
import {
  DEFAULT_POD_FILE_TAB_ICON,
  normalizeTabsOrder,
} from "@app/types/pod_file_tab";

import { honoApp } from "@front-api/app";

function getMetadata(workspace: { sId: string }, spaceId: string) {
  return honoApp.request(
    `/api/w/${workspace.sId}/spaces/${spaceId}/project_metadata`
  );
}

function patchMetadata(
  workspace: { sId: string },
  spaceId: string,
  body: unknown
) {
  return honoApp.request(
    `/api/w/${workspace.sId}/spaces/${spaceId}/project_metadata`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/w/:wId/spaces/:spaceId/project_metadata", () => {
  it("returns metadata for project spaces", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    await ProjectMetadataResource.makeNew(auth, projectSpace, {
      description: "Test description",
    });

    const response = await getMetadata(workspace, projectSpace.sId);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.projectMetadata.description).toBe("Test description");
  });

  it("returns 400 for non-project spaces", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const regularSpace = await SpaceFactory.regular(workspace);

    const response = await getMetadata(workspace, regularSpace.sId);

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });
});

describe("PATCH /api/w/:wId/spaces/:spaceId/project_metadata", () => {
  it("creates and updates metadata", async () => {
    const { workspace } = await createPrivateApiMockRequest({ role: "admin" });

    const projectSpace = await SpaceFactory.project(workspace);

    const response = await patchMetadata(workspace, projectSpace.sId, {
      description: "New description",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.projectMetadata.description).toBe("New description");
  });

  it("denies non-admin users", async () => {
    const { workspace, user } = await createPrivateApiMockRequest({
      role: "user",
    });

    const projectSpace = await SpaceFactory.project(workspace);

    const { Authenticator } = await import("@app/lib/auth");
    const adminAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );
    const [spaceGroup] = await projectSpace.fetchRegularAutoGroups(adminAuth);
    if (!spaceGroup) {
      throw new Error("Expected the project member group to exist.");
    }
    await spaceGroup.dangerouslyAddMembers(adminAuth, {
      users: [user.toJSON()],
    });

    const response = await patchMetadata(workspace, projectSpace.sId, {
      description: "Should fail",
    });

    expect(response.status).toBe(403);
  });

  it("stops project tasks workflow when archiving a project", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    await ProjectMetadataResource.makeNew(auth, projectSpace, {
      description: "Test description",
      archivedAt: null,
    });

    const response = await patchMetadata(workspace, projectSpace.sId, {
      archive: true,
    });

    expect(response.status).toBe(200);
    expect(mockStopProjectTodoWorkflow).toHaveBeenCalledTimes(1);
    expect(mockStopProjectTodoWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: projectSpace.sId })
    );
    expect(mockLaunchOrSignalProjectTodoWorkflow).not.toHaveBeenCalled();
  });

  it("updates tasks generation opt-in", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    await ProjectMetadataResource.makeNew(auth, projectSpace, {
      description: "Test",
    });

    const response = await patchMetadata(workspace, projectSpace.sId, {
      todoGenerationEnabled: true,
      initialTodoAnalysisLookback: "last_24h",
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.projectMetadata.todoGenerationEnabled).toBe(true);
    expect(mockLaunchOrSignalProjectTodoWorkflow).toHaveBeenCalledTimes(1);
    expect(mockStartImmediateProjectTodoWorkflowOnce).toHaveBeenCalledTimes(1);
  });

  it("sets, returns, replaces, and clears default skills (custom + global)", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    const skillA = await SkillFactory.create(auth, { name: "Skill A" });
    const skillB = await SkillFactory.create(auth, { name: "Skill B" });
    // A code-defined global skill, addressed by its fixed sId (no "skl_" prefix).
    const globalSkillId = "frames";

    // Set two custom skills and one global skill.
    const setResponse = await patchMetadata(workspace, projectSpace.sId, {
      defaultSkillIds: [skillA.sId, skillB.sId, globalSkillId],
    });
    expect(setResponse.status).toBe(200);
    expect(
      (await setResponse.json()).projectMetadata.defaultSkillIds.sort()
    ).toEqual([skillA.sId, skillB.sId, globalSkillId].sort());

    // GET reflects the stored set.
    const getResponse = await getMetadata(workspace, projectSpace.sId);
    expect(
      (await getResponse.json()).projectMetadata.defaultSkillIds.sort()
    ).toEqual([skillA.sId, skillB.sId, globalSkillId].sort());

    // Replacing drops the omitted skills; keep one custom + the global one.
    const replaceResponse = await patchMetadata(workspace, projectSpace.sId, {
      defaultSkillIds: [skillB.sId, globalSkillId],
    });
    expect(
      (await replaceResponse.json()).projectMetadata.defaultSkillIds.sort()
    ).toEqual([skillB.sId, globalSkillId].sort());

    // An empty array clears all default skills.
    const clearResponse = await patchMetadata(workspace, projectSpace.sId, {
      defaultSkillIds: [],
    });
    expect(
      (await clearResponse.json()).projectMetadata.defaultSkillIds
    ).toEqual([]);
  });

  it("rejects unknown default skill ids", async () => {
    const { workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);

    const response = await patchMetadata(workspace, projectSpace.sId, {
      defaultSkillIds: ["skill_does_not_exist"],
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.type).toBe("invalid_request_error");
  });

  it("allows removing a file tab when another tab has a stale path", async () => {
    const { workspace, auth, user } = await createPrivateApiMockRequest({
      role: "admin",
    });

    await FeatureFlagFactory.basic(auth, "pod_frame_tabs");

    const projectSpace = await SpaceFactory.project(workspace, user.id);

    const validFrame = await ProjectFileFactory.create(
      auth,
      user,
      projectSpace,
      {
        contentType: frameContentType,
        fileName: "MyView.tsx",
        fileSize: 100,
        status: "ready",
      }
    );
    const validPath = validFrame.toScopedPath(auth);
    if (!validPath) {
      throw new Error("Expected a scoped Pod Frame path.");
    }

    const stalePath = `pod-${projectSpace.sId}/frames/Activity.tsx`;
    const framePaths = [stalePath, validPath];

    await ProjectMetadataResource.makeNew(auth, projectSpace, {
      description: null,
      frameTabs: [
        {
          path: stalePath,
          title: "Activity",
          icon: DEFAULT_POD_FILE_TAB_ICON,
        },
        {
          path: validPath,
          title: "My View",
          icon: DEFAULT_POD_FILE_TAB_ICON,
        },
      ],
      tabsOrder: normalizeTabsOrder([stalePath, validPath], framePaths),
    });

    const response = await patchMetadata(workspace, projectSpace.sId, {
      frameTabs: [
        {
          path: stalePath,
          title: "Activity",
          icon: DEFAULT_POD_FILE_TAB_ICON,
        },
      ],
      tabsOrder: normalizeTabsOrder([stalePath], [stalePath]),
    });

    expect(response.status).toBe(200);
    expect((await response.json()).projectMetadata.frameTabs).toEqual([
      {
        path: stalePath,
        title: "Activity",
        icon: DEFAULT_POD_FILE_TAB_ICON,
      },
    ]);
  });

  it("restarts project tasks workflow when unarchiving a project", async () => {
    const { workspace, auth } = await createPrivateApiMockRequest({
      role: "admin",
    });

    const projectSpace = await SpaceFactory.project(workspace);
    await ProjectMetadataResource.makeNew(auth, projectSpace, {
      description: "Test description",
      archivedAt: new Date(),
    });

    const response = await patchMetadata(workspace, projectSpace.sId, {
      archive: false,
    });

    expect(response.status).toBe(200);
    expect(mockLaunchOrSignalProjectTodoWorkflow).toHaveBeenCalledTimes(1);
    expect(mockLaunchOrSignalProjectTodoWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ spaceId: projectSpace.sId })
    );
    expect(mockStopProjectTodoWorkflow).not.toHaveBeenCalled();
  });
});
