import { fireEvent, render, screen } from "@testing-library/react";

import { UserIcon } from "@sparkle/icons/app";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../Dropdown";

describe("DropdownMenuItem", () => {
  it("should trigger the link when clicking anywhere in the item", () => {
    const mockHref = "/test";
    const mockLabel = "Test Item";

    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Open</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem label={mockLabel} icon={UserIcon} href={mockHref} />
        </DropdownMenuContent>
      </DropdownMenu>
    );

    // Open the dropdown
    fireEvent.click(screen.getByText("Open"));

    // Get the menu item
    const menuItem = screen.getByText(mockLabel).closest("div");
    if (!menuItem) {
      throw new Error("Menu item not found");
    }

    // Click on different parts of the menu item
    // 1. Click on the text
    fireEvent.click(screen.getByText(mockLabel));
    expect(window.location.pathname).toBe(mockHref);

    // 2. Click on the icon area
    const iconArea = menuItem.querySelector("svg");
    if (iconArea) {
      fireEvent.click(iconArea);
      expect(window.location.pathname).toBe(mockHref);
    }

    // 3. Click on empty space
    const emptySpace = menuItem.querySelector("div:not([class*='icon'])");
    if (emptySpace) {
      fireEvent.click(emptySpace);
      expect(window.location.pathname).toBe(mockHref);
    }
  });
});
