import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EmojiDropdown } from "@app/components/editor/input_bar/EmojiDropdown";

describe("EmojiDropdown", () => {
  const mockCommand = vi.fn();
  const mockClientRect = vi.fn(() => ({
    left: 100,
    top: 200,
    width: 10,
    height: 20,
    right: 110,
    bottom: 220,
    x: 100,
    y: 200,
    toJSON: () => ({}),
  }));

  it("shows popular emojis when query is empty", async () => {
    render(
      <EmojiDropdown
        query=""
        command={mockCommand}
        clientRect={mockClientRect}
      />
    );

    // Should show curated popular emojis
    const items = await screen.findAllByRole("menuitem");
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBeLessThanOrEqual(20);
  });

  it("filters emojis based on query", async () => {
    const { rerender } = render(
      <EmojiDropdown
        query="smile"
        command={mockCommand}
        clientRect={mockClientRect}
      />
    );

    // Should show smile-related emojis
    const items = await screen.findAllByRole("menuitem");
    expect(items.length).toBeGreaterThan(0);

    // Rerender with different query
    rerender(
      <EmojiDropdown
        query="heart"
        command={mockCommand}
        clientRect={mockClientRect}
      />
    );

    // Should show different emojis
    const heartItems = await screen.findAllByRole("menuitem");
    expect(heartItems.length).toBeGreaterThan(0);
  });

  it("shows no results message when no emojis match", () => {
    render(
      <EmojiDropdown
        query="xyzabc123notfound"
        command={mockCommand}
        clientRect={mockClientRect}
      />
    );

    expect(screen.getByText("No emoji found")).toBeDefined();
  });

  it("limits results to 20 emojis when searching", async () => {
    // Search for a very common term that would match many emojis
    render(
      <EmojiDropdown
        query="face"
        command={mockCommand}
        clientRect={mockClientRect}
      />
    );

    const items = await screen.findAllByRole("menuitem");
    // Should not exceed 20 results
    expect(items.length).toBeLessThanOrEqual(20);
  });

  it("returns null when clientRect is not provided", () => {
    const { container } = render(
      <EmojiDropdown query="" command={mockCommand} clientRect={null} />
    );

    // Should not render anything
    expect(container.firstChild).toBeNull();
  });
});
