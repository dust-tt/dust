import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import {
  getAllPages,
  makeSalesloftRequest,
  makeSalesloftSingleItemRequest,
} from "@app/lib/api/actions/servers/salesloft/client";
import type {
  SalesloftAction,
  SalesloftActionDetails,
  SalesloftActionWithDetails,
  SalesloftCadence,
  SalesloftPerson,
  SalesloftStep,
  SalesloftUser,
} from "@app/lib/api/actions/servers/salesloft/types";
import type { Authenticator } from "@app/lib/auth";
import { DustAppSecretModel } from "@app/lib/models/dust_app_secret";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { decrypt } from "@app/types/shared/utils/hashing";

export async function getBearerToken(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<string | null> {
  const toolConfig = agentLoopContext?.runContext?.toolConfiguration;
  if (
    !toolConfig ||
    !isLightServerSideMCPToolConfiguration(toolConfig) ||
    !toolConfig.secretName
  ) {
    return null;
  }

  const secret = await DustAppSecretModel.findOne({
    where: {
      name: toolConfig.secretName,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
  });

  const bearerToken = secret
    ? decrypt(secret.hash, auth.getNonNullableWorkspace().sId)
    : null;

  return bearerToken;
}

export function formatActionAsString(
  action: SalesloftActionWithDetails
): string {
  const parts: string[] = [];

  parts.push(`Action #${action.action.id}`);
  parts.push(`Type: ${action.action.type}`);
  parts.push(`Status: ${action.action.status}`);
  parts.push(`Due: ${action.action.due ? "Yes" : "No"}`);
  if (action.action.due_on) {
    parts.push(`Due On: ${new Date(action.action.due_on).toLocaleString()}`);
  }

  if (action.person) {
    const personName = [action.person.first_name, action.person.last_name]
      .filter(Boolean)
      .join(" ");
    parts.push(`\nPerson: ${personName || "Unknown"}`);

    const personFields = [
      { label: "Email", value: action.person.email_address },
      { label: "Phone", value: action.person.phone },
      { label: "Title", value: action.person.title },
      { label: "Company", value: action.person.person_company_name },
      { label: "Company Website", value: action.person.person_company_website },
      {
        label: "Location",
        value:
          [action.person.city, action.person.state, action.person.country]
            .filter(Boolean)
            .join(", ") || null,
      },
      { label: "LinkedIn", value: action.person.linkedin_url },
      { label: "Twitter", value: action.person.twitter_handle },
      { label: "Job Seniority", value: action.person.job_seniority },
      { label: "Job Function", value: action.person.job_function },
      {
        label: "Do Not Contact",
        value:
          action.person.do_not_contact !== null
            ? action.person.do_not_contact
              ? "Yes"
              : "No"
            : null,
      },
      {
        label: "Untouched",
        value:
          action.person.untouched !== null
            ? action.person.untouched
              ? "Yes"
              : "No"
            : null,
      },
      {
        label: "Hot Lead",
        value:
          action.person.hot_lead !== null
            ? action.person.hot_lead
              ? "Yes"
              : "No"
            : null,
      },
    ];

    personFields.forEach(({ label, value }) => {
      if (value) {
        parts.push(`  ${label}: ${value}`);
      }
    });
  }

  if (action.cadence) {
    parts.push(`\nCadence: ${action.cadence.name}`);
    if (action.cadence.team_cadence) {
      parts.push(`  (Team Cadence)`);
    }
  }

  if (action.step) {
    parts.push(
      `\nStep: ${action.step.name} (Step #${action.step.step_number}, Type: ${action.step.type})`
    );
  }

  if (action.action_details) {
    parts.push(`\nAction Details: Available`);
  }

  return parts.join("\n");
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
