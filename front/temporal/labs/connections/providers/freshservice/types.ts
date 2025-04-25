import * as t from "io-ts";

const nullable = <T extends t.Mixed>(codec: T) => t.union([codec, t.null]);

const createCodecWithRequireFields = <P extends t.Props, R extends t.Props>(
  required: R,
  partial: P
) => t.intersection([t.type(required), t.partial(partial)]);

export const RequesterCodec = createCodecWithRequireFields(
  { id: t.number },
  {
    email: nullable(t.string),
    mobile: nullable(t.string),
    name: nullable(t.string),
    phone: nullable(t.string),
  }
);

export const StatsCodec = createCodecWithRequireFields(
  { ticket_id: t.number },
  {
    created_at: nullable(t.string),
    updated_at: nullable(t.string),
    opened_at: nullable(t.string),
    group_escalated: nullable(t.boolean),
    inbound_count: nullable(t.number),
    status_updated_at: nullable(t.string),
    outbound_count: nullable(t.number),
    pending_since: nullable(t.string),
    resolved_at: nullable(t.string),
    closed_at: nullable(t.string),
    first_assigned_at: nullable(t.string),
    assigned_at: nullable(t.string),
    agent_responded_at: nullable(t.string),
    first_responded_at: nullable(t.string),
    first_resp_time_in_secs: nullable(t.number),
    resolution_time_in_secs: nullable(t.number),
  }
);

export const TicketAssetCodec = t.partial({ display_id: t.number });

export const TicketProblemCodec = t.partial({ display_id: t.number });

export const TicketChangeCodec = t.partial({ display_id: t.number });

export const RelatedTicketsCodec = t.partial({
  child_ids: t.array(t.number),
});

export const TicketCodec = createCodecWithRequireFields(
  { id: t.number },
  {
    planned_start_date: nullable(t.string),
    planned_end_date: nullable(t.string),
    planned_effort: nullable(t.number),
    subject: nullable(t.string),
    group_id: nullable(t.number),
    department_id: nullable(t.number),
    category: nullable(t.string),
    sub_category: nullable(t.string),
    item_category: nullable(t.string),
    requester_id: t.number,
    responder_id: nullable(t.number),
    due_by: nullable(t.string),
    fr_escalated: nullable(t.boolean),
    deleted: nullable(t.boolean),
    spam: nullable(t.boolean),
    email_config_id: nullable(t.number),
    fwd_emails: nullable(t.array(nullable(t.string))),
    reply_cc_emails: nullable(t.array(nullable(t.string))),
    cc_emails: nullable(t.array(nullable(t.string))),
    is_escalated: nullable(t.boolean),
    fr_due_by: nullable(t.string),
    priority: nullable(t.number),
    status: nullable(t.number),
    source: nullable(t.number),
    created_at: nullable(t.string),
    updated_at: nullable(t.string),
    workspace_id: nullable(t.number),
    requested_for_id: nullable(t.number),
    to_emails: nullable(t.array(nullable(t.string))),
    type: nullable(t.string),
    description: nullable(t.string),
    description_text: nullable(t.string),
    custom_fields: nullable(t.record(t.string, t.unknown)),
    requester: RequesterCodec,
    stats: StatsCodec,
    tasks_dependency_type: nullable(t.number),
    sla_policy_id: nullable(t.number),
    impact: nullable(t.number),
    urgency: nullable(t.number),
    bcc_emails: nullable(t.array(nullable(t.string))),
    related_tickets: nullable(RelatedTicketsCodec),
    applied_business_hours: nullable(t.number),
    created_within_business_hours: nullable(t.boolean),
    resolution_notes: nullable(t.string),
    resolution_notes_html: nullable(t.string),
    attachments: nullable(t.array(t.unknown)),
    problem: nullable(TicketProblemCodec),
    assets: nullable(t.array(TicketAssetCodec)),
    changes_initiated_by_ticket: nullable(t.array(TicketChangeCodec)),
    changes_initiating_ticket: nullable(t.array(TicketChangeCodec)),
  }
);

