import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

const SALESLOFT_API_BASE_URL = "https://api.salesloft.com/v2";

interface SalesloftUser {
  id: number;
  guid: string;
  email: string;
  first_name: string;
  last_name: string;
}

interface SalesloftCadence {
  id: number;
  name: string;
  team_cadence: boolean;
}

interface SalesloftPerson {
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

interface SalesloftStep {
  id: number;
  cadence_id: number;
  name: string;
  step_number: number;
  type: string;
}

interface SalesloftAction {
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

interface SalesloftActionDetails {
  [key: string]: unknown;
}

export interface SalesloftActionWithDetails {
  action: SalesloftAction;
  person: SalesloftPerson | null;
  cadence: SalesloftCadence | null;
  step: SalesloftStep | null;
  action_details: SalesloftActionDetails | null;
}

interface SalesloftApiResponse<T> {
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

interface SalesloftSingleItemResponse<T> {
  data: T;
}

async function handleSalesloftError(
  response: Response,
  errorText: string
): Promise<never> {
  let errorMessage = `Salesloft API error: ${response.status} ${response.statusText}`;

  if (errorText) {
    try {
      const errorData = JSON.parse(errorText);

      if (response.status === 422 && errorData.errors) {
        const fieldErrors = Object.entries(errorData.errors)
          .map(
            ([field, errors]) =>
              `${field}: ${Array.isArray(errors) ? errors.join(", ") : errors}`
          )
          .join("; ");
        errorMessage += ` - ${fieldErrors}`;
      } else if (errorData.error) {
        errorMessage += ` - ${errorData.error}`;
      } else if (errorData.message) {
        errorMessage += ` - ${errorData.message}`;
      } else {
        errorMessage += ` - ${errorText.substring(0, 200)}`;
      }
    } catch {
      errorMessage += ` - ${errorText.substring(0, 200)}`;
    }
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Authentication failed: ${errorMessage}. Please verify your bearer token is valid.`
    );
  }

  throw new Error(errorMessage);
}

async function makeSalesloftRequest<T>(
  accessToken: string,
  endpoint: string,
  params?: Record<string, string | number | boolean>
): Promise<SalesloftApiResponse<T>> {
  const url = new URL(`${SALESLOFT_API_BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, String(value));
    });
  }

  // eslint-disable-next-line no-restricted-globals
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    await handleSalesloftError(response, errorText);
  }

  const jsonResponse = await response.json();

  if (!jsonResponse || typeof jsonResponse !== "object") {
    throw new Error("Invalid response format from Salesloft API");
  }

  return jsonResponse;
}

async function makeSalesloftSingleItemRequest<T>(
  accessToken: string,
  endpoint: string
): Promise<SalesloftSingleItemResponse<T>> {
  const url = new URL(`${SALESLOFT_API_BASE_URL}${endpoint}`);

  // eslint-disable-next-line no-restricted-globals
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    await handleSalesloftError(response, errorText);
  }

  const jsonResponse = await response.json();

  if (!jsonResponse || typeof jsonResponse !== "object") {
    throw new Error("Invalid response format from Salesloft API");
  }

  return jsonResponse;
}

async function getAllPages<T>(
  accessToken: string,
  endpoint: string,
  params?: Record<string, string | number | boolean>
): Promise<T[]> {
  const allResults: T[] = [];
  let currentPage = 1;
  const perPage = 100;
  let hasMorePages = true;
  const maxPages = 5;
  let pagesFetched = 0;

  while (hasMorePages && pagesFetched < maxPages) {
    const response = await makeSalesloftRequest<T>(accessToken, endpoint, {
      ...params,
      page: currentPage,
      per_page: perPage,
    });

    if (!response.data || !Array.isArray(response.data)) {
      logger.warn(
        {
          endpoint,
          currentPage,
          response: response,
        },
        "Response missing data array, stopping pagination"
      );
      break;
    }

    allResults.push(...response.data);

    if (
      !response.metadata?.paging ||
      !response.metadata.paging.next_page ||
      response.data.length < perPage
    ) {
      hasMorePages = false;
    } else {
      currentPage++;
      pagesFetched++;
    }
  }

  if (pagesFetched >= maxPages) {
    logger.warn(
      {
        endpoint,
        totalResults: allResults.length,
      },
      "Reached maximum page limit, stopping pagination"
    );
  }

  return allResults;
}

async function getCadencesByIds(
  accessToken: string,
  cadenceIds: number[]
): Promise<Map<number, SalesloftCadence>> {
  if (cadenceIds.length === 0) {
    return new Map();
  }

  const cadences = await getAllPages<SalesloftCadence>(
    accessToken,
    "/cadences",
    {}
  );

  const cadenceMap = new Map<number, SalesloftCadence>();
  for (const cadence of cadences) {
    if (cadenceIds.includes(cadence.id)) {
      cadenceMap.set(cadence.id, {
        id: cadence.id,
        name: cadence.name,
        team_cadence: cadence.team_cadence,
      });
    }
  }
  return cadenceMap;
}

