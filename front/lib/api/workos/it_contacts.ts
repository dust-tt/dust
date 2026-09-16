import { getWorkOS } from "@app/lib/api/workos/client";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

// WorkOS caps an organization at 20 IT contacts.
const MAX_WORKOS_IT_CONTACTS = 20;

interface WorkOSITContact {
  id: string;
  email: string;
}

export interface WorkOSITContactsSyncResult {
  // Emails newly registered as IT contacts.
  created: string[];
  // Emails of IT contacts removed because they are no longer desired.
  deleted: string[];
  // Count of desired emails already registered (left untouched).
  unchanged: number;
  // Desired emails not registered because the 20-contact cap was reached.
  skippedForCap: string[];
}

/**
 * @cc [owner:tdraier,label:product] it-contacts-mirror-admins
 * Reconciles the organization's WorkOS IT contacts to mirror `emails`
 * (case-insensitively deduplicated): existing contacts not in `emails` MUST be
 * deleted and missing ones created, capped at WorkOS' 20-contact limit (excess
 * returned in `skippedForCap`). Returns `Err` if the workspace has no WorkOS
 * organization or any WorkOS call fails.
 */
export async function syncWorkOSITContacts({
  workspace,
  emails,
}: {
  workspace: LightWorkspaceType;
  emails: string[];
}): Promise<Result<WorkOSITContactsSyncResult, Error>> {
  const organizationId = workspace.workOSOrganizationId;
  if (!organizationId) {
    return new Err(
      new Error("No WorkOS organization associated with this workspace.")
    );
  }

  // Deduplicate desired emails case-insensitively (keeping the first casing
  // seen) so casing variants of the same address never consume separate slots.
  const desiredByLowerEmail = new Map<string, string>();
  for (const email of emails) {
    const lowerEmail = email.toLowerCase();
    if (!desiredByLowerEmail.has(lowerEmail)) {
      desiredByLowerEmail.set(lowerEmail, email);
    }
  }

  // `getWorkOS()` reads configuration and may throw a repository configuration
  // error; resolve it outside the request try/catch so such errors propagate
  // rather than being converted into a handled sync failure.
  const workos = getWorkOS();
  const itContactsPath = `/organizations/${organizationId}/it_contacts`;

  let existingContacts: WorkOSITContact[];
  try {
    const { data } = await workos.get<{ data: WorkOSITContact[] }>(
      itContactsPath
    );
    existingContacts = data.data;
  } catch (error) {
    return new Err(normalizeError(error));
  }

  // Plan the reconcile from the fetched state (pure, cannot throw).
  const keptLowerEmails = new Set(
    existingContacts
      .map((contact) => contact.email.toLowerCase())
      .filter((lowerEmail) => desiredByLowerEmail.has(lowerEmail))
  );
  const toDelete = existingContacts.filter(
    (contact) => !desiredByLowerEmail.has(contact.email.toLowerCase())
  );
  const missingEmails = [...desiredByLowerEmail]
    .filter(([lowerEmail]) => !keptLowerEmails.has(lowerEmail))
    .map(([, email]) => email);

  const availableSlots = Math.max(
    0,
    MAX_WORKOS_IT_CONTACTS - keptLowerEmails.size
  );
  const toCreate = missingEmails.slice(0, availableSlots);
  const skippedForCap = missingEmails.slice(availableSlots);

  try {
    for (const contact of toDelete) {
      await workos.delete(`${itContactsPath}/${contact.id}`);
    }
    for (const email of toCreate) {
      await workos.post(itContactsPath, { email });
    }
  } catch (error) {
    return new Err(normalizeError(error));
  }

  return new Ok({
    created: toCreate,
    deleted: toDelete.map((contact) => contact.email),
    unchanged: keptLowerEmails.size,
    skippedForCap,
  });
}
