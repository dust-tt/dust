import { useFormatAPIError } from "@app/hooks/useFormatAPIError";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

const NBSP = " ";

describe("useFormatAPIError", () => {
  it("returns the translated type alone when the server sent no message", () => {
    const { result } = renderHook(() => useFormatAPIError());

    expect(result.current({ error: { type: "user_not_found" } })).toBe(
      "The user was not found."
    );
  });

  it("appends the server message as raw context", () => {
    const { result } = renderHook(() => useFormatAPIError());

    expect(
      result.current({
        error: {
          type: "invalid_rows_request_error",
          message: "column foo is missing from your data.",
        },
      })
    ).toBe(
      'Your data is incomplete. Raw message: "column foo is missing from your data".'
    );
  });

  it("falls back to a generic sentence for unknown errors", () => {
    const { result } = renderHook(() => useFormatAPIError());

    expect(result.current(undefined)).toBe("Something went wrong.");
    expect(result.current(new Error("Network down"))).toBe(
      'Something went wrong. Raw message: "Network down".'
    );
  });

  it("translates the type and the raw message label", async () => {
    const messages = await loadCatalog("fr-FR");
    const { result } = renderHook(() => useFormatAPIError());

    await act(async () => {
      i18n.loadAndActivate({ locale: "fr-FR", messages });
    });

    expect(result.current({ error: { type: "user_not_found" } })).toBe(
      "L’utilisateur est introuvable."
    );
    expect(
      result.current({
        error: {
          type: "invalid_rows_request_error",
          message: "column foo is missing from your data",
        },
      })
    ).toBe(
      `Vos données sont incomplètes. Message brut${NBSP}: «${NBSP}column foo is missing from your data${NBSP}».`
    );
  });
});
