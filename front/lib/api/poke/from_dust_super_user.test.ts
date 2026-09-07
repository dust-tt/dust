import { Authenticator } from "@app/lib/auth";
import { describe, expect, it } from "vitest";

describe("Authenticator.fromDustSuperUser", () => {
  it("sets isDustSuperUser without a provisioned Dust user", async () => {
    const auth = await Authenticator.fromDustSuperUser({
      pokePrincipal: { email: "seb@dust.tt", name: "Seb" },
    });

    expect(auth.isDustSuperUser()).toBe(true);
    expect(auth.user()).toBeNull();
    expect(auth.getPokePrincipal()).toEqual({
      email: "seb@dust.tt",
      name: "Seb",
    });
    expect(auth.toPokeUserJSON()).toMatchObject({
      email: "seb@dust.tt",
      firstName: "Seb",
      fullName: "Seb",
    });
  });

  it("preserves poke identity when re-scoping", async () => {
    const auth = await Authenticator.fromDustSuperUser({
      pokePrincipal: { email: "seb@dust.tt", name: null },
    });
    const scoped = await Authenticator.fromDustSuperUser({
      pokePrincipal: auth.getPokePrincipal(),
    });

    expect(scoped.isDustSuperUser()).toBe(true);
    expect(scoped.getPokePrincipal().email).toBe("seb@dust.tt");
  });
});
