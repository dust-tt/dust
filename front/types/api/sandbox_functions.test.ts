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

  // A Frame validates the reference it passes to `useFrameFunction` in the viz workspace, which
  // cannot import from front and so carries its own copy of the grammar. Drift there is silent and
  // expensive: a reference viz rejects resolves to a null SWR key, so the Frame issues no request
  // at all rather than failing loudly.
  //
  // The relationship is containment, not equality. viz accepts only the bare manifest name the
  // host can qualify, while this slug regex still admits the `<app>__` prefix Pod functions used;
  // no v2 publication produces one (`createForFramePublication` sets `slug: fn.name`) and none
  // exists in either region. So every reference viz accepts must be a valid slug, and a slug viz
  // rejects must be one no v2 Frame can name.
  it("accepts every reference the viz grammar lets a Frame send", () => {
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
      "list--notes",
      "-greet",
    ];

    for (const name of names) {
      if (FRAME_FUNCTION_REFERENCE_REGEX.test(name)) {
        expect({ name, accepted: isValidSandboxFunctionSlug(name) }).toEqual({
          name,
          accepted: true,
        });
      }
    }
  });

  it("is the wider grammar, and only by the retired app prefix", () => {
    const widerOnly = ["tasklist__add-task", "task-list__x"];

    for (const slug of widerOnly) {
      expect({
        slug,
        slugAccepted: isValidSandboxFunctionSlug(slug),
        referenceAccepted: FRAME_FUNCTION_REFERENCE_REGEX.test(slug),
      }).toEqual({ slug, slugAccepted: true, referenceAccepted: false });
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
