import { describe, expect, it } from "vitest";
import { parseGoalCommand } from "./utils";

describe("parseGoalCommand", () => {
  it("extracts the objective and removes the slash command", () => {
    expect(parseGoalCommand("/goal Ship and verify the feature", true)).toEqual(
      {
        input: "Ship and verify the feature",
        goal: { objective: "Ship and verify the feature" },
      }
    );
  });

  it("supports multiline objectives", () => {
    expect(parseGoalCommand("/goal Build it\nThen test it", true)).toEqual({
      input: "Build it\nThen test it",
      goal: { objective: "Build it\nThen test it" },
    });
  });

  it("leaves messages unchanged when the flag is disabled", () => {
    expect(parseGoalCommand("/goal Do the work", false)).toEqual({
      input: "/goal Do the work",
      goal: undefined,
    });
  });

  it("does not treat an empty command as a goal", () => {
    expect(parseGoalCommand("/goal ", true)).toEqual({
      input: "/goal ",
      goal: undefined,
    });
  });
});