async function getPeopleByIds(
  accessToken: string,
  personIds: number[]
): Promise<Map<number, SalesloftPerson>> {
  if (personIds.length === 0) {
    return new Map();
  }

  const people = await concurrentExecutor(
    personIds,
    async (personId) => {
      try {
        const response = await makeSalesloftSingleItemRequest<SalesloftPerson>(
          accessToken,
          `/people/${personId}`
        );
        return response.data ?? null;
      } catch (error) {
        logger.warn(
          { personId, error: normalizeError(error) },
          "Failed to fetch person by ID"
        );
        return null;
      }
    },
    { concurrency: 10 }
  );

  const peopleMap = new Map<number, SalesloftPerson>();
  for (const person of people) {
    if (!person) {
      continue;
    }
    peopleMap.set(person.id, {
      id: person.id,
      first_name: person.first_name,
      last_name: person.last_name,
      email_address: person.email_address,
      phone: person.phone,
      linkedin_url: person.linkedin_url,
      title: person.title,
      city: person.city,
      state: person.state,
      country: person.country,
      person_company_name: person.person_company_name,
      person_company_website: person.person_company_website,
      do_not_contact: person.do_not_contact,
      twitter_handle: person.twitter_handle,
      job_seniority: person.job_seniority,
      job_function: person.job_function,
      untouched: person.untouched,
      hot_lead: person.hot_lead,
    });
  }
  return peopleMap;
}

export async function getUserByEmail(
  accessToken: string,
  email: string
): Promise<SalesloftUser | null> {
  const users = await getAllPages<SalesloftUser>(accessToken, "/users", {
    emails: email,
  });

  if (users.length === 0) {
    return null;
  }

  const user = users[0];
  return {
    id: user.id,
    guid: user.guid,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
  };
}

async function getActionDetails(
  accessToken: string,
  actionType: string,
  actionDetailsId: number
): Promise<SalesloftActionDetails | null> {
  try {
    let endpoint: string | null = null;

    if (actionType === "phone") {
      endpoint = `/action_details/call_instructions/${actionDetailsId}`;
    }

    if (!endpoint) {
      return null;
    }

    const response = await makeSalesloftRequest<SalesloftActionDetails>(
      accessToken,
      endpoint
    );

    if (!response.data || response.data.length === 0) {
      return null;
    }

    return response.data[0] as SalesloftActionDetails;
  } catch (error) {
    logger.warn(
      {
        error: normalizeError(error),
        actionType,
        actionDetailsId,
      },
      "Failed to get action details (this may be expected for some action types)"
    );
    return null;
  }
}

export async function getStepsByIds(
  accessToken: string,
  stepIds: number[]
): Promise<Map<number, SalesloftStep>> {
  if (stepIds.length === 0) {
    return new Map();
  }

  const steps = await getAllPages<SalesloftStep>(accessToken, "/steps", {});

  const stepMap = new Map<number, SalesloftStep>();
  for (const step of steps) {
    stepMap.set(step.id, {
      id: step.id,
      cadence_id: step.cadence_id,
      name: step.name,
      step_number: step.step_number,
      type: step.type,
    });
  }
  return stepMap;
}

export async function getActions(
  accessToken: string,
  userGuid: string,
  options?: {
    dueOnLte?: string;
    cadenceId?: number;
  }
): Promise<SalesloftAction[]> {
  const params: Record<string, string | number> = {
    user_guid: userGuid,
  };
  if (options?.dueOnLte) {
    params["due_on[lte]"] = options.dueOnLte;
  }
  if (options?.cadenceId) {
    params.cadence_id = options.cadenceId;
  }
  const actions = await getAllPages<SalesloftAction>(
    accessToken,
    "/actions",
    params
  );
  return actions.map((action) => ({
    id: action.id,
    type: action.type,
    due: action.due,
    status: action.status,
    due_on: action.due_on,
    action_details: action.action_details,
    user: action.user,
    person: action.person,
    cadence: action.cadence,
    step: action.step,
    task: action.task,
  }));
}

export async function getActionsWithDetails(
  accessToken: string,
  options: {
    includeDueActionsOnly: boolean;
    userEmail: string;
  }
): Promise<Result<SalesloftActionWithDetails[], Error>> {
  const user = await getUserByEmail(accessToken, options.userEmail);
  if (!user) {
    return new Err(
      new Error(`User not found with email: ${options.userEmail}`)
    );
  }

  const allActions = await getActions(
    accessToken,
    user.guid,
    options.includeDueActionsOnly
      ? { dueOnLte: new Date().toISOString() }
      : undefined
  );

  if (allActions.length === 0) {
    return new Ok([]);
  }

  const cadenceIds = [
    ...new Set(
      allActions
        .map((action) => action.cadence?.id ?? null)
        .filter((id): id is number => id !== null)
    ),
  ];

  const cadenceMap = await getCadencesByIds(accessToken, cadenceIds);

  const personIds = [
    ...new Set(
      allActions
        .map((action) => action.person?.id ?? null)
        .filter((id): id is number => id !== null)
    ),
  ];

  const peopleMap = await getPeopleByIds(accessToken, personIds);

  const stepIds = [
    ...new Set(
      allActions
        .map((action) => action.step?.id ?? null)
        .filter((id): id is number => id !== null)
    ),
  ];
  const stepMap = await getStepsByIds(accessToken, stepIds);

  const actionDetailsArray = await concurrentExecutor(
    allActions,
    async (action) =>
      action.action_details?.id && action.type
        ? getActionDetails(accessToken, action.type, action.action_details.id)
        : null,
    { concurrency: 10 }
  );

  const actionsWithDetails: SalesloftActionWithDetails[] = allActions.map(
    (action, index) => ({
      action,
      person: action.person?.id
        ? (peopleMap.get(action.person.id) ?? null)
        : null,
      cadence: action.cadence?.id
        ? (cadenceMap.get(action.cadence.id) ?? null)
        : null,
      step: action.step?.id ? (stepMap.get(action.step.id) ?? null) : null,
      action_details: actionDetailsArray[index] ?? null,
    })
  );

  return new Ok(actionsWithDetails);
}
