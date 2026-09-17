import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { classifyExternal, isDustEmail } from "../src/external.ts";
import { makeRecording } from "./fixtures.ts";

describe("classifyExternal", () => {
  it("trusts meeting.type=external", () => {
    const result = classifyExternal(makeRecording());
    assert.deepEqual(result, {
      external: true,
      reason: "meeting.type=external",
      meetingType: "external",
    });
  });

  it("skips meeting.type=internal even if the title looks like a customer", () => {
    const result = classifyExternal(
      makeRecording({
        title: "Acme sync",
        meeting: {
          ...makeRecording().meeting!,
          type: "internal",
          participants: [
            { attended: true, email: "ilias@dust.tt", name: "Ilias" },
            { attended: true, email: "zach@dust.tt", name: "Zach" },
          ],
        },
      })
    );
    assert.equal(result.external, false);
    assert.equal(result.reason, "meeting.type=internal");
  });

  it("does not treat dust.help as the Dust org domain", () => {
    assert.equal(isDustEmail("ilias@dust.tt"), true);
    assert.equal(isDustEmail("someone@dust.help"), false);
    const result = classifyExternal(
      makeRecording({
        meeting: {
          ...makeRecording().meeting!,
          type: undefined as unknown as "internal",
          participants: [
            { attended: true, email: "ilias@dust.tt", name: "Ilias" },
            { attended: true, email: "partner@dust.help", name: "Partner" },
          ],
        },
      })
    );
    assert.equal(result.external, true);
    assert.match(result.reason, /dust\.help/);
  });

  it("falls back to non-dust.tt participant emails when meeting.type is missing", () => {
    const result = classifyExternal({
      recorder: { email: "ilias@dust.tt" },
      meeting: {
        participants: [{ email: "jane@acme.com" }],
      },
    });
    assert.equal(result.external, true);
    assert.match(result.reason, /jane@acme.com/);
  });
});
