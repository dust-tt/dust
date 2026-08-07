import { SandboxFunctionUnpublishValidationDetails } from "@app/components/assistant/conversation/tool_validation/SandboxFunctionUnpublishValidationDetails";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

describe("SandboxFunctionUnpublishValidationDetails", () => {
  it("shows the function and the permanent deletion scope", () => {
    render(
      <SandboxFunctionUnpublishValidationDetails input={{ slug: "greet" }} />
    );

    expect(screen.getByText("greet")).toBeInTheDocument();
    expect(
      screen.getByText(/permanently deletes the published function/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/invocation and tool-action history/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/source file in the Pod will remain/i)
    ).toBeInTheDocument();
  });
});
