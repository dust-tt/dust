import type { DocumentLiveUser } from "@app/components/editor/document/liveExtensions";

// Sync, in-memory factory: the user an editor shows to the others in a live document.
export class LiveUserFactory {
  static build(overrides: Partial<DocumentLiveUser> = {}): DocumentLiveUser {
    return { id: "usr_1", name: "Editor", color: "#0ea5e9", ...overrides };
  }
}
