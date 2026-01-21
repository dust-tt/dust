import { z } from "zod";

// Employee Schema - UKG Ready API uses snake_case
export const UkgReadyEmployeeSchema = z
  .object({
    id: z.number(),
    employee_id: z.string(),
    username: z.string().optional(),
    first_name: z.string(),
    last_name: z.string(),
    email: z.string().optional(),
    department: z.string().optional(),
    job_title: z.string().optional(),
    status: z.string().optional(),
    hire_date: z.string().optional(),
  })
  .passthrough();

// Employee reference in PTO response
export const UkgReadyPTOEmployeeSchema = z
  .object({
    account_id: z.number(),
    full_name: z.string(),
    ein_name: z.string().optional(),
  })
  .passthrough();

// Time off type reference
export const UkgReadyTimeOffTypeSchema = z
  .object({
    id: z.number(),
    name: z.string(),
  })
  .passthrough();

// Approver/Rejector reference
export const UkgReadyApproverSchema = z
  .object({
    account_id: z.number(),
    full_name: z.string(),
  })
  .passthrough();

// PTO details nested object
export const UkgReadyPTODetailsSchema = z
  .object({
    request_id: z.string(),
    request_state: z.string(),
    request_type: z.string().optional(),
    requested_time: z.string(),
    duration_unit: z.string(),
    created: z.string(),
    can_delete: z.boolean(),
    cancel_needs_approval: z.boolean(),
    approved_by: UkgReadyApproverSchema.optional(),
    rejected_by: UkgReadyApproverSchema.optional(),
    note_thread_id: z.string().optional(),
    cost_center_ids: z.array(z.string()).optional(),
  })
  .passthrough();

// Full PTO request object
export const UkgReadyPTORequestSchema = z
  .object({
    dynamicDurationAs: z.string().optional(),
    employee: UkgReadyPTOEmployeeSchema,
    time_off: UkgReadyTimeOffTypeSchema,
    from_date: z.string(),
    to_date: z.string(),
    from_time: z.string(),
    to_time: z.string(),
    pto_details: UkgReadyPTODetailsSchema,
    notes_count: z.number().optional(),
  })
  .passthrough();

// Response wrapper for PTO requests
export const UkgReadyPTORequestsResponseSchema = z
  .object({
    ptorequests: z.array(UkgReadyPTORequestSchema),
  })
  .passthrough();

// Export types
export type UkgReadyEmployee = z.infer<typeof UkgReadyEmployeeSchema>;
export type UkgReadyPTORequest = z.infer<typeof UkgReadyPTORequestSchema>;
export type UkgReadyErrorResult = string;
