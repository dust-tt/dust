import { useLiveSession } from "@app/hooks/useLiveSession";
import { Server } from "@hocuspocus/server";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const DOCUMENT_NAME = "w_1:notes.md";

describe("useLiveSession", () => {
  let server: Server;

  beforeEach(async () => {
    server = new Server({ quiet: true });
    await server.listen(0);
  });

  afterEach(async () => {
    await server.destroy();
  });

  function renderSession() {
    return renderHook(() =>
      useLiveSession({
        url: `ws://127.0.0.1:${server.address.port}`,
        documentName: DOCUMENT_NAME,
        token: "u_1",
        user: { name: "Daph", color: "#0ea5e9" },
      })
    );
  }

  it("takes a fresh connection when the server closes the document", async () => {
    const { result, unmount } = renderSession();
    await waitFor(() => expect(result.current.status).toBe("live"));
    const first = result.current.connection;

    server.hocuspocus.closeConnections(DOCUMENT_NAME);

    await waitFor(() => expect(result.current.status).toBe("offline"));
    await waitFor(
      () => {
        expect(result.current.status).toBe("live");
        expect(result.current.connection?.id).not.toBe(first?.id);
      },
      { timeout: 3_000 }
    );
    unmount();
  });
});
