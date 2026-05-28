import { getDefaultSkillFormData } from "@app/components/skill_builder/skillFormData";
import type { UserType } from "@app/types/user";
import { describe, expect, it } from "vitest";

const user: UserType = {
  sId: "u_test",
  id: 1,
  createdAt: 0,
  provider: "google",
  username: "test",
  email: "test@example.com",
  firstName: "Test",
  lastName: "User",
  fullName: "Test User",
  image: null,
  lastLoginAt: null,
};

describe("getDefaultSkillFormData", () => {
  it("defaults self-improvement to disabled for new skills", () => {
    expect(getDefaultSkillFormData({ user }).reinforcement).toBe("off");
  });
});
