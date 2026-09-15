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
 * Reconciles the WorkOS IT contacts of `workspace`'s organization so they mirror
 * `emails` (the workspace admins): every existing IT contact whose email is not
 * in `emails` (case-insensitive) MUST be deleted, and every email in `emails`
 * not yet registered MUST be created, without exceeding WorkOS' 20-contact cap
 * (excess emails are returned in `skippedForCap`, not created). Deletions happen
 * before creations so freed slots can be reused. Returns an `Err` when the
 * workspace has no WorkOS organization or any WorkOS call fails; callers decide
 * whether the failure is fatal (the sync workflow retries on `Err`).
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

  const desiredEmails = Array.from(new Set(emails));
  const desiredEmailsLower = new Set(
    desiredEmails.map((email) => email.toLowerCase())
  );

  try {
    const { data: existing } = await getWorkOS().get<{
      data: WorkOSITContact[];
    }>(`/organizations/${organizationId}/it_contacts`);

    // Delete contacts that are no longer desired (e.g. a former admin).
    const toDelete = existing.data.filter(
      (contact) => !desiredEmailsLower.has(contact.email.toLowerCase())
    );
    for (const contact of toDelete) {
      await getWorkOS().delete(
        `/organizations/${organizationId}/it_contacts/${contact.id}`
      );
    }

    const keptEmailsLower = new Set(
      existing.data
        .map((contact) => contact.email.toLowerCase())
        .filter((email) => desiredEmailsLower.has(email))
    );

    const missingEmails = desiredEmails.filter(
      (email) => !keptEmailsLower.has(email.toLowerCase())
    );

    const availableSlots = Math.max(
      0,
      MAX_WORKOS_IT_CONTACTS - keptEmailsLower.size
    );
    const toCreate = missingEmails.slice(0, availableSlots);
    const skippedForCap = missingEmails.slice(availableSlots);

    for (const email of toCreate) {
      await getWorkOS().post(`/organizations/${organizationId}/it_contacts`, {
        email,
      });
    }

    return new Ok({
      created: toCreate,
      deleted: toDelete.map((contact) => contact.email),
      unchanged: keptEmailsLower.size,
      skippedForCap,
    });
  } catch (error) {
    return new Err(normalizeError(error));
  }
}
