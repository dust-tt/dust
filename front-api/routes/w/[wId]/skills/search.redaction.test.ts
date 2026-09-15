import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SkillFactory } from "@app/tests/utils/SkillFactory";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { SkillListItemSchema } from "@app/types/assistant/skill_configuration";
import type { estypes } from "@elastic/elasticsearch";
import { honoApp } from "@front-api/app";
import assert from "assert";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mockSearch = vi.hoisted(() => vi.fn());

// Exercise the HTTP route, search service, resources and database together.
// ES deliberately returns stale and foreign hits to exercise the live guard too.
vi.mock("@app/lib/api/elasticsearch", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/lib/api/elasticsearch")>();
  const { Ok } = await import("@app/types/shared/result");
  return {
    ...actual,
    withEs: async (
      fn: (client: {
        search: typeof mockSearch;
        openPointInTime: () => Promise<{ id: string }>;
        closePointInTime: () => Promise<{ succeeded: boolean }>;
      }) => Promise<unknown>
    ) =>
      new Ok(
        await fn({
          search: mockSearch,
          openPointInTime: async () => ({ id: "redaction-pit" }),
          closePointInTime: async () => ({ succeeded: true }),
        })
      ),
  };
});

describe("GET /api/w/:wId/skills/search redaction integration", () => {
  beforeEach(() => {
    mockSearch.mockReset();
  });

  it.each(
    (
      [
        { spaceKind: "space", availability: "workspace_users" },
        { spaceKind: "space", availability: "editors" },
        { spaceKind: "pod", availability: "workspace_users" },
        { spaceKind: "pod", availability: "editors" },
      ] as const
    ).flatMap((access) =>
      (["active", "archived"] as const).map((status) => ({ ...access, status }))
    )
  )("keeps only safe admin metadata for an unreadable $spaceKind / $availability / $status skill", async ({
    spaceKind,
    availability,
    status,
  }) => {
    const other = await createPrivateApiMockRequest({ role: "admin" });
    const foreign = await SkillFactory.create(other.auth, {
      name: "RedactionTest foreign",
      status,
    });
    const [foreignDocument] = await SkillFactory.createSearchDocuments(
      other.auth,
      [foreign]
    );
    assert(foreignDocument);

    // Set the HTTP session to this workspace after creating the foreign fixture.
    const { auth, workspace } = await createPrivateApiMockRequest({
      role: "admin",
    });
    const restricted =
      spaceKind === "pod"
        ? await SpaceFactory.project(workspace)
        : await SpaceFactory.regular(workspace);
    const readableSkill = await SkillFactory.create(auth, {
      name: "RedactionTest readable",
      availability,
      status,
    });
    const hiddenSkill = await SkillFactory.create(auth, {
      name: "RedactionTest hidden",
      availability,
      status,
      requestedSpaceIds: [restricted.id],
      instructions: "Private prompt must not leave the resource",
      instructionsHtml: "<p>Private prompt</p>",
    });
    const archivedSkill = await SkillFactory.create(auth, {
      name: "RedactionTest archived",
    });
    const documents = await SkillFactory.createSearchDocuments(auth, [
      readableSkill,
      hiddenSkill,
      archivedSkill,
    ]);
    await archivedSkill.archive(auth);
    const hits = [...documents, foreignDocument].map((document, index) => ({
      _source: {
        ...document,
        description: "Outdated indexed description",
        instructions: "Unexpected private ES field",
        mcp_server_view_ids: ["Never expose indexed tool IDs"],
        fileAttachments: ["Never expose indexed attachments"],
      },
      sort: [80, document.name, document.skill_id, index],
    }));
    mockSearch.mockResolvedValue({ hits: { hits } });
    const path = `/api/w/${workspace.sId}/skills/search?query=RedactionTest${status === "archived" ? "&status=archived" : ""}`;

    const strict = await honoApp.request(path);
    expect(strict.status).toBe(200);
    const strictBody = await strict.json();
    expect(strictBody.skills).toEqual([
      expect.objectContaining({ sId: readableSkill.sId, canRead: true }),
    ]);

    const redacted = await honoApp.request(
      `${path}&permissionFiltering=redact_unreadable`
    );
    expect(redacted.status).toBe(200);
    const canonical = await SkillResource.fetchByIds(
      auth,
      [readableSkill.sId, hiddenSkill.sId],
      { permissionFiltering: "redact_unreadable" }
    );
    const canonicalById = new Map(canonical.map((skill) => [skill.sId, skill]));
    const body = await redacted.json();
    expect(body).toEqual({
      skills: [readableSkill, hiddenSkill].map((skill) => {
        const current = canonicalById.get(skill.sId);
        assert(current);
        return current.toSearchJSON(auth, 80);
      }),
      nextCursor: null,
    });
    expect(body.skills[1].canRead).toBe(false);
    for (const hit of body.skills) {
      expect(
        SkillListItemSchema.extend({ score: z.number() }).strict().parse(hit)
      ).toEqual(hit);
      expect(hit).not.toHaveProperty("instructions");
      expect(hit).not.toHaveProperty("instructionsHtml");
      expect(hit).not.toHaveProperty("tools");
      expect(hit).not.toHaveProperty("fileAttachments");
      expect(hit).not.toHaveProperty("editors");
      expect(hit).not.toHaveProperty("editor_ids");
      expect(hit).not.toHaveProperty("editor_group_ids");
      expect(hit).not.toHaveProperty("mcp_server_view_ids");
    }

    const request: estypes.SearchRequest = mockSearch.mock.lastCall![0];
    expect(request.query).toEqual({
      bool: {
        filter: [{ term: { workspace_id: workspace.sId } }],
        must: [
          {
            bool: {
              filter: [
                { term: { workspace_id: workspace.sId } },
                { terms: { status: [status] } },
              ],
              must: expect.any(Array),
            },
          },
        ],
      },
    });
  });
});
