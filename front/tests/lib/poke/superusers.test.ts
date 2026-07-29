import {
  grantSuperuser,
  listSuperuserMembers,
  repairSuperuserDrift,
  revokeSuperuser,
  updateSuperuserRoles,
} from "@app/lib/api/poke/superusers";
import type { Authenticator } from "@app/lib/auth";
import type { RolesConfig } from "@app/lib/poke/roles";
import { invalidateRolesCache, POKE_ROLES_FILE } from "@app/lib/poke/roles";
import type { UserResource } from "@app/lib/resources/user_resource";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/logger/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

let mockProductionDustWorkspaceId: string | null = null;
vi.mock("@app/lib/api/config", () => ({
  default: {
    getProductionDustWorkspaceId: vi.fn(() => mockProductionDustWorkspaceId),
  },
}));

const mockSetDustSuperUser = vi.fn();
let mockUser: Partial<UserResource> | null = null;
const mockFetchByEmails = vi.fn<
  (emails: string[]) => Promise<Partial<UserResource>[]>
>(async () => []);
const mockFetchByModelIds = vi.fn<
  (ids: number[]) => Promise<Partial<UserResource>[]>
>(async () => []);

vi.mock("@app/lib/resources/user_resource", () => ({
  UserResource: {
    fetchByEmail: vi.fn(async () => mockUser),
    fetchByEmails: vi.fn(async (emails: string[]) => mockFetchByEmails(emails)),
    fetchByModelIds: vi.fn(async (ids: number[]) => mockFetchByModelIds(ids)),
  },
}));

const mockGetActiveMemberships = vi.fn<
  () => Promise<{
    memberships: Array<{ userId: number; role: string }>;
  }>
>(async () => ({ memberships: [] }));
const mockGetActiveMembershipOfUserInWorkspace = vi.fn<
  (...args: unknown[]) => Promise<{ role: string } | null>
>(async () => null);
vi.mock("@app/lib/resources/membership_resource", () => ({
  MembershipResource: {
    getActiveMemberships: vi.fn(async () => mockGetActiveMemberships()),
    getActiveMembershipOfUserInWorkspace: vi.fn(async (...args: unknown[]) =>
      mockGetActiveMembershipOfUserInWorkspace(...args)
    ),
  },
}));

vi.mock("@app/lib/workspace", () => ({
  renderLightWorkspaceType: vi.fn(
    ({ workspace }: { workspace: { sId: string; name: string } }) => workspace
  ),
}));

function seedRolesConfig(config: RolesConfig, generation: string = "1"): void {
  const bucket = fileStorageMock.mock().getPokeUserConfigBucket();
  bucket.uploadRawContentToBucket({
    content: JSON.stringify(config),
    contentType: "application/json",
    filePath: POKE_ROLES_FILE,
  });
  fileStorageMock.setFileMetadata(() => ({
    contentType: "application/json",
    size: "100",
    generation,
  }));
}

function makeUser(overrides: {
  email: string;
  isDustSuperUser: boolean;
}): Partial<UserResource> {
  return {
    sId: "user-sid-1",
    email: overrides.email,
    isDustSuperUser: overrides.isDustSuperUser,
    setDustSuperUser: mockSetDustSuperUser,
    fullName: () => "Test User",
    firstName: "Test",
    lastName: "User",
    image: null,
  } as Partial<UserResource>;
}

function makeAuth(email: string): Authenticator {
  return {
    getNonNullableUser: () => ({ email }) as UserResource,
    getNonNullableWorkspace: () => ({
      sId: "ws-sid-1",
      name: "Test Workspace",
    }),
  } as Authenticator;
}

