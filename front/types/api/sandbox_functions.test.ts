import { describe, expect, it } from "vitest";
import { RUNNER_ERROR_CODES } from "../../../cli/dust-sandbox/functions-runner/protocol";
import { POD_FUNCTION_REFERENCE_REGEX } from "../../../viz/app/lib/pod-function-slug";
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
  it("accepts an app-prefixed slug", () => {
    expect(isValidSandboxFunctionSlug("tasklist__add-task")).toBe(true);
    expect(isValidSandboxFunctionSlug("task-list__add-task")).toBe(true);
  });

  it("accepts a bare slug, as published before app namespacing existed", () => {
    expect(isValidSandboxFunctionSlug("greet")).toBe(true);
    expect(isValidSandboxFunctionSlug("send-slack-message")).toBe(true);
  });

  it("rejects more than one app prefix", () => {
    expect(isValidSandboxFunctionSlug("tasklist__admin__purge")).toBe(false);
  });

  it("rejects a separator with a missing segment", () => {
    expect(isValidSandboxFunctionSlug("__greet")).toBe(false);
    expect(isValidSandboxFunctionSlug("tasklist__")).toBe(false);
    expect(isValidSandboxFunctionSlug("__")).toBe(false);
  });

  it("rejects a single underscore as a separator", () => {
    expect(isValidSandboxFunctionSlug("tasklist_add-task")).toBe(false);
  });

  it("still rejects uppercase, spaces and path separators", () => {
    expect(isValidSandboxFunctionSlug("TaskList__addTask")).toBe(false);
    expect(isValidSandboxFunctionSlug("tasklist add-task")).toBe(false);
    expect(isValidSandboxFunctionSlug("tasklist/add-task")).toBe(false);
  });

  // A Frame validates the `<podId>/<slug>` reference in the viz workspace, which cannot import from
  // front and so carries its own copy of this grammar. Drift there is silent and expensive: a
  // reference viz rejects resolves to a null SWR key, so the Frame issues no request at all rather
  // than failing loudly.
  it("stays aligned with the reference grammar Frames validate against", () => {
    const slugs = [
      "greet",
      "send-slack-message",
      "tasklist__add-task",
      "task-list__x",
      "tasklist__admin__purge",
      "__greet",
      "tasklist__",
      "tasklist_add-task",
      "TaskList__addTask",
      "tasklist add-task",
    ];

    for (const slug of slugs) {
      expect({
        slug,
        accepted: POD_FUNCTION_REFERENCE_REGEX.test(`vlt_1/${slug}`),
      }).toEqual({
        slug,
        accepted: isValidSandboxFunctionSlug(slug),
      });
    }
  });

  // `dsbx function run <name>` validates against is_valid_name in
  // cli/dust-sandbox/src/commands/function/mod.rs, which allows [A-Za-z0-9_-] only, and then
  // resolves the name to `<name>.<ext>` in a flat read_dir of $DUST_FUNCTIONS_DIR. Encoding the app
  // prefix in the slug rather than nesting directories is what keeps that contract intact, so a
  // slug must never grow a character dsbx would refuse.
  it("produces names dsbx can resolve", () => {
    const dsbxValidName = /^[A-Za-z0-9_-]+$/;

    for (const slug of ["greet", "tasklist__add-task", "task-list__x"]) {
      expect(isValidSandboxFunctionSlug(slug)).toBe(true);
      expect(dsbxValidName.test(slug)).toBe(true);
    }
  });
});
