import type { MembershipSeatType } from "@app/types/memberships";

export type GetMembersSeatsResponseBody = {
  // Active members per seat type, from the DB ("assigned" seats).
  seatTypes: Partial<Record<MembershipSeatType, number>>;
  // Total seat quantity billed in Metronome per seat type (assigned +
  // unassigned). Absent when the workspace isn't on a Metronome seat contract,
  // or omitted for a seat type if Metronome couldn't be read. The UI derives
  // the unassigned count as `metronomeSeats - seatTypes` per type.
  metronomeSeats: Partial<Record<MembershipSeatType, number>>;
  total: number;
};
