export interface SalesloftUser {
  id: number;
  guid: string;
  email: string;
  first_name: string;
  last_name: string;
}

export interface SalesloftCadence {
  id: number;
  name: string;
  team_cadence: boolean;
}

export interface SalesloftPerson {
  id: number;
  first_name: string | null;
  last_name: string | null;
  email_address: string | null;
  phone: string | null;
  linkedin_url: string | null;
  title: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  person_company_name: string | null;
  person_company_website: string | null;
  do_not_contact: boolean | null;
  twitter_handle: string | null;
  job_seniority: string | null;
  job_function: string | null;
  untouched: boolean | null;
  hot_lead: boolean | null;
}

export interface SalesloftStep {
  id: number;
  cadence_id: number;
  name: string;
  step_number: number;
  type: string;
}

export interface SalesloftAction {
  id: number;
  type: string;
  due: boolean;
  status: string;
  due_on: string | null;
  action_details: {
    id: number;
    _href: string;
  } | null;
  user: {
    id: number;
    _href: string;
  } | null;
  person: {
    id: number;
    _href: string;
  } | null;
  cadence: {
    id: number;
    _href: string;
  } | null;
  step: {
    id: number;
    _href: string;
  } | null;
  task: {
    id: number;
    _href: string;
  } | null;
}

export interface SalesloftActionDetails {
  [key: string]: unknown;
}

export interface SalesloftActionWithDetails {
  action: SalesloftAction;
  person: SalesloftPerson | null;
  cadence: SalesloftCadence | null;
  step: SalesloftStep | null;
  action_details: SalesloftActionDetails | null;
}

export interface SalesloftApiResponse<T> {
  data: T[];
  metadata: {
    paging?: {
      per_page: number;
      current_page: number;
      next_page: number | null;
      prev_page: number | null;
    };
  };
}

export interface SalesloftSingleItemResponse<T> {
  data: T;
}
