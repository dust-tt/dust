import { PodFileTabPreview } from "@app/components/pod/PodFileTabPreview";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { fireEvent, render, screen } from "@testing-library/react";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@app/lib/platform", () => ({
  useAppRouter: () => ({
    asPath: "/pods/pod-abc",
    events: { on: vi.fn(), off: vi.fn() },
  }),
  useNavigationBlocker: vi.fn(),
}));

const fetchMock = vi.fn<typeof fetch>();
const owner = LightWorkspaceFactory.build();

beforeEach(() => {
  fetchMock.mockImplementation(
    async (_url, init) =>
      new Response(init?.method === "HEAD" ? null : "# Pinned document", {
        headers: { "Content-Type": "text/markdown" },
      })
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

it("keeps pinned Markdown read-only without edit permission", async () => {
  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <PodFileTabPreview
        owner={owner}
        filePath="pod-abc/brief.md"
        canEdit={false}
      />
    </SWRConfig>
  );

  fireEvent.doubleClick(
    await screen.findByRole("heading", { name: "Pinned document" })
  );
  const document = screen.getByRole("textbox", { name: "Document content" });
  fireEvent.keyDown(document, { key: "s", ctrlKey: true });

  expect(document).toHaveAttribute("contenteditable", "false");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ method: "PUT" })
  );
});

it("allows editing pinned Markdown until permission is revoked", async () => {
  const { rerender } = render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <PodFileTabPreview owner={owner} filePath="pod-abc/brief.md" canEdit />
    </SWRConfig>
  );

  const document = await screen.findByRole("textbox", {
    name: "Document content",
  });
  expect(document).toHaveAttribute("contenteditable", "true");
  expect(screen.getByRole("status")).toHaveTextContent(/^Saved$/);

  rerender(
    <SWRConfig value={{ provider: () => new Map() }}>
      <PodFileTabPreview
        owner={owner}
        filePath="pod-abc/brief.md"
        canEdit={false}
      />
    </SWRConfig>
  );

  expect(document).toHaveAttribute("contenteditable", "false");
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(fetchMock).not.toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ method: "PUT" })
  );
});
