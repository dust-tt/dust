import { loadLiveDocument } from "@app/lib/api/co_edition/live_file";
import { dfmToYDoc } from "@app/lib/api/co_edition/ydoc";
import { createCollabHocuspocus } from "@front-api/lib/collab_hocuspocus";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";

vi.mock("@app/lib/api/co_edition/live_file", async (importActual) => ({
  ...(await importActual<typeof import("@app/lib/api/co_edition/live_file")>()),
  loadLiveDocument: vi.fn(),
}));

const DOCUMENT_NAME = "w1:user-u1/notes.md";

describe("createCollabHocuspocus", () => {
  beforeEach(() => {
    // Every read of the file rebuilds the document, with new Yjs identities.
    vi.mocked(loadLiveDocument).mockImplementation(async () =>
      dfmToYDoc("# Notes\n\nHello.\n")
    );
  });

  it("keeps an unedited document's identities across an unload", async () => {
    const hocuspocus = createCollabHocuspocus();
    // What a browser's connection does: load, then leave without editing, which unloads the
    // document without storing it.
    const open = () =>
      hocuspocus.createDocument(
        DOCUMENT_NAME,
        new Request("http://localhost/collab"),
        "socket",
        { readOnly: false, isAuthenticated: true }
      );

    const first = await open();
    // The browser keeps its copy while it reconnects.
    const client = new Y.Doc();
    Y.applyUpdate(client, Y.encodeStateAsUpdate(first));
    await hocuspocus.unloadDocument(first);
    expect(hocuspocus.getDocumentsCount()).toBe(0);

    const second = await open();
    Y.applyUpdate(second, Y.encodeStateAsUpdate(client));

    const paragraphs = second
      .getXmlFragment("body")
      .toArray()
      .filter(
        (node) => node instanceof Y.XmlElement && node.nodeName === "paragraph"
      );
    expect(paragraphs).toHaveLength(1);
    expect(loadLiveDocument).toHaveBeenCalledTimes(1);
    await hocuspocus.unloadDocument(second);
  });
});
