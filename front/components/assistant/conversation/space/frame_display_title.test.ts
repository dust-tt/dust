import { describe, expect, it } from "vitest";

import { getFrameDisplayTitle } from "./frame_display_title";

describe("getFrameDisplayTitle", () => {
  it("extracts title from frame metadata", () => {
    const source = `export const metadata = { title: "Team dashboard" };`;
    expect(getFrameDisplayTitle("banner.html", source)).toBe("Team dashboard");
  });

  it("extracts title from heading class", () => {
    const source = `<p className="heading-2xl font-bold">Hello, World!</p>`;
    expect(getFrameDisplayTitle("banner.html", source)).toBe("Hello, World!");
  });

  it("humanizes the file name when no title is found", () => {
    expect(getFrameDisplayTitle("team_status_board.html")).toBe(
      "Team Status Board"
    );
  });
});
