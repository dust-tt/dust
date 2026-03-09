import { buildProjectKickoffPrompt } from "@app/lib/api/assistant/project_kickoff";
import { describe, expect, it } from "vitest";

describe("buildProjectKickoffPrompt", () => {
  const userFullName = "Test User";
  const userSId = "user_123";

  const prompt = buildProjectKickoffPrompt({
    projectName: "Test Kickstart",
    userFullName,
  });

  it("should enforce the first message format and avoid fake search claims", () => {
    expect(prompt).toContain("Your first message MUST:");
    expect(prompt).toContain("Start with this exact first line:");
    expect(prompt).toContain(
      "Hey <sender mention>; happy to help you kickstart `Test Kickstart`."
    );
    expect(prompt).toContain(
      "Use as `<sender mention>` the exact mention token from the Sender metadata line"
    );
    expect(prompt).toContain(`Do NOT use plain \`@${userFullName}\``);
    expect(prompt).not.toContain(
      `:mention_user[${userFullName}]{sId=${userSId}}`
    );
    expect(prompt).toContain(
      "Do not claim that you already searched anything in this first message."
    );
  });

  it("should guide direct project context writes without skill detours", () => {
    expect(prompt).toContain(
      "use `project_manager.add_file` directly with `content`"
    );
    expect(prompt).toContain(
      "Do NOT enable skills/tools just to create files when `project_manager.add_file` can do it directly"
    );
  });

  it("should require accurate search reporting", () => {
    expect(prompt).toContain(
      'Never claim "I searched" or "I didn\'t find" unless you actually ran search tools in this conversation'
    );
  });

  it("should enforce quick replies at the end of the message", () => {
    expect(prompt).toContain("Quick reply formatting rules:");
    expect(prompt).toContain(
      "- Quick replies MUST be the last lines of the message"
    );
    expect(prompt).toContain(
      ':quickReply[Update project description]{message="Update the description."}'
    );
    expect(prompt).toContain(
      ':quickReply[Create project document]{message="Create an initial project document."}'
    );
  });
});
