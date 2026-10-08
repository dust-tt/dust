import { createHash, randomBytes } from "node:crypto";
import type { LiveAccessError } from "@app/lib/api/collab/live_file";
import { checkLiveAccess } from "@app/lib/api/collab/live_file";
import { runOnRedis } from "@app/lib/api/redis";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

export const LIVE_TICKET_TTL_SECONDS = 60;

const LiveTicketSchema = z.object({
  workspaceId: z.string(),
  userId: z.string(),
  canonicalPath: z.string(),
});

/** Who may open which file in a live session, as a ticket grants it. */
export type LiveTicket = z.infer<typeof LiveTicketSchema>;

// Keyed by a hash so Redis never holds a usable ticket.
const ticketKey = (ticket: string) =>
  `collab_ticket:${createHash("sha256").update(ticket).digest("hex")}`;

/**
 * @cc [owner:PopDaph,label:security] live-ticket-minting
 * A ticket MUST be minted only when `checkLiveAccess` lets the user open the file, and MUST grant
 * only that user, workspace and file. It MUST expire after `LIVE_TICKET_TTL_SECONDS` and be
 * unguessable.
 */
export async function mintLiveTicket(
  auth: Authenticator,
  canonicalPath: string
): Promise<Result<string, LiveAccessError>> {
  const file = await checkLiveAccess(auth, canonicalPath);
  if (file.isErr()) {
    return new Err(file.error);
  }

  const ticket = randomBytes(32).toString("base64url");
  const granted: LiveTicket = {
    workspaceId: file.value.workspaceId,
    userId: auth.getNonNullableUser().sId,
    canonicalPath,
  };
  await runOnRedis({ origin: "collab_tickets" }, (redis) =>
    redis.set(ticketKey(ticket), JSON.stringify(granted), {
      EX: LIVE_TICKET_TTL_SECONDS,
    })
  );
  return new Ok(ticket);
}

/**
 * @cc [owner:PopDaph,label:security] live-ticket-single-use
 * Redeeming MUST consume the ticket, so it grants at most one connection, and MUST return null
 * for an unknown, expired or already used ticket.
 */
export async function redeemLiveTicket(
  ticket: string
): Promise<LiveTicket | null> {
  const stored = await runOnRedis({ origin: "collab_tickets" }, (redis) =>
    redis.getDel(ticketKey(ticket))
  );
  if (stored === null) {
    return null;
  }
  const parsed = LiveTicketSchema.safeParse(JSON.parse(stored));
  return parsed.success ? parsed.data : null;
}
