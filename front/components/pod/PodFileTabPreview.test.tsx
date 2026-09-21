import { PodFileTabPreview } from "@app/components/pod/PodFileTabPreview";
import { LightWorkspaceFactory } from "@app/tests/utils/LightWorkspaceFactory";
import { fireEvent, render, screen } from "@testing-library/react";
import { SWRConfig } from "swr";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.unstubAllGlobals());

it("opens pinned Markdown read-only without any writes", async () => {
  const fetchMock = vi.fn<typeof fetch>().mockImplementation(
    async (_url, init) =>
      new Response(init?.method === "HEAD" ? null : "# Pinned document", {
        headers: { "Content-Type": "text/markdown" },
      })
  );
  vi.stubGlobal("fetch", fetchMock);

  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <PodFileTabPreview
        owner={LightWorkspaceFactory.build()}
        filePath="pod-abc/brief.md"
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
