import { PokeFavoriteButton } from "@app/components/poke/PokeFavorites";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const CURRENT_URL = "/poke/w_123/assistants/agent_1";

// Distinctive substrings from each icon's SVG path data (sparkle/src/icons/v2-stroke), used to
// tell the outline star and the filled star apart in the rendered DOM.
const STAR_OUTLINE_PATH_FRAGMENT = "M11.5 1.679";
const STAR_FILLED_PATH_FRAGMENT = "M12.65 1.78";

const isFavorite = vi.fn();
const toggleFavorite = vi.fn();

vi.mock("@app/lib/platform", () => ({
  useAppRouter: () => ({ asPath: CURRENT_URL }),
}));

vi.mock("@app/poke/swr/currentPage", () => ({
  useCurrentPage: () => ({
    url: CURRENT_URL,
    data: { type: "Agent", name: "Test Agent" },
  }),
}));

vi.mock("@app/poke/swr/favorites", () => ({
  POKE_FAVORITE_TYPES: [],
  usePokeFavorites: () => ({
    isFavorite,
    toggleFavorite,
  }),
}));

describe("PokeFavoriteButton", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    isFavorite.mockReset();
    toggleFavorite.mockReset();
  });

  it("renders the outline star when the page is not favorited", async () => {
    isFavorite.mockReturnValue(false);

    render(<PokeFavoriteButton />);

    const button = await screen.findByRole("button", {
      name: "Add to favorites (⌘D)",
    });
    expect(button.innerHTML).toContain(STAR_OUTLINE_PATH_FRAGMENT);
    expect(button.innerHTML).not.toContain(STAR_FILLED_PATH_FRAGMENT);
  });

  it("renders the filled star when the page is favorited", async () => {
    isFavorite.mockReturnValue(true);

    render(<PokeFavoriteButton />);

    const button = await screen.findByRole("button", {
      name: "Remove from favorites (⌘D)",
    });
    expect(button.innerHTML).toContain(STAR_FILLED_PATH_FRAGMENT);
    expect(button.innerHTML).not.toContain(STAR_OUTLINE_PATH_FRAGMENT);
  });

  it("calls toggleFavorite with the current page when clicked", async () => {
    isFavorite.mockReturnValue(false);
    const user = userEvent.setup();

    render(<PokeFavoriteButton />);

    const button = await screen.findByRole("button", {
      name: "Add to favorites (⌘D)",
    });
    await user.click(button);

    expect(toggleFavorite).toHaveBeenCalledWith(
      expect.objectContaining({ url: CURRENT_URL })
    );
  });
});