describe("listSuperuserMembers", () => {
  beforeEach(() => {
    invalidateRolesCache();
    fileStorageMock.reset();
    mockGetActiveMemberships.mockReset();
    mockFetchByModelIds.mockReset();
  });

  it("returns every active member, including none and roles_only states", async () => {
    mockGetActiveMemberships.mockResolvedValue({
      memberships: [
        { userId: 1, role: "admin" },
        { userId: 2, role: "user" },
      ],
    });
    mockFetchByModelIds.mockResolvedValue([
      {
        id: 1,
        sId: "user-alice",
        email: "alice@example.com",
        isDustSuperUser: false,
        firstName: "Alice",
        lastName: "Admin",
        imageUrl: null,
        fullName: () => "Alice Admin",
      },
      {
        id: 2,
        sId: "user-bob",
        email: "bob@example.com",
        isDustSuperUser: false,
        firstName: "Bob",
        lastName: null,
        imageUrl: null,
        fullName: () => "Bob",
      },
    ]);
    seedRolesConfig({ "alice@example.com": ["support"] }, "12");

    const result = await listSuperuserMembers(makeAuth("admin@example.com"));

    expect(mockFetchByModelIds).toHaveBeenCalledWith([1, 2]);
    expect(result.generation).toBe(12);
    expect(result.members).toHaveLength(2);
    expect(result.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sId: "user-alice",
          driftState: "roles_only",
          pokeRoles: ["support"],
        }),
        expect.objectContaining({
          sId: "user-bob",
          driftState: "none",
          pokeRoles: [],
        }),
      ])
    );
  });
});

describe("grantSuperuser", () => {
  beforeEach(() => {
    invalidateRolesCache();
    fileStorageMock.reset();
    mockSetDustSuperUser.mockReset();
    mockGetActiveMembershipOfUserInWorkspace.mockReset();
    mockGetActiveMembershipOfUserInWorkspace.mockResolvedValue({
      role: "member",
    });
    mockProductionDustWorkspaceId = null;
    mockUser = null;
  });

  it("happy path: writes roles to GCS first, then sets DB flag", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: false });
    mockSetDustSuperUser.mockResolvedValue(undefined);
    seedRolesConfig({}, "10");

    const result = await grantSuperuser(
      makeAuth("admin@example.com"),
      "alice@example.com",
      ["admin", "engineering"],
      10
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.email).toBe("alice@example.com");
      expect(result.value.targetSId).toBe("user-sid-1");
      expect(result.value.targetName).toBe("Test User");
      expect(result.value.previousState).toEqual({
        isDustSuperUser: false,
        pokeRoles: [],
      });
      expect(result.value.newState).toEqual({
        isDustSuperUser: true,
        pokeRoles: ["admin", "engineering"],
      });
    }

    const stored = fileStorageMock.getObject(POKE_ROLES_FILE);
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored!);
    expect(parsed["alice@example.com"]).toEqual(["admin", "engineering"]);

    expect(mockSetDustSuperUser).toHaveBeenCalledWith(true);
  });

  it("returns conflict when GCS precondition fails", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: false });
    seedRolesConfig({}, "10");
    fileStorageMock.setPreconditionFails(() => true);

    const result = await grantSuperuser(
      makeAuth("admin@example.com"),
      "alice@example.com",
      ["admin"],
      10
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("conflict");
    }
    expect(mockSetDustSuperUser).not.toHaveBeenCalled();
  });

  it("returns already_superuser when user already has DB flag", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: true });
    seedRolesConfig({ "alice@example.com": ["admin"] }, "10");

    const result = await grantSuperuser(
      makeAuth("admin@example.com"),
      "alice@example.com",
      ["admin"],
      10
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("already_superuser");
    }
  });

  it("returns not_found when user does not exist", async () => {
    mockUser = null;

    const result = await grantSuperuser(
      makeAuth("admin@example.com"),
      "nobody@example.com",
      ["admin"],
      1
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("not_found");
    }
  });

  it("returns partial_failure when DB update throws after GCS write succeeds", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: false });
    mockSetDustSuperUser.mockRejectedValue(new Error("DB connection lost"));
    seedRolesConfig({}, "10");

    const result = await grantSuperuser(
      makeAuth("admin@example.com"),
      "alice@example.com",
      ["admin"],
      10
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("partial_failure");
      if (result.error.type === "partial_failure") {
        expect(result.error.partialFailure.rolesWritten).toBe(true);
        expect(result.error.partialFailure.dbUpdated).toBe(false);
        expect(result.error.partialFailure.previousState).toEqual({
          isDustSuperUser: false,
          pokeRoles: [],
        });
        expect(result.error.partialFailure.currentState).toEqual({
          isDustSuperUser: false,
          pokeRoles: ["admin"],
        });
      }
    }
  });

  it("normalizes email before lookup", async () => {
    mockUser = makeUser({ email: "user@example.com", isDustSuperUser: false });
    mockSetDustSuperUser.mockResolvedValue(undefined);
    seedRolesConfig({}, "1");

    const { UserResource: MockedResource } = await import(
      "@app/lib/resources/user_resource"
    );

    const result = await grantSuperuser(
      makeAuth("admin@example.com"),
      "  USER@Example.COM  ",
      ["admin"],
      1
    );

    expect(MockedResource.fetchByEmail).toHaveBeenCalledWith(
      "user@example.com"
    );
    expect(result.isOk()).toBe(true);
  });

  it("returns not_active_member when user has no active workspace membership", async () => {
    mockProductionDustWorkspaceId = "production-workspace-id";
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: false });
    mockGetActiveMembershipOfUserInWorkspace.mockResolvedValue(null);
    seedRolesConfig({}, "10");

    const result = await grantSuperuser(
      makeAuth("admin@example.com"),
      "alice@example.com",
      ["admin"],
      10
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("not_active_member");
    }
    expect(mockSetDustSuperUser).not.toHaveBeenCalled();
  });

  it("succeeds for active workspace member", async () => {
    mockProductionDustWorkspaceId = "production-workspace-id";
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: false });
    mockGetActiveMembershipOfUserInWorkspace.mockResolvedValue({
      role: "member",
    });
    mockSetDustSuperUser.mockResolvedValue(undefined);
    seedRolesConfig({}, "10");

    const result = await grantSuperuser(
      makeAuth("admin@example.com"),
      "alice@example.com",
      ["admin"],
      10
    );

    expect(result.isOk()).toBe(true);
    expect(mockSetDustSuperUser).toHaveBeenCalledWith(true);
  });
});

