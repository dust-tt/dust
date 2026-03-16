import { z } from "zod";

// --- Luma entity schemas ---

export const LumaVisibilitySchema = z.enum([
  "public",
  "members-only",
  "private",
]);

export type LumaVisibility = z.infer<typeof LumaVisibilitySchema>;

export const LumaApprovalStatusSchema = z.enum([
  "approved",
  "pending_approval",
  "waitlist",
  "declined",
  "invited",
]);

export type LumaApprovalStatus = z.infer<typeof LumaApprovalStatusSchema>;

export const LumaEventSchema = z
  .object({
    api_id: z.string(),
    name: z.string(),
    start_at: z.string(),
    end_at: z.string().nullable().optional(),
    timezone: z.string().optional(),
    visibility: z.string().nullable().optional(),
    max_capacity: z.number().nullable().optional(),
    slug: z.string().nullable().optional(),
    meeting_url: z.string().nullable().optional(),
    cover_url: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    geo_address_info: z
      .object({
        full_address: z.string().nullable(),
      })
      .nullable()
      .optional(),
  })
  .passthrough();

export type LumaEvent = z.infer<typeof LumaEventSchema>;

export const LumaGuestSchema = z
  .object({
    api_id: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    approval_status: LumaApprovalStatusSchema,
    registered_at: z.string().nullable(),
    checked_in_at: z.string().nullable(),
  })
  .passthrough();

export type LumaGuest = z.infer<typeof LumaGuestSchema>;

export const LumaTicketTypeSchema = z
  .object({
    api_id: z.string(),
    name: z.string(),
    price: z.number().nullable(),
    currency: z.string().nullable(),
    is_free: z.boolean(),
    quantity_total: z.number().nullable(),
    quantity_sold: z.number().nullable(),
  })
  .passthrough();

export type LumaTicketType = z.infer<typeof LumaTicketTypeSchema>;

export const LumaUserSchema = z
  .object({
    api_id: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
  })
  .passthrough();

export type LumaUser = z.infer<typeof LumaUserSchema>;

// --- API response wrapper schemas ---
// Luma wraps list responses in { entries: [...], has_more, next_cursor }
// and single-item responses vary per endpoint.

// List events returns entries with nested event + tags objects.
export const LumaEventEntrySchema = z
  .object({
    api_id: z.string(),
    event: LumaEventSchema,
  })
  .passthrough();

export type LumaEventEntry = z.infer<typeof LumaEventEntrySchema>;

export const LumaEventListResponseSchema = z
  .object({
    entries: z.array(LumaEventEntrySchema),
    has_more: z.boolean(),
    next_cursor: z.string().nullable().optional(),
  })
  .passthrough();

// List guests returns entries with nested guest data.
export const LumaGuestEntrySchema = z
  .object({
    api_id: z.string(),
    guest: LumaGuestSchema,
  })
  .passthrough();

export type LumaGuestEntry = z.infer<typeof LumaGuestEntrySchema>;

export const LumaGuestListResponseSchema = z
  .object({
    entries: z.array(LumaGuestEntrySchema),
    has_more: z.boolean(),
    next_cursor: z.string().nullable().optional(),
  })
  .passthrough();

// List ticket types returns entries array.
export const LumaTicketTypeListResponseSchema = z
  .object({
    entries: z.array(LumaTicketTypeSchema),
    has_more: z.boolean().optional(),
    next_cursor: z.string().nullable().optional(),
  })
  .passthrough();

// Single-item responses: Luma returns the object directly (no wrapper).
// We use the entity schemas directly in the client.

// --- Request param interfaces ---

export interface ListEventsParams {
  after?: string;
  before?: string;
}

export interface ListGuestsParams {
  approval_status?: LumaApprovalStatus;
  sort_column?: string;
  sort_direction?: string;
  pagination_cursor?: string;
  pagination_limit?: number;
}

export interface CreateEventParams {
  name: string;
  start_at: string;
  end_at?: string;
  timezone?: string;
  max_capacity?: number;
  visibility?: LumaVisibility;
  description?: string;
  cover_url?: string;
  location_place_id?: string;
  slug?: string;
}

export interface UpdateEventParams {
  name?: string;
  start_at?: string;
  end_at?: string;
  timezone?: string;
  max_capacity?: number;
  visibility?: LumaVisibility;
  description?: string;
  cover_url?: string;
  location_place_id?: string;
  slug?: string;
  suppress_notifications?: boolean;
}

export type LumaGuestStatusAction = "approved" | "declined";

export const LumaGuestStatusActionSchema = z.enum(["approved", "declined"]);

export interface UpdateGuestStatusParams {
  guest_api_id_or_email: string;
  status: LumaGuestStatusAction;
  should_refund?: boolean;
}

export interface GuestInput {
  email: string;
  name?: string;
}

export interface SendInvitesParams {
  emails: string[];
}
