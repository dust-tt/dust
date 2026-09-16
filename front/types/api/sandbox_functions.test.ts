import { describe, expect, it } from "vitest";
import { RUNNER_ERROR_CODES } from "../../../cli/dust-sandbox/functions-runner/protocol";
import { FRAME_FUNCTION_REFERENCE_REGEX } from "../../../viz/app/lib/frame-function-slug";
import {
  isValidSandboxFunctionSlug,
  SANDBOX_FUNCTION_RUNNER_ERROR_CODES,
} from "./sandbox_functions";

describe("SANDBOX_FUNCTION_RUNNER_ERROR_CODES", () => {
  it("stays aligned with the runner protocol", () => {
    expect(SANDBOX_FUNCTION_RUNNER_ERROR_CODES).toEqual(RUNNER_ERROR_CODES);
  });
});

describe("isValidSandboxFunctionSlug", () => {
  it("accepts a manifest function name", () => {
    expect(isValidSandboxFunctionSlug("greet")).toBe(true);
    expect(isValidSandboxFunctionSlug("send-slack-message")).toBe(true);
    expect(isValidSandboxFunctionSlug("a")).toBe(true);
  });

  it("rejects the retired app prefix in every shape", () => {
    // Pod functions carried `<appPrefix>__<name>`. A v2 slug is the bare manifest name, so an
    // underscore now names nothing regardless of where it sits.
    expect(isValidSandboxFunctionSlug("tasklist__add-task")).toBe(false);
    expect(isValidSandboxFunctionSlug("task-list__add-task")).toBe(false);
    expect(isValidSandboxFunctionSlug("tasklist__admin__purge")).toBe(false);
    expect(isValidSandboxFunctionSlug("__greet")).toBe(false);
    expect(isValidSandboxFunctionSlug("tasklist__")).toBe(false);
    expect(isValidSandboxFunctionSlug("__")).toBe(false);
    expect(isValidSandboxFunctionSlug("tasklist_add-task")).toBe(false);
  });

  it("still rejects uppercase, spaces and path separators", () => {
    expect(isValidSandboxFunctionSlug("TaskList-addTask")).toBe(false);
    expect(isValidSandboxFunctionSlug("tasklist add-task")).toBe(false);
    expect(isValidSandboxFunctionSlug("tasklist/add-task")).toBe(false);
  });

  it("rejects malformed hyphenation", () => {
    expect(isValidSandboxFunctionSlug("list--notes")).toBe(false);
    expect(isValidSandboxFunctionSlug("-greet")).toBe(false);
    expect(isValidSandboxFunctionSlug("greet-")).toBe(false);
    expect(isValidSandboxFunctionSlug("")).toBe(false);
  });

  // A Frame validates the reference it passes to `useFrameFunction` in the viz workspace, which
  // cannot import from front and so carries its own copy of the grammar. Drift there is silent and
  // expensive: a reference viz rejects resolves to a null SWR key, so the Frame issues no request
  // at all rather than failing loudly.
  //
  // The two are now the same grammar, which is the point: a name the manifest declares, the slug
  // stored for it, and the reference a Frame sends are one string, so none of the three can be
  // valid while another is not.
  it("stays aligned with the reference grammar Frames validate against", () => {
    const names = [
      "greet",
      "send-slack-message",
      "a",
      "tasklist__add-task",
      "task-list__x",
      "tasklist__admin__purge",
      "__greet",
      "tasklist__",
      "tasklist_add-task",
      "TaskList__addTask",
      "tasklist add-task",
      "tasklist/add-task",
      "list--notes",
      "-greet",
      "greet-",
      "",
    ];

    for (const name of names) {
      expect({
        name,
        accepted: FRAME_FUNCTION_REFERENCE_REGEX.test(name),
      }).toEqual({ name, accepted: isValidSandboxFunctionSlug(name) });
    }
  });

  // `dsbx function run <name>` validates against is_valid_name in
  // cli/dust-sandbox/src/commands/function/mod.rs, which allows [A-Za-z0-9_-] only, and then
  // resolves the name to `<name>.<ext>` in a flat read_dir of $DUST_FUNCTIONS_DIR. A slug is one
  // file in that flat mount, so it must never grow a character dsbx would refuse.
  it("produces names dsbx can resolve", () => {
    const dsbxValidName = /^[A-Za-z0-9_-]+$/;

    for (const slug of ["greet", "add-task", "list-notes-2"]) {
      expect(isValidSandboxFunctionSlug(slug)).toBe(true);
      expect(dsbxValidName.test(slug)).toBe(true);
    }
  });
});
