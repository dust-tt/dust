import type { CollabUser } from "@app/components/editor/document/collabExtensions";

// Sync, in-memory factory: the user an editor shows to the others in a live document.
export class CollabUserFactory {
  static build(overrides: Partial<CollabUser> = {}): CollabUser {
    return { id: "usr_1", name: "Editor", color: "#0ea5e9", ...overrides };
  }
}
