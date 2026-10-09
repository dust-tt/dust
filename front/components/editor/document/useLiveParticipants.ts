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

const readParticipants = (
  awareness: Awareness,
  selfUserId: string
): DocumentLiveParticipant[] => {
  const byUserId = new Map<string, DocumentLiveParticipant>();
  for (const [clientId, state] of awareness.getStates()) {
    const parsed = awarenessUserSchema.safeParse(state);
    if (clientId === awareness.clientID || !parsed.success) {
      continue;
    }
    const { id, name } = parsed.data.user;
    if (id !== selfUserId && !byUserId.has(id)) {
      byUserId.set(id, { id, name });
    }
  }
  return [...byUserId.values()];
};

/**
 * @cc [owner:tdraier,label:product] live-participants
 * The participants MUST be the users whose editor is on `awareness`, once each, in the order they
 * joined, excluding `selfUserId` in any of their tabs, and kept current as they join and leave. A
 * state without a user id MUST be ignored. Without awareness, or with a new one until it reports,
 * there MUST be none.
 */
export function useLiveParticipants(
  awareness: Awareness | null,
  selfUserId: string
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
      const participants = readParticipants(awareness, selfUserId);
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
  }, [awareness, selfUserId]);

  return shown?.awareness === awareness ? shown.participants : NO_PARTICIPANTS;
}
