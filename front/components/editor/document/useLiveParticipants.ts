import type { DocumentLiveParticipant } from "@app/components/editor/document/types";
import isEqual from "lodash/isEqual";
import { useEffect, useState } from "react";
import type { Awareness } from "y-protocols/awareness";
import { z } from "zod";

// Set by the other editors' collaboration carets, so anything a client sends: checked here.
const awarenessUserSchema = z.object({
  user: z.object({ id: z.string().min(1), name: z.string() }),
});

const NO_PARTICIPANTS: DocumentLiveParticipant[] = [];

const readParticipants = (awareness: Awareness): DocumentLiveParticipant[] => {
  const remoteStates = [...awareness.getStates()]
    .filter(([clientId]) => clientId !== awareness.clientID)
    .map(([, state]) => state);
  const byUserId = new Map<string, DocumentLiveParticipant>();
  for (const state of [awareness.getLocalState(), ...remoteStates]) {
    const parsed = awarenessUserSchema.safeParse(state);
    if (parsed.success && !byUserId.has(parsed.data.user.id)) {
      const { id, name } = parsed.data.user;
      byUserId.set(id, { id, name });
    }
  }
  return [...byUserId.values()];
};

/**
 * @cc [owner:tdraier,label:product] live-participants
 * The participants MUST be the users whose editor is on `awareness`, once each, the local editor's
 * user first and then the others in the order they joined, kept current as they join and leave. A
 * state without a user id MUST be ignored. Without awareness, or with a new one until it reports,
 * there MUST be none.
 */
export function useLiveParticipants(
  awareness: Awareness | null
): DocumentLiveParticipant[] {
  // Kept with its awareness: until the effect's cleanup runs, a new one would see the old one's.
  const [shown, setShown] = useState<{
    awareness: Awareness;
    participants: DocumentLiveParticipant[];
  } | null>(null);

  useEffect(() => {
    if (!awareness) {
      return;
    }
    const update = () => {
      const participants = readParticipants(awareness);
      setShown((current) =>
        current?.awareness === awareness &&
        isEqual(current.participants, participants)
          ? current
          : { awareness, participants }
      );
    };
    update();
    awareness.on("change", update);
    return () => {
      awareness.off("change", update);
      setShown(null);
    };
  }, [awareness]);

  return shown?.awareness === awareness ? shown.participants : NO_PARTICIPANTS;
}