export const TicketResponseCodec = createCodecWithRequireFields(
  { tickets: t.array(TicketCodec) },
  {
    page: nullable(t.number),
  }
);
export type Ticket = t.TypeOf<typeof TicketCodec>;

export const TaskCodec = createCodecWithRequireFields(
  { id: t.number },
  {
    agent_id: nullable(t.number),
    status: nullable(t.number),
    due_date: nullable(t.string),
    notify_before: nullable(t.number),
    title: nullable(t.string),
    description: nullable(t.string),
    created_at: nullable(t.string),
    updated_at: nullable(t.string),
    closed_at: nullable(t.string),
    group_id: nullable(t.number),
    workspace_id: nullable(t.number),
  }
);
export const TaskResponseCodec = createCodecWithRequireFields(
  { tasks: t.array(TaskCodec) },
  {
    page: nullable(t.number),
  }
);
export type Task = t.TypeOf<typeof TaskCodec>;

export const ConversationCodec = createCodecWithRequireFields(
  {
    id: t.number,
    user_id: t.number,
    ticket_id: t.number,
  },
  {
    body: nullable(t.string),
    body_text: nullable(t.string),
    incoming: nullable(t.boolean),
    private: nullable(t.boolean),
    created_at: nullable(t.string),
    updated_at: nullable(t.string),
    support_email: nullable(t.string),
    source: nullable(t.number),
    to_emails: nullable(t.array(nullable(t.string))),
    from_email: nullable(t.string),
    cc_emails: nullable(t.array(nullable(t.string))),
    bcc_emails: nullable(t.array(nullable(t.string))),
    attachments: nullable(t.array(t.unknown)),
  }
);
export const ConversationResponseCodec = createCodecWithRequireFields(
  { conversations: t.array(ConversationCodec) },
  {
    page: nullable(t.number),
  }
);
export type Conversation = t.TypeOf<typeof ConversationCodec>;

export const ProblemAnalysisItemCodec = t.partial({
  description: nullable(t.string),
  description_text: nullable(t.string),
});

export const ProblemAnalysisFieldsCodec = t.partial({
  problem_cause: nullable(ProblemAnalysisItemCodec),
  problem_symptom: nullable(ProblemAnalysisItemCodec),
  problem_impact: nullable(ProblemAnalysisItemCodec),
});

export const ProblemCodec = createCodecWithRequireFields(
  {
    id: t.number,
    requester_id: t.number,
  },
  {
    agent_id: nullable(t.number),
    description: nullable(t.string),
    description_text: nullable(t.string),
    due_by: nullable(t.string),
    subject: nullable(t.string),
    group_id: nullable(t.number),
    priority: nullable(t.number),
    impact: nullable(t.number),
    status: nullable(t.number),
    known_error: nullable(t.boolean),
    department_id: nullable(t.number),
    category: nullable(t.string),
    sub_category: nullable(t.string),
    item_category: nullable(t.string),
    created_at: nullable(t.string),
    updated_at: nullable(t.string),
    workspace_id: nullable(t.number),
    assets: nullable(t.array(t.unknown)),
    associated_change: nullable(t.number),
    custom_fields: nullable(t.record(t.string, t.unknown)),
    analysis_fields: nullable(
      t.union([ProblemAnalysisFieldsCodec, t.record(t.string, t.unknown)])
    ),
  }
);

export const ImpactedServiceCodec = createCodecWithRequireFields(
  { display_id: t.number },
  {
    name: nullable(t.string),
    impact: nullable(t.union([t.number, t.string])),
    description: nullable(t.string),
    agent_id: nullable(t.number),
    asset_tag: nullable(t.string),
    group_id: nullable(t.number),
    department_id: nullable(t.number),
  }
);

