import { errorNotification, formatError } from "@app/lib/api_error_messages";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { describe, expect, it } from "vitest";

const WITH_LOCALISATION = { hasLocalisation: true };
const WITHOUT_LOCALISATION = { hasLocalisation: false };

describe("formatError", () => {
  it("describes an API error by its translated type, with raw details", () => {
    expect(
      formatError(
        { type: "file_too_large", message: "Max size is 5MB." },
        WITH_LOCALISATION
      )
    ).toEqual({
      description: "The file is too large.",
      details: "Code: file_too_large\nMessage: Max size is 5MB.",
    });
  });

  it("formats an API error response like the error it wraps", () => {
    expect(
      formatError(
        { error: { type: "skill_not_found", message: "x" } },
        WITH_LOCALISATION
      )
    ).toEqual({
      description: "Skill not found.",
      details: "Code: skill_not_found\nMessage: x",
    });
  });

  it("uses the fallback description for any other value", () => {
    expect(
      formatError(new TypeError("Failed to fetch"), WITH_LOCALISATION)
    ).toEqual({
      description: "An unexpected error occurred.",
      details: "Message: Failed to fetch",
    });
    expect(
      formatError(
        { type: "connector_error", message: "Connector failed." },
        WITH_LOCALISATION
      )
    ).toEqual({
      description: "An unexpected error occurred.",
      details: "Code: connector_error\nMessage: Connector failed.",
    });
    expect(formatError(undefined, WITH_LOCALISATION)).toEqual({
      description: "An unexpected error occurred.",
      details: undefined,
    });
  });

  it("translates the description and details labels", async () => {
    const messages = await loadCatalog("fr-FR");
    i18n.loadAndActivate({ locale: "fr-FR", messages });

    expect(
      formatError(
        { type: "file_not_found", message: "Missing fil_123." },
        WITH_LOCALISATION
      )
    ).toEqual({
      description: "Fichier introuvable.",
      details: "Code : file_not_found\nMessage : Missing fil_123.",
    });
  });

  it("builds an error notification with the given title", () => {
    expect(
      errorNotification(
        "Import failed",
        {
          type: "file_not_found",
          message: "Missing.",
        },
        WITH_LOCALISATION
      )
    ).toEqual({
      type: "error",
      title: "Import failed",
      description: "File not found.",
      details: "Code: file_not_found\nMessage: Missing.",
    });
  });
});

describe("formatError without the localisation flag", () => {
  it("describes an API error by its raw message, without details", () => {
    expect(
      formatError(
        { type: "file_too_large", message: "Max size is 5MB." },
        WITHOUT_LOCALISATION
      )
    ).toEqual({ description: "Max size is 5MB." });
  });

  it("describes any other value by its raw message", () => {
    expect(
      formatError(new TypeError("Failed to fetch"), WITHOUT_LOCALISATION)
    ).toEqual({ description: "Failed to fetch" });
    expect(
      formatError(
        { error: { type: "connector_error", message: "Connector failed." } },
        WITHOUT_LOCALISATION
      )
    ).toEqual({ description: "Connector failed." });
  });

  it("uses the fallback description for a value without a message", () => {
    expect(formatError(undefined, WITHOUT_LOCALISATION)).toEqual({
      description: "An unexpected error occurred.",
    });
    expect(formatError(new Error(""), WITHOUT_LOCALISATION)).toEqual({
      description: "An unexpected error occurred.",
    });
  });
});
