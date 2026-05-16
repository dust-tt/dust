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

function renderValidationPage() {
  render(
    <RegionProvider>
      <ValidationPage />
    </RegionProvider>
  );
}

async function getValidationForm() {
  const form = await waitFor(() => {
    const renderedForm = document.querySelector("form");
    expect(renderedForm).not.toBeNull();
    return renderedForm;
  });

  if (!form) {
    throw new Error("Expected validation form");
  }

  return form;
}

describe("ValidationPage", () => {
  let submitSpy: MockInstance;

  beforeEach(() => {
    vi.stubEnv("VITE_DUST_API_URL_EU", "https://eu.dust.tt");
    vi.stubEnv("VITE_DUST_API_URL_US", "https://dust.tt");
    window.localStorage.clear();
    window.history.replaceState(
      null,
      "",
      "/email/validation?token=approval-token&region=europe-west1"
    );
    submitSpy = vi
      .spyOn(HTMLFormElement.prototype, "submit")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    submitSpy.mockRestore();
    vi.unstubAllEnvs();
    window.localStorage.clear();
  });

  it("posts email validation to the URL derived from the region query param", async () => {
    renderValidationPage();

    const form = await getValidationForm();

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

  it("ignores regionUrl when resolving the validation URL", async () => {
    window.history.replaceState(
      null,
      "",
      "/email/validation?token=approval-token&region=europe-west1&regionUrl=https%3A%2F%2Fattacker.example"
    );

    renderValidationPage();

    const form = await getValidationForm();

    expect(form.getAttribute("action")).toBe(
      "https://eu.dust.tt/api/email/validate-action"
    );
    expect(submitSpy).toHaveBeenCalledOnce();
    expect(window.location.search).toBe("?token=approval-token");
  });
});
