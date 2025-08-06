export interface FreshserviceTicket {
  id: number;
  subject: string;
  description_text?: string;
  priority: number;
  status: number;
  source: number;
  requester_id: number;
  responder_id?: number;
  department_id?: number;
  group_id?: number;
  type?: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
  due_by?: string;
  fr_due_by?: string;
  is_escalated: boolean;
  custom_fields?: Record<string, any>;
}

export interface FreshserviceRequester {
  id: number;
  first_name: string;
  last_name: string;
  primary_email: string;
  mobile_phone_number?: string;
  work_phone_number?: string;
  department_ids?: number[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FreshserviceDepartment {
  id: number;
  name: string;
  description?: string;
  head_user_id?: number;
  prime_user_id?: number;
  created_at: string;
  updated_at: string;
}

export interface FreshserviceProduct {
  id: number;
  name: string;
  description?: string;
  asset_type_id: number;
  manufacturer?: string;
  status: string;
  mode_of_procurement?: string;
  created_at: string;
  updated_at: string;
}

export interface FreshserviceServiceItem {
  id: number;
  name: string;
  display_id: number;
  category_id: number;
  short_description?: string;
  description?: string;
  cost?: number;
  cost_visibility: boolean;
  delivery_time?: number;
  delivery_time_visibility: boolean;
  visibility: number;
  created_at: string;
  updated_at: string;
}

export interface FreshserviceSolutionArticle {
  id: number;
  title: string;
  description: string;
  article_type: number;
  folder_id: number;
  category_id?: number;
  status: number;
  approval_status: number;
  views: number;
  thumbs_up: number;
  thumbs_down: number;
  tags?: string[];
  keywords?: string[];
  created_at: string;
  updated_at: string;
}

export interface FreshserviceOnCallSchedule {
  id: number;
  name: string;
  description?: string;
  time_zone: string;
  created_at: string;
  updated_at: string;
}

// API Response interfaces
export interface FreshserviceListResponse<T> {
  [key: string]: T[];
}

// Error codes
export const FRESHSERVICE_ERROR_MESSAGES = {
  AUTHENTICATION_REQUIRED:
    "Authentication required. Please connect your Freshservice account.",
  DOMAIN_NOT_CONFIGURED: "Freshservice domain not configured.",
  TICKET_NOT_FOUND: "Ticket not found.",
  REQUESTER_NOT_FOUND: "Requester not found.",
  INVALID_PRIORITY:
    "Invalid priority. Must be 1 (Low), 2 (Medium), 3 (High), or 4 (Urgent).",
  INVALID_STATUS:
    "Invalid status. Must be 2 (Open), 3 (Pending), 4 (Resolved), or 5 (Closed).",
  API_ERROR: "API request failed",
};
