import { lowestRole } from "@app/types/user";
import { describe, expect, it } from "vitest";

describe("lowestRole", () => {
  it("returns the least privileged of the two roles", () => {
    expect(lowestRole("admin", "manager")).toBe("manager");
    expect(lowestRole("manager", "admin")).toBe("manager");
    expect(lowestRole("admin", "user")).toBe("user");
    expect(lowestRole("manager", "builder")).toBe("builder");
    expect(lowestRole("builder", "user")).toBe("user");
  });

  it("treats `none` as the least privileged role", () => {
    expect(lowestRole("admin", "none")).toBe("none");
    expect(lowestRole("none", "user")).toBe("none");
  });

  it("returns the role itself when both are equal", () => {
    expect(lowestRole("admin", "admin")).toBe("admin");
    expect(lowestRole("user", "user")).toBe("user");
    expect(lowestRole("none", "none")).toBe("none");
  });
});
