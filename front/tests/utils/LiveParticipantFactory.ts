import type { DocumentLiveParticipant } from "@app/components/editor/document/types";

// Sync, in-memory factory: a user present in a live document's session.
export class LiveParticipantFactory {
  static build(
    overrides: Partial<DocumentLiveParticipant> = {}
  ): DocumentLiveParticipant {
    return { id: "usr_1", name: "Participant", ...overrides };
  }
}