describe("revokeSuperuser", () => {
  beforeEach(() => {
    invalidateRolesCache();
    fileStorageMock.reset();
    mockSetDustSuperUser.mockReset();
    mockFetchByEmails.mockReset();
    mockGetActiveMembershipOfUserInWorkspace.mockReset();
    mockGetActiveMembershipOfUserInWorkspace.mockResolvedValue({
      role: "member",
    });
    mockUser = null;
  });

  it("happy path: clears DB flag first, then removes roles from GCS", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: true });
    mockSetDustSuperUser.mockResolvedValue(undefined);
    mockFetchByEmails.mockResolvedValue([
      { email: "alice@example.com", isDustSuperUser: true },
      { email: "bob@example.com", isDustSuperUser: true },
    ]);
    seedRolesConfig(
      {
        "alice@example.com": ["admin", "engineering"],
        "bob@example.com": ["admin"],
      },
      "10"
    );

    const result = await revokeSuperuser(
      makeAuth("bob@example.com"),
      "alice@example.com",
      10
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.email).toBe("alice@example.com");
      expect(result.value.targetSId).toBe("user-sid-1");
      expect(result.value.targetName).toBe("Test User");
      expect(result.value.previousState).toEqual({
        isDustSuperUser: true,
        pokeRoles: ["admin", "engineering"],
      });
      expect(result.value.newState).toEqual({
        isDustSuperUser: false,
        pokeRoles: [],
      });
    }

    expect(mockSetDustSuperUser).toHaveBeenCalledWith(false);

    const stored = fileStorageMock.getObject(POKE_ROLES_FILE);
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored!);
    expect(parsed["alice@example.com"]).toBeUndefined();
    expect(parsed["bob@example.com"]).toEqual(["admin"]);
  });

  it("returns the resulting roles_only state when GCS removal fails", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: true });
    mockSetDustSuperUser.mockResolvedValue(undefined);
    mockFetchByEmails.mockResolvedValue([
      { email: "alice@example.com", isDustSuperUser: true },
      { email: "bob@example.com", isDustSuperUser: true },
    ]);
    seedRolesConfig(
      {
        "alice@example.com": ["support"],
        "bob@example.com": ["admin"],
      },
      "10"
    );
    fileStorageMock.setPreconditionFails(() => true);

    const result = await revokeSuperuser(
      makeAuth("bob@example.com"),
      "alice@example.com",
      10
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("partial_failure");
      if (result.error.type === "partial_failure") {
        expect(result.error.partialFailure).toEqual({
          rolesWritten: false,
          dbUpdated: true,
          currentDriftState: "roles_only",
          remediation: "Retry revoke to remove stale GCS roles",
          previousState: {
            isDustSuperUser: true,
            pokeRoles: ["support"],
          },
          currentState: {
            isDustSuperUser: false,
            pokeRoles: ["support"],
          },
        });
      }
    }
    expect(mockSetDustSuperUser).toHaveBeenCalledWith(false);
  });

  it("idempotently completes a revoke from roles_only drift", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: false });
    seedRolesConfig(
      {
        "alice@example.com": ["support"],
        "bob@example.com": ["admin"],
      },
      "11"
    );

    const result = await revokeSuperuser(
      makeAuth("bob@example.com"),
      "alice@example.com",
      11
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.previousState).toEqual({
        isDustSuperUser: false,
        pokeRoles: ["support"],
      });
      expect(result.value.newState).toEqual({
        isDustSuperUser: false,
        pokeRoles: [],
      });
    }
    expect(mockSetDustSuperUser).not.toHaveBeenCalled();
    const stored = fileStorageMock.getObject(POKE_ROLES_FILE);
    expect(JSON.parse(stored!)["alice@example.com"]).toBeUndefined();
  });

  it("returns last_admin when target is the only admin", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: true });
    mockFetchByEmails.mockResolvedValue([
      { email: "alice@example.com", isDustSuperUser: true },
    ]);
    seedRolesConfig({ "alice@example.com": ["admin"] }, "10");

    const result = await revokeSuperuser(
      makeAuth("other@example.com"),
      "alice@example.com",
      10
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("last_admin");
    }
    expect(mockSetDustSuperUser).not.toHaveBeenCalled();
  });

  it("returns last_admin even when stale roles_only entry exists (isDustSuperUser=false)", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: true });
    mockFetchByEmails.mockResolvedValue([
      { email: "alice@example.com", isDustSuperUser: true },
      { email: "stale@example.com", isDustSuperUser: false },
    ]);
    seedRolesConfig(
      {
        "alice@example.com": ["admin"],
        "stale@example.com": ["admin"],
      },
      "10"
    );

    const result = await revokeSuperuser(
      makeAuth("other@example.com"),
      "alice@example.com",
      10
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("last_admin");
    }
    expect(mockSetDustSuperUser).not.toHaveBeenCalled();
  });

  it("returns self_removal when admin tries to revoke themselves", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: true });
    mockFetchByEmails.mockResolvedValue([
      { email: "alice@example.com", isDustSuperUser: true },
      { email: "bob@example.com", isDustSuperUser: true },
    ]);
    seedRolesConfig(
      {
        "alice@example.com": ["admin"],
        "bob@example.com": ["admin"],
      },
      "10"
    );

    const result = await revokeSuperuser(
      makeAuth("alice@example.com"),
      "alice@example.com",
      10
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("self_removal");
    }
    expect(mockSetDustSuperUser).not.toHaveBeenCalled();
  });

  it("returns not_found when user does not exist", async () => {
    mockUser = null;

    const result = await revokeSuperuser(
      makeAuth("admin@example.com"),
      "nobody@example.com",
      1
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("not_found");
    }
  });

  it("returns not_superuser when user is not a superuser", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: false });
    seedRolesConfig({}, "1");

    const result = await revokeSuperuser(
      makeAuth("admin@example.com"),
      "alice@example.com",
      1
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("not_superuser");
    }
  });
});

