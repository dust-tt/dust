import { enrichMembers, getCrossRegionOrphans } from "@app/poke/swr/superusers";
import type { PokeGetSuperusers, SuperuserMember } from "@app/types/poke/roles";
import { describe, expect, it } from "vitest";

const member = (email: string): SuperuserMember => ({
  sId: email,
  email,
  fullName: email,
  membershipRole: "user",
  isDustSuperUser: false,
});

function snapshot(
  members: SuperuserMember[],
  roleEntries: PokeGetSuperusers["roleEntries"]
): PokeGetSuperusers {
  return { members, roleEntries };
}

describe("superuser administration derivation", () => {
  it("enriches regional members from that region's roles snapshot", () => {
    const current = snapshot([member("User@Dust.tt")], {
      "user@dust.tt": ["support"],
    });

    expect(enrichMembers(current)).toEqual([
      expect.objectContaining({
        email: "User@Dust.tt",
        hasPokeRoleEntry: true,
        pokeRoles: ["support"],
      }),
    ]);
  });

  it("reports role entries absent from the normalized regional member union", () => {
    const current = snapshot([member("eu@dust.tt")], {
      "eu@dust.tt": ["admin"],
      "us@dust.tt": ["support"],
      "former@dust.tt": ["talent"],
    });
    const other = snapshot([member("US@Dust.tt")], {});

    expect(getCrossRegionOrphans(current, other)).toEqual([
      { email: "former@dust.tt", pokeRoles: ["talent"] },
    ]);
  });

  it("fails closed while either regional snapshot is unavailable", () => {
    expect(getCrossRegionOrphans(undefined, snapshot([], {}))).toEqual([]);
  });
});
