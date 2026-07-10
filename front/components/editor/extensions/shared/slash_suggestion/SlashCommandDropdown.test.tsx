import { SlashCommandDropdown } from "@app/components/editor/extensions/shared/slash_suggestion/SlashCommandDropdown";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("SlashCommandDropdown", () => {
  it("shows an item tooltip on hover", async () => {
    render(
      <SlashCommandDropdown
        clientRect={() => new DOMRect(100, 200, 10, 20)}
        command={vi.fn()}
        sections={[
          {
            label: "Capabilities",
            items: [
              {
                action: "select-skill",
                description: "Short description",
                icon: () => null,
                id: "skill-1",
                label: "Test skill",
                tooltip: { description: "Full skill description" },
              },
            ],
          },
        ]}
      />
    );

    await act(async () => {
      fireEvent.pointerMove(screen.getByRole("menuitem"), {
        pointerType: "mouse",
      });
      await new Promise((resolve) => setTimeout(resolve, 350));
    });

    expect(screen.getByRole("tooltip")).toHaveTextContent(
      "Full skill description"
    );
  });
});
