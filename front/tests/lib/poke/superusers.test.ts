import {
  listSuperuserMembers,
  type SuperuserAdminError,
  setDustSuperUser,
  setPokeRoles,
} from "@app/lib/api/poke/superusers";
import type { Authenticator } from "@app/lib/auth";
import type { RolesConfig } from "@app/lib/poke/roles";
import { beforeEach, describe, expect, it, vi } from "vitest";

let rolesConfig: RolesConfig = {};
const mockWriteRoles = vi.fn();
vi.mock("@app/lib/poke/roles", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/poke/roles")>();
  return {
    ...actual,
    loadRolesForEditing: vi.fn(async () => structuredClone(rolesConfig)),
    writeRoles: (...args: unknown[]) => mockWriteRoles(...args),
  };
});

const mockFetchByModelIds = vi.fn();
const mockFetchByEmail = vi.fn();
const mockFetchById = vi.fn();
vi.mock("@app/lib/resources/user_resource", () => ({
  UserResource: {
    fetchByModelIds: (...args: unknown[]) => mockFetchByModelIds(...args),
    fetchByEmail: (...args: unknown[]) => mockFetchByEmail(...args),
    fetchById: (...args: unknown[]) => mockFetchById(...args),
  },
}));

const mockGetActiveMemberships = vi.fn();
const mockGetActiveMembership = vi.fn();
vi.mock("@app/lib/resources/membership_resource", () => ({
  MembershipResource: {
    getActiveMemberships: (...args: unknown[]) =>
      mockGetActiveMemberships(...args),
    getActiveMembershipOfUserInWorkspace: (...args: unknown[]) =>
      mockGetActiveMembership(...args),
  },
}));

vi.mock("@app/lib/workspace", () => ({
  renderLightWorkspaceType: ({ workspace }: { workspace: unknown }) =>
    workspace,
}));

const auth = {
  getNonNullableWorkspace: () => ({ sId: "ws-1", name: "Dust" }),
} as Authenticator;

function makeUser({
  id = 1,
  email = "user@dust.tt",
  isDustSuperUser = false,
}: {
  id?: number;
  email?: string;
  isDustSuperUser?: boolean;
} = {}) {
  return {
    id,
    sId: `user-${id}`,
    email,
    isDustSuperUser,
    fullName: () => "Test User",
    setDustSuperUser: vi.fn(),
  };
}

describe("simple superuser administration", () => {
  beforeEach(() => {
    rolesConfig = {};
    vi.clearAllMocks();
    mockGetActiveMembership.mockResolvedValue({ role: "user" });
  });

  it("lists every active member and reports orphaned JSON entries", async () => {
    const user = makeUser({ isDustSuperUser: true });
    rolesConfig = {
      "user@dust.tt": ["admin"],
      "former@dust.tt": ["support"],
    };
    mockGetActiveMemberships.mockResolvedValue({
      memberships: [{ userId: 1, role: "admin" }],
    });
    mockFetchByModelIds.mockResolvedValue([user]);

    const result = await listSuperuserMembers(auth);

    expect(result.members).toEqual([
      expect.objectContaining({
        email: "user@dust.tt",
        isDustSuperUser: true,
        hasPokeRoleEntry: true,
        pokeRoles: ["admin"],
      }),
    ]);
    expect(result.orphanedRoleEntries).toEqual([
      { email: "former@dust.tt", pokeRoles: ["support"] },
    ]);
  });

  it("adds or updates roles for an active workspace member", async () => {
    mockFetchByEmail.mockResolvedValue(makeUser());

    const result = await setPokeRoles(auth, "User@Dust.tt", [
      "admin",
      "support",
    ]);

    expect(mockWriteRoles).toHaveBeenCalledWith({
      "user@dust.tt": ["admin", "support"],
    });
    expect(result).toEqual({
      email: "user@dust.tt",
      previousRoles: [],
      newRoles: ["admin", "support"],
    });
  });

  it("removes an entry even when it is no longer a workspace member", async () => {
    rolesConfig = {
      "active@dust.tt": ["admin"],
      "former@dust.tt": ["support"],
    };

    await setPokeRoles(auth, "former@dust.tt", null);

    expect(mockFetchByEmail).not.toHaveBeenCalled();
    expect(mockWriteRoles).toHaveBeenCalledWith({
      "active@dust.tt": ["admin"],
    });
  });

  it("does not add roles for someone outside the workspace", async () => {
    mockFetchByEmail.mockResolvedValue(makeUser());
    mockGetActiveMembership.mockResolvedValue(null);

    await expect(setPokeRoles(auth, "user@dust.tt", ["admin"])).rejects.toEqual(
      expect.objectContaining<Partial<SuperuserAdminError>>({
        type: "not_active_member",
      })
    );
    expect(mockWriteRoles).not.toHaveBeenCalled();
  });

  it("toggles the database flag independently of JSON roles", async () => {
    const user = makeUser({ isDustSuperUser: false });
    mockFetchById.mockResolvedValue(user);

    const result = await setDustSuperUser(auth, user.sId, true);

    expect(user.setDustSuperUser).toHaveBeenCalledWith(true);
    expect(mockWriteRoles).not.toHaveBeenCalled();
    expect(result).toEqual({
      email: "user@dust.tt",
      userSId: "user-1",
      previousValue: false,
      newValue: true,
    });
  });
});
