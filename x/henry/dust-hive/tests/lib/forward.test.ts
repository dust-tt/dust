import { describe, expect, it } from "bun:test";
import { canAutoStopForwarderPortProcess } from "../../src/lib/forward";

describe("forwarder process ownership", () => {
  it("can stop another dust-hive forwarder", () => {
    expect(canAutoStopForwarderPortProcess(3000, "bun run src/forward-daemon.ts 10000")).toBe(true);
  });

  it("can stop a standalone Storybook on its forwarded port", () => {
    expect(
      canAutoStopForwarderPortProcess(
        6006,
        "node /repo/node_modules/.bin/storybook dev -p 6006"
      )
    ).toBe(true);
  });

  it("does not stop Storybook processes on unrelated ports", () => {
    expect(canAutoStopForwarderPortProcess(3000, "storybook dev -p 3000")).toBe(false);
  });

  it("does not stop unknown processes on the Storybook port", () => {
    expect(canAutoStopForwarderPortProcess(6006, "node server.js")).toBe(false);
  });
});
