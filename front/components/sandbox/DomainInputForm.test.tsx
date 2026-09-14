import { DomainInputForm } from "@app/components/sandbox/DomainInputForm";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const onSubmit = vi.fn(async () => true);

function setup(
  overrides: Partial<ComponentProps<typeof DomainInputForm>> = {}
) {
  render(
    <DomainInputForm
      duplicateMessage={() => null}
      validMessage={(domain) => `Will be saved as ${domain}.`}
      onSubmit={onSubmit}
      submitLabel="Add domain"
      isUpdating={false}
      {...overrides}
    />
  );
}

describe("DomainInputForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    onSubmit.mockResolvedValue(true);
  });

  it("shows the hint and disables submit when empty", () => {
    setup();
    expect(screen.getByText(/Use an exact domain/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add domain" })).toBeDisabled();
  });

  it("surfaces a normalization error and blocks submit", async () => {
    setup();
    await userEvent.type(screen.getByRole("textbox"), "bad*domain");
    expect(screen.getByText(/Wildcards must use the form/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add domain" })).toBeDisabled();
  });

  it("shows the caller's duplicate message and blocks submit", async () => {
    setup({
      duplicateMessage: (domain) =>
        domain === "api.openai.com" ? "Already allowed." : null,
    });
    await userEvent.type(screen.getByRole("textbox"), "api.openai.com");
    expect(screen.getByText("Already allowed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add domain" })).toBeDisabled();
  });

  it("submits the normalized domain and clears the input on success", async () => {
    setup();
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "api.openai.com");
    expect(
      screen.getByText("Will be saved as api.openai.com.")
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add domain" }));

    expect(onSubmit).toHaveBeenCalledWith("api.openai.com");
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("keeps the input when the submit fails", async () => {
    onSubmit.mockResolvedValue(false);
    setup();
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "api.openai.com");
    await userEvent.click(screen.getByRole("button", { name: "Add domain" }));

    expect(onSubmit).toHaveBeenCalledWith("api.openai.com");
    expect(input).toHaveValue("api.openai.com");
  });
});
