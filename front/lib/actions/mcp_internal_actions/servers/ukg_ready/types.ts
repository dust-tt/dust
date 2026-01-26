import { z } from "zod";

export const UkgReadyEmployeeSchema = z
  .object({
    id: z.number(),
    employee_id: z.string(),
    username: z.string().optional(),
    first_name: z.string(),
    last_name: z.string(),
    email: z.string().optional(),
  })
  .passthrough();

export const UkgReadyPTOEmployeeSchema = z
  .object({
    account_id: z.number().optional(),
    username: z.string().optional(),
    ein_name: z.string().optional(),
    ein_tax_id: z.string().optional(),
  })
  .passthrough();

export const UkgReadyTimeOffTypeSchema = z
  .object({
    id: z.number(),
    name: z.string(),
  })
  .passthrough();

export const UkgReadyApproverSchema = z
  .object({
    account_id: z.number().optional(),
    full_name: z.string().optional(),
  })
  .passthrough();

export const UkgReadyPTODetailsSchema = z
  .object({
    request_id: z.string().optional(),
    request_state: z.string().optional(),
    request_type: z.string().optional(),
    requested_date: z.string().optional(),
    requested_time: z.string().optional(),
    time_per_day: z.string().optional(),
    duration_unit: z.enum(["HOURS", "DAYS"]).optional(),
    created: z.string().optional(),
    work_flow_status: z.string().optional(),
    can_delete: z.boolean().optional(),
    cancel_needs_approval: z.boolean().optional(),
    approved_by: UkgReadyApproverSchema.optional(),
    rejected_by: UkgReadyApproverSchema.optional(),
    note_thread_id: z.string().optional(),
    cost_center_ids: z.array(z.string()).optional(),
  })
  .passthrough();

export const UkgReadyPTORequestSchema = z
  .object({
    employee: UkgReadyPTOEmployeeSchema.optional(),
    time_off: UkgReadyTimeOffTypeSchema.optional(),
    pto_details: UkgReadyPTODetailsSchema.optional(),
    notes_count: z.number().optional(),
    dynamic_duration_type: z
      .enum(["Full Day", "Half Day", "First Half", "Second Half", "Fill Day"])
      .optional(),
  })
  .passthrough();

export const UkgReadyPTORequestsResponseSchema = z
  .object({
    ptorequests: z.array(UkgReadyPTORequestSchema),
  })
  .passthrough();

export const UkgReadyAccrualYearSchema = z
  .object({
    start_date: z.string(),
    end_date: z.string(),
  })
  .passthrough();

export const UkgReadyAccrualEmployeeSchema = z
  .object({
    account_id: z.number(),
    username: z.string(),
  })
  .passthrough();

export const UkgReadyAccrualBalanceSchema = z
  .object({
    time_off: UkgReadyTimeOffTypeSchema,
    accrual_year: UkgReadyAccrualYearSchema,
    regular_day_time: z.number(),
    accrued: z.number().optional(),
    accrued_to: z.string().optional(),
    carry_over: z.number().optional(),
    carry_over_used_by_balance: z.number().optional(),
    employee: UkgReadyAccrualEmployeeSchema.optional(),
    estimated_accrued: z.number().optional(),
    estimated_remaining: z.number().optional(),
    external_accrued: z.number().optional(),
    external_carry_over: z.number().optional(),
    external_taken: z.number().optional(),
    pending_approval: z.number().optional(),
    remaining: z.number().optional(),
    scheduled: z.number().optional(),
    taken: z.number().optional(),
  })
  .passthrough();

export const UkgReadyAccrualBalancesResponseSchema = z
  .object({
    accrual_balances: z.array(UkgReadyAccrualBalanceSchema),
  })
  .passthrough();

export const UkgReadyPTORequestNoteSchema = z.object({
  id: z.number(),
  text: z.string(),
  created_at: z.string(),
  created_by: z.object({
    account_id: z.number(),
    display_name: z.string(),
  }),
  _links: z
    .object({
      delete: z.string().optional(),
    })
    .optional(),
});

export const UkgReadyPTORequestNotesResponseSchema = z.object({
  notes: z.array(UkgReadyPTORequestNoteSchema),
});

export const UkgReadyScheduleEmployeeSchema = z
  .object({
    account_id: z.number().optional(),
    external_id: z.string().optional(),
    username: z.string().optional(),
    employee_id: z.string().optional(),
    ein_name: z.string().optional(),
    ein_tax_id: z.string().optional(),
  })
  .passthrough();

export const UkgReadyScheduleLunchSchema = z
  .object({
    min_lunch_time: z.string().optional(),
    max_lunch_time: z.string().optional(),
    paid_lunch_time: z.string().optional(),
    lunch_start_at: z.string().optional(),
    lunch_start_after: z.string().optional(),
  })
  .passthrough();

