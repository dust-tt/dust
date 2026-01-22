import { z } from "zod";

// Component status values
export const ComponentStatusSchema = z.enum([
  "operational",
  "degraded_performance",
  "partial_outage",
  "major_outage",
  "under_maintenance",
]);

export type ComponentStatus = z.infer<typeof ComponentStatusSchema>;

// Incident status values for real-time incidents
export const RealTimeIncidentStatusSchema = z.enum([
  "investigating",
  "identified",
  "monitoring",
  "resolved",
]);

export type RealTimeIncidentStatus = z.infer<
  typeof RealTimeIncidentStatusSchema
>;

// All possible incident status values (including scheduled maintenance and postmortem)
export const IncidentStatusSchema = z.enum([
  "investigating",
  "identified",
  "monitoring",
  "resolved",
  // Scheduled maintenance statuses
  "scheduled",
  "in_progress",
  "verifying",
  "completed",
  // Postmortem status
  "postmortem",
]);

export type IncidentStatus = z.infer<typeof IncidentStatusSchema>;

// Impact values
export const IncidentImpactSchema = z.enum([
  "none",
  "minor",
  "major",
  "critical",
  "maintenance",
]);

export type IncidentImpact = z.infer<typeof IncidentImpactSchema>;

// Page schema
export const StatuspagePageSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    page_description: z.string().nullable().optional(),
    subdomain: z.string().nullable().optional(),
    domain: z.string().nullable().optional(),
    url: z.string().nullable().optional(),
    time_zone: z.string().nullable().optional(),
  })
  .passthrough();

export type StatuspagePage = z.infer<typeof StatuspagePageSchema>;

// Component schema
export const StatuspageComponentSchema = z
  .object({
    id: z.string(),
    page_id: z.string(),
    name: z.string(),
    description: z.string().nullable().optional(),
    status: ComponentStatusSchema,
    position: z.number(),
    group_id: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    only_show_if_degraded: z.boolean().optional(),
    showcase: z.boolean().optional(),
  })
  .passthrough();

export type StatuspageComponent = z.infer<typeof StatuspageComponentSchema>;

// Incident update schema
export const StatuspageIncidentUpdateSchema = z
  .object({
    id: z.string(),
    incident_id: z.string(),
    status: IncidentStatusSchema,
    body: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    display_at: z.string().nullable().optional(),
    deliver_notifications: z.boolean().optional(),
  })
  .passthrough();

export type StatuspageIncidentUpdate = z.infer<
  typeof StatuspageIncidentUpdateSchema
>;

// Incident schema
export const StatuspageIncidentSchema = z
  .object({
    id: z.string(),
    page_id: z.string(),
    name: z.string(),
    status: IncidentStatusSchema,
    impact: IncidentImpactSchema.optional(),
    shortlink: z.string().nullable().optional(),
    created_at: z.string(),
    updated_at: z.string(),
    started_at: z.string().nullable().optional(),
    resolved_at: z.string().nullable().optional(),
    monitoring_at: z.string().nullable().optional(),
    incident_updates: z.array(StatuspageIncidentUpdateSchema).optional(),
    components: z.array(StatuspageComponentSchema).optional(),
  })
  .passthrough();

export type StatuspageIncident = z.infer<typeof StatuspageIncidentSchema>;

// API Response schemas
export const ListPagesResponseSchema = z.array(StatuspagePageSchema);

export type ListPagesResponse = z.infer<typeof ListPagesResponseSchema>;

export const ListComponentsResponseSchema = z.array(StatuspageComponentSchema);

export type ListComponentsResponse = z.infer<
  typeof ListComponentsResponseSchema
>;

export const ListIncidentsResponseSchema = z.array(StatuspageIncidentSchema);

export type ListIncidentsResponse = z.infer<typeof ListIncidentsResponseSchema>;

export const GetIncidentResponseSchema = StatuspageIncidentSchema;

export type GetIncidentResponse = z.infer<typeof GetIncidentResponseSchema>;

// Request types for creating/updating incidents
export interface CreateIncidentRequest {
  incident: {
    name: string;
    status: IncidentStatus;
    body?: string;
    component_ids?: string[];
    components?: Record<string, ComponentStatus>;
    impact_override?: IncidentImpact;
    deliver_notifications?: boolean;
  };
}

export interface UpdateIncidentRequest {
  incident: {
    status?: IncidentStatus;
    body?: string;
    component_ids?: string[];
    components?: Record<string, ComponentStatus>;
    deliver_notifications?: boolean;
  };
}