describe("updateSuperuserRoles", () => {
  beforeEach(() => {
    invalidateRolesCache();
    fileStorageMock.reset();
    mockSetDustSuperUser.mockReset();
    mockFetchByEmails.mockReset();
    mockGetActiveMembershipOfUserInWorkspace.mockReset();
    mockGetActiveMembershipOfUserInWorkspace.mockResolvedValue({
      role: "member",
    });
    mockUser = null;
  });

  it("happy path: updates roles in GCS with correct before/after", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: true });
    seedRolesConfig({ "alice@example.com": ["admin"] }, "10");

    const result = await updateSuperuserRoles(
      makeAuth("bob@example.com"),
      "alice@example.com",
      ["admin", "engineering", "support"],
      10
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.targetSId).toBe("user-sid-1");
      expect(result.value.targetName).toBe("Test User");
      expect(result.value.previousState.pokeRoles).toEqual(["admin"]);
      expect(result.value.newState.pokeRoles).toEqual([
        "admin",
        "engineering",
        "support",
      ]);
      expect(result.value.newState.isDustSuperUser).toBe(true);
    }

    const stored = fileStorageMock.getObject(POKE_ROLES_FILE);
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored!);
    expect(parsed["alice@example.com"]).toEqual([
      "admin",
      "engineering",
      "support",
    ]);
  });

  it("returns last_admin when removing admin role from last admin", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: true });
    mockFetchByEmails.mockResolvedValue([
      { email: "alice@example.com", isDustSuperUser: true },
    ]);
    seedRolesConfig({ "alice@example.com": ["admin", "engineering"] }, "10");

    const result = await updateSuperuserRoles(
      makeAuth("bob@example.com"),
      "alice@example.com",
      ["engineering"],
      10
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("last_admin");
    }
  });

  it("returns self_removal when admin removes own admin role", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: true });
    mockFetchByEmails.mockResolvedValue([
      { email: "alice@example.com", isDustSuperUser: true },
      { email: "bob@example.com", isDustSuperUser: true },
    ]);
    seedRolesConfig(
      {
        "alice@example.com": ["admin", "engineering"],
        "bob@example.com": ["admin"],
      },
      "10"
    );

    const result = await updateSuperuserRoles(
      makeAuth("alice@example.com"),
      "alice@example.com",
      ["engineering"],
      10
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("self_removal");
    }
  });

  it("returns not_found when user does not exist", async () => {
    mockUser = null;

    const result = await updateSuperuserRoles(
      makeAuth("admin@example.com"),
      "nobody@example.com",
      ["admin"],
      1
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("not_found");
    }
  });

  it("returns not_superuser when user is not a superuser", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: false });

    const result = await updateSuperuserRoles(
      makeAuth("admin@example.com"),
      "alice@example.com",
      ["admin"],
      1
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("not_superuser");
    }
  });

  it("refuses to assign roles to an inactive member", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: true });
    mockGetActiveMembershipOfUserInWorkspace.mockResolvedValue(null);

    const result = await updateSuperuserRoles(
      makeAuth("admin@example.com"),
      "alice@example.com",
      ["support"],
      1
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("not_active_member");
    }
  });

  it("returns conflict when GCS precondition fails", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: true });
    seedRolesConfig({ "alice@example.com": ["admin"] }, "10");
    fileStorageMock.setPreconditionFails(() => true);

    const result = await updateSuperuserRoles(
      makeAuth("bob@example.com"),
      "alice@example.com",
      ["admin", "support"],
      10
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("conflict");
    }
  });
});