export const UkgReadyCostCenterSchema = z
  .object({
    path: z.string().optional(),
    name: z.string().optional(),
  })
  .passthrough();

export const UkgReadyJobSchema = z
  .object({
    path: z.string().optional(),
    name: z.string().optional(),
  })
  .passthrough();

export const UkgReadyScheduleSchema = z
  .object({
    date: z.string(),
    id: z.number().optional(),
    shift_num: z.number().optional(),
    type_name: z.string().optional(),
    daily_rule_name: z.string().optional(),
    start_time: z.string().optional(),
    start_time_max: z.string().optional(),
    end_time: z.string().optional(),
    end_time_max: z.string().optional(),
    total_hours: z.string().optional(),
    std_total_hours: z.string().optional(),
    employee: UkgReadyScheduleEmployeeSchema.optional(),
    lunch: UkgReadyScheduleLunchSchema.optional(),
    shift_premium: z.string().optional(),
    cost_center_1: UkgReadyCostCenterSchema.optional(),
    cost_center_2: UkgReadyCostCenterSchema.optional(),
    cost_center_3: UkgReadyCostCenterSchema.optional(),
    cost_center_4: UkgReadyCostCenterSchema.optional(),
    cost_center_5: UkgReadyCostCenterSchema.optional(),
    cost_center_6: UkgReadyCostCenterSchema.optional(),
    cost_center_7: UkgReadyCostCenterSchema.optional(),
    cost_center_8: UkgReadyCostCenterSchema.optional(),
    cost_center_9: UkgReadyCostCenterSchema.optional(),
    job: UkgReadyJobSchema.optional(),
    workday_breakdown: z.string().optional(),
    day_type: z.string().optional(),
    is_working: z.boolean().optional(),
    predicted: z.boolean().optional(),
  })
  .passthrough();

export const UkgReadySchedulesResponseSchema = z
  .object({
    schedules: z.array(UkgReadyScheduleSchema),
  })
  .passthrough();

export const UkgReadyEmployeesResponseSchema = z
  .object({
    employees: z.array(UkgReadyEmployeeSchema),
  })
  .passthrough();

export const UkgReadyPTORequestCostCenterSchema = z.object({
  index: z.number(),
  value: z.object({
    id: z.number(),
    display_name: z.string().optional(),
  }),
});

export const UkgReadyPTORequestObjectSchema = z.object({
  employee: z
    .object({
      username: z.string().optional(),
      account_id: z.string().optional(),
      external_id: z.string().optional(),
    })
    .optional(),
  time_off: z.object({
    name: z.string(),
  }),
  type: z.enum(["FullDay", "Partial", "PartialBlk", "Multiple", "Dynamic"]),
  comment: z.string().optional(),
  from_date: z.string(),
  to_date: z.string().optional(),
  from_time: z.string().optional(),
  to_time: z.string().optional(),
  total_time: z.string().optional(),
  dynamic_duration: z
    .enum([
      "FULL_DAY",
      "FIRST_HALF_OF_DAY",
      "SECOND_HALF_OF_DAY",
      "HALF_DAY",
      "FILL_DAY",
    ])
    .optional(),
  fill_to_norm: z.boolean().optional(),
  fill_to_halfnorm: z.boolean().optional(),
  cost_centers: z.array(UkgReadyPTORequestCostCenterSchema).optional(),
  bankCategory: z.number().optional(),
});

export const UkgReadyCreatePTORequestSchema = z
  .object({
    pto_request: UkgReadyPTORequestObjectSchema,
  })
  .passthrough();

export const UkgReadyExecuteResultSchema = z
  .object({
    success_code: z.number().optional(),
    messages: z
      .array(
        z.object({
          type: z.enum(["info", "confirm", "critical", "error", "warning"]),
          code: z.number().optional(),
          message: z.string().optional(),
        })
      )
      .optional(),
  })
  .passthrough();

export type UkgReadyEmployee = z.infer<typeof UkgReadyEmployeeSchema>;
export type UkgReadyPTORequest = z.infer<typeof UkgReadyPTORequestSchema>;
export type UkgReadyAccrualBalance = z.infer<
  typeof UkgReadyAccrualBalanceSchema
>;
export type UkgReadyPTORequestNote = z.infer<
  typeof UkgReadyPTORequestNoteSchema
>;
export type UkgReadySchedule = z.infer<typeof UkgReadyScheduleSchema>;
export type UkgReadyPTORequestObject = z.infer<
  typeof UkgReadyPTORequestObjectSchema
>;
export type UkgReadyCreatePTORequest = z.infer<
  typeof UkgReadyCreatePTORequestSchema
>;
export type UkgReadyExecuteResult = z.infer<typeof UkgReadyExecuteResultSchema>;
export type UkgReadyErrorResult = string;
