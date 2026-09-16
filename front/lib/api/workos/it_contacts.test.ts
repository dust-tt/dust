import type { LightWorkspaceType } from "@app/types/user";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGet, mockPost, mockDelete } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockDelete: vi.fn(),
}));

vi.mock("@app/lib/api/workos/client", () => ({
  getWorkOS: () => ({
    get: mockGet,
    post: mockPost,
    delete: mockDelete,
  }),
}));

import { syncWorkOSITContacts } from "@app/lib/api/workos/it_contacts";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";

async function createWorkspace(
  workOSOrganizationId: string | null = "org_123"
): Promise<LightWorkspaceType> {
  const workspace = await WorkspaceFactory.basic();
  return { ...workspace, workOSOrganizationId };
}

describe("syncWorkOSITContacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: { data: [] } });
    mockPost.mockResolvedValue({ data: {} });
    mockDelete.mockResolvedValue(undefined);
  });

  it("errs when the workspace has no WorkOS organization", async () => {
    const result = await syncWorkOSITContacts({
      workspace: await createWorkspace(null),
      emails: ["admin@example.com"],
    });

    expect(result.isErr()).toBe(true);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("creates missing contacts and leaves matching ones untouched", async () => {
    mockGet.mockResolvedValue({
      data: { data: [{ id: "itc_1", email: "Existing@example.com" }] },
    });

    const result = await syncWorkOSITContacts({
      workspace: await createWorkspace(),
      emails: ["existing@example.com", "new@example.com", "new@example.com"],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        created: ["new@example.com"],
        deleted: [],
        unchanged: 1,
        skippedForCap: [],
      });
    }
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith(
      "/organizations/org_123/it_contacts",
      {
        email: "new@example.com",
      }
    );
  });

  it("deletes contacts that are no longer admins", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          { id: "itc_1", email: "keep@example.com" },
          { id: "itc_2", email: "former-admin@example.com" },
        ],
      },
    });

    const result = await syncWorkOSITContacts({
      workspace: await createWorkspace(),
      emails: ["keep@example.com"],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toEqual({
        created: [],
        deleted: ["former-admin@example.com"],
        unchanged: 1,
        skippedForCap: [],
      });
    }
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith(
      "/organizations/org_123/it_contacts/itc_2"
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("reconciles a mix of create, delete and unchanged", async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          { id: "itc_1", email: "keep@example.com" },
          { id: "itc_2", email: "gone@example.com" },
        ],
      },
    });

    const result = await syncWorkOSITContacts({
      workspace: await createWorkspace(),
      emails: ["keep@example.com", "added@example.com"],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.created).toEqual(["added@example.com"]);
      expect(result.value.deleted).toEqual(["gone@example.com"]);
      expect(result.value.unchanged).toBe(1);
    }
  });

  it("deduplicates desired emails case-insensitively before applying the cap", async () => {
    // 18 retained contacts (all still admins), plus casing variants of one new
    // address and a second new address. The variants must collapse to a single
    // slot so both remaining slots are not wasted on the same address.
    const retained = Array.from({ length: 18 }, (_, i) => ({
      id: `itc_${i}`,
      email: `admin${i}@example.com`,
    }));
    mockGet.mockResolvedValue({ data: { data: retained } });

    const result = await syncWorkOSITContacts({
      workspace: await createWorkspace(),
      emails: [
        ...retained.map((contact) => contact.email),
        "New@example.com",
        "new@example.com",
        "other@example.com",
      ],
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.created).toEqual([
        "New@example.com",
        "other@example.com",
      ]);
      expect(result.value.skippedForCap).toEqual([]);
      expect(result.value.deleted).toEqual([]);
      expect(result.value.unchanged).toBe(18);
    }
  });

  it("reports emails skipped once the 20-contact cap is reached", async () => {
    // 20 existing contacts, none still desired -> all deleted, freeing 20 slots.
    const existing = Array.from({ length: 20 }, (_, i) => ({
      id: `itc_${i}`,
      email: `old${i}@example.com`,
    }));
    mockGet.mockResolvedValue({ data: { data: existing } });

    const emails = Array.from(
      { length: 22 },
      (_, i) => `admin${i}@example.com`
    );

    const result = await syncWorkOSITContacts({
      workspace: await createWorkspace(),
      emails,
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.deleted).toHaveLength(20);
      expect(result.value.created).toHaveLength(20);
      expect(result.value.skippedForCap).toEqual([
        "admin20@example.com",
        "admin21@example.com",
      ]);
    }
  });

  it("errs when a WorkOS call fails", async () => {
    mockGet.mockRejectedValue(new Error("workos down"));

    const result = await syncWorkOSITContacts({
      workspace: await createWorkspace(),
      emails: ["admin@example.com"],
    });

    expect(result.isErr()).toBe(true);
  });
});
