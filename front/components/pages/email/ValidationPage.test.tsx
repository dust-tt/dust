import { RegionProvider } from "@app/lib/auth/RegionContext";
import { render, waitFor } from "@testing-library/react";
import type React from "react";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ValidationPage } from "./ValidationPage";

vi.mock("@app/lib/platform", () => ({
  useSearchParam: (name: string) => {
    return new URLSearchParams(window.location.search).get(name);
  },
}));

vi.mock("@dust-tt/sparkle", () => ({
  Button: ({ label, onClick }: { label: string; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {label}
    </button>
  ),
  DustLogoSquare: () => null,
  Icon: () => null,
  Page: {
    Header: ({ title }: { title: React.ReactNode }) => <h1>{title}</h1>,
  },
  Spinner: () => <div role="status" />,
}));

describe("ValidationPage", () => {
  let submitSpy: MockInstance;

  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(
      null,
      "",
      "/email/validation?token=approval-token&region=europe-west1&regionUrl=https%3A%2F%2Feu.dust.tt"
    );
    submitSpy = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    submitSpy.mockRestore();
    window.localStorage.clear();
  });

  it("posts email validation to the region URL from query params", async () => {
    render(
      <RegionProvider>
        <ValidationPage />
      </RegionProvider>
    );

    const form = await waitFor(() => {
      const renderedForm = document.querySelector("form");
      expect(renderedForm).not.toBeNull();
      return renderedForm;
    });

    if (!form) {
      throw new Error("Expected validation form");
    }

    expect(form.getAttribute("action")).toBe(
      "https://eu.dust.tt/api/email/validate-action"
    );
    expect(submitSpy).toHaveBeenCalledOnce();
    expect(window.location.search).toBe("?token=approval-token");

    const tokenInput = form.querySelector<HTMLInputElement>(
      'input[name="token"]'
    );
    if (!tokenInput) {
      throw new Error("Expected validation token input");
    }
    expect(tokenInput.value).toBe("approval-token");
  });
});