export const MaintenanceWindowCodec = t.partial({
  id: t.number,
  name: nullable(t.string),
  description: nullable(t.string),
  window_start_date: nullable(t.string),
  window_end_date: nullable(t.string),
});

export const ChangeCodec = createCodecWithRequireFields(
  {
    id: t.number,
    requester_id: t.number,
  },
  {
    workspace_id: nullable(t.number),
    agent_id: nullable(t.number),
    description: nullable(t.string),
    description_text: nullable(t.string),
    group_id: nullable(t.number),
    priority: nullable(t.number),
    impact: nullable(t.number),
    status: nullable(t.number),
    risk: nullable(t.number),
    change_type: nullable(t.number),
    approval_status: nullable(t.number),
    planned_start_date: nullable(t.string),
    planned_end_date: nullable(t.string),
    subject: nullable(t.string),
    department_id: nullable(t.number),
    category: nullable(t.string),
    sub_category: nullable(t.string),
    item_category: nullable(t.string),
    created_at: nullable(t.string),
    updated_at: nullable(t.string),
    custom_fields: nullable(t.record(t.string, t.unknown)),
    planning_fields: nullable(t.record(t.string, t.unknown)),
    assets: nullable(t.array(t.unknown)),
    impacted_services: nullable(t.array(ImpactedServiceCodec)),
    maintenance_window: MaintenanceWindowCodec,
    blackout_window: nullable(t.record(t.string, t.unknown)),
  }
);

export const AssetCodec = createCodecWithRequireFields(
  {
    id: t.number,
    display_id: t.number,
  },
  {
    name: nullable(t.string),
    description: nullable(t.string),
    asset_type_id: t.number,
    impact: nullable(t.string),
    author_type: nullable(t.string),
    usage_type: nullable(t.string),
    asset_tag: nullable(t.string),
    user_id: nullable(t.number),
    department_id: nullable(t.number),
    location_id: nullable(t.number),
    agent_id: nullable(t.number),
    group_id: nullable(t.number),
    assigned_on: nullable(t.string),
    created_at: nullable(t.string),
    updated_at: nullable(t.string),
    workspace_id: nullable(t.number),
    created_by_source: nullable(t.string),
    last_updated_by_source: nullable(t.string),
    created_by_user: nullable(t.number),
    last_updated_by_user: nullable(t.number),
    sources: nullable(t.array(nullable(t.string))),
  }
);

export const ProblemResponseCodec = t.type({
  problems: t.array(ProblemCodec),
});

export const ChangeResponseCodec = t.type({
  changes: t.array(ChangeCodec),
});

export const AssetResponseCodec = t.type({
  assets: t.array(AssetCodec),
});

export type Problem = t.TypeOf<typeof ProblemCodec>;
export type Change = t.TypeOf<typeof ChangeCodec>;
export type Asset = t.TypeOf<typeof AssetCodec>;

export const SlaTargetCodec = t.partial({
  priority: nullable(t.number),
  escalation_enabled: nullable(t.boolean),
  respond_within: nullable(t.number),
  resolve_within: nullable(t.number),
  business_hours: nullable(t.boolean),
});

export const SlaPolicyCodec = createCodecWithRequireFields(
  { id: t.number },
  {
    workspace_id: nullable(t.number),
    name: nullable(t.string),
    position: nullable(t.number),
    is_default: nullable(t.boolean),
    active: nullable(t.boolean),
    deleted: nullable(t.boolean),
    description: nullable(t.string),
    sla_targets: nullable(t.array(SlaTargetCodec)),
    applicable_to: nullable(t.unknown),
    escalation: nullable(t.unknown),
    created_at: nullable(t.string),
    updated_at: nullable(t.string),
  }
);

export const SlaPolicyResponseCodec = createCodecWithRequireFields(
  { sla_policies: t.array(SlaPolicyCodec) },
  {
    page: nullable(t.number),
  }
);

export type SlaPolicy = t.TypeOf<typeof SlaPolicyCodec>;