describe("repairSuperuserDrift", () => {
  beforeEach(() => {
    invalidateRolesCache();
    fileStorageMock.reset();
    mockSetDustSuperUser.mockReset();
    mockGetActiveMembershipOfUserInWorkspace.mockReset();
    mockGetActiveMembershipOfUserInWorkspace.mockResolvedValue({
      role: "member",
    });
    mockUser = null;
  });

  it("db_only: writes admin-supplied roles to GCS", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: true });
    seedRolesConfig({}, "10");

    const result = await repairSuperuserDrift(
      makeAuth("admin@example.com"),
      "alice@example.com",
      10,
      ["admin"]
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.targetSId).toBe("user-sid-1");
      expect(result.value.targetName).toBe("Test User");
      expect(result.value.previousState).toEqual({
        isDustSuperUser: true,
        pokeRoles: [],
      });
      expect(result.value.newState).toEqual({
        isDustSuperUser: true,
        pokeRoles: ["admin"],
      });
    }

    const stored = fileStorageMock.getObject(POKE_ROLES_FILE);
    expect(stored).toBeDefined();
    const parsed = JSON.parse(stored!);
    expect(parsed["alice@example.com"]).toEqual(["admin"]);
  });

  it("db_only: returns error when roles not provided", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: true });
    seedRolesConfig({}, "10");

    const result = await repairSuperuserDrift(
      makeAuth("admin@example.com"),
      "alice@example.com",
      10
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("invalid_request_error");
    }
  });

  it("roles_only: sets DB superuser flag to true", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: false });
    mockSetDustSuperUser.mockResolvedValue(undefined);
    seedRolesConfig({ "alice@example.com": ["admin", "support"] }, "10");

    const result = await repairSuperuserDrift(
      makeAuth("admin@example.com"),
      "alice@example.com",
      10
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.targetSId).toBe("user-sid-1");
      expect(result.value.targetName).toBe("Test User");
      expect(result.value.previousState).toEqual({
        isDustSuperUser: false,
        pokeRoles: ["admin", "support"],
      });
      expect(result.value.newState).toEqual({
        isDustSuperUser: true,
        pokeRoles: ["admin", "support"],
      });
    }

    expect(mockSetDustSuperUser).toHaveBeenCalledWith(true);
  });

  it("roles_only: refuses to restore access for an inactive member", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: false });
    mockGetActiveMembershipOfUserInWorkspace.mockResolvedValue(null);
    seedRolesConfig({ "alice@example.com": ["admin", "support"] }, "10");

    const result = await repairSuperuserDrift(
      makeAuth("admin@example.com"),
      "alice@example.com",
      10
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("not_active_member");
    }
    expect(mockSetDustSuperUser).not.toHaveBeenCalled();
  });

  it("returns no_drift when user is fully in sync (ok state)", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: true });
    seedRolesConfig({ "alice@example.com": ["admin"] }, "10");

    const result = await repairSuperuserDrift(
      makeAuth("admin@example.com"),
      "alice@example.com",
      10
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("no_drift");
    }
  });

  it("returns no_drift when user has neither DB flag nor roles (none state)", async () => {
    mockUser = makeUser({ email: "alice@example.com", isDustSuperUser: false });
    seedRolesConfig({}, "10");

    const result = await repairSuperuserDrift(
      makeAuth("admin@example.com"),
      "alice@example.com",
      10
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("no_drift");
    }
  });

  it("returns not_found when user does not exist", async () => {
    mockUser = null;

    const result = await repairSuperuserDrift(
      makeAuth("admin@example.com"),
      "nobody@example.com",
      1
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.type).toBe("not_found");
    }
  });
});
