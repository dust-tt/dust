import type { CollabParticipant } from "@app/components/editor/document/types";

// Sync, in-memory factory: a user present in a live document's session.
export class CollabParticipantFactory {
  static build(overrides: Partial<CollabParticipant> = {}): CollabParticipant {
    return { id: "usr_1", name: "Participant", ...overrides };
  }
}
