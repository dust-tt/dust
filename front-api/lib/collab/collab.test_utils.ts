import type { CollabAccess } from "@app/lib/api/collab/access";
import { saveCollabSession } from "@app/lib/api/collab/session_file";
import { dfmToYDoc, yDocToDfm } from "@app/lib/api/collab/ydoc";
import { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import type { DfmComment } from "@app/lib/markdown/dfm";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { BODY_FRAGMENT_NAME } from "@app/types/collab";
import { Ok } from "@app/types/shared/result";
import { vi } from "vitest";
import * as Y from "yjs";

/** Shared by the collab server's tests, which mock `session_file` themselves. */
export const DOCUMENT_NAME = "w1:user-u1/notes.md";
export const SOURCE = "# Notes\n\nHello.\n";
export const COMMENTS: DfmComment[] = [];

// TODO(co-edition): open a written file through `openCollabAccess` instead, and share `typeInto` with
// session_file.test.ts.
export async function collabAccess(canWrite: boolean): Promise<CollabAccess> {
  const { authenticator: auth, workspace } = await createResourceTest({});
  const dustFs = await DustFileSystem.forUser(auth);
  if (dustFs.isErr()) {
    throw dustFs.error;
  }
  return {
    auth,
    workspaceId: workspace.sId,
    canonicalPath: `user-${auth.getNonNullableUser().sId}/notes.md`,
    dustFs: dustFs.value,
    canWrite,
  };
}

export function typeInto(doc: Y.Doc, text: string) {
  const paragraph = new Y.XmlElement("paragraph");
  paragraph.insert(0, [new Y.XmlText(text)]);
  const body = doc.getXmlFragment(BODY_FRAGMENT_NAME);
  body.insert(body.length, [paragraph]);
}

/** What `loadCollabSession` returns for `SOURCE`, with fresh Yjs identities each time. */
export async function loadSource() {
  const live = dfmToYDoc(SOURCE);
  if (live.isErr()) {
    throw new Error(live.error);
  }
  const content = yDocToDfm(live.value);
  if (content.isErr()) {
    throw new Error(content.error);
  }
  return new Ok({
    content: { doc: live.value.doc, comments: COMMENTS },
    lastSave: { revision: "1", source: content.value },
  });
}

export function checkpointNextRevision() {
  vi.mocked(saveCollabSession).mockImplementation(
    async (_file, _live, last) =>
      new Ok({
        revision: String(Number(last.revision) + 1),
        source: "written",
      })
  );
}
