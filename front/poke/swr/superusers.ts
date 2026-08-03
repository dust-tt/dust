import { useSendNotification } from "@app/hooks/useNotification";
import { getRegionUrl, useRegionContext } from "@app/lib/auth/RegionContext";
import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, useFetcher } from "@app/lib/swr/swr";
import { isAPIErrorResponse } from "@app/types/error";
import type {
  OrphanedPokeRoleEntry,
  PokeGetSuperusers,
  PokeRole,
  SuperuserMemberInfo,
} from "@app/types/poke/roles";
import { normalizeEmail } from "@app/types/poke/roles";
import type { RegionType } from "@app/types/region";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import useSWR from "swr";

function apiUrl(region: RegionType, path: string) {
  return `${getRegionUrl(region)}${path}`;
}

export function enrichMembers(
  snapshot: PokeGetSuperusers | undefined
): SuperuserMemberInfo[] {
  if (!snapshot) {
    return [];
  }
  return snapshot.members.map((member) => {
    const email = normalizeEmail(member.email);
    return {
      ...member,
      hasPokeRoleEntry: email in snapshot.roleEntries,
      pokeRoles: snapshot.roleEntries[email] ?? [],
    };
  });
}

export function getCrossRegionOrphans(
  current: PokeGetSuperusers | undefined,
  other: PokeGetSuperusers | undefined
): OrphanedPokeRoleEntry[] {
  if (!current || !other) {
    return [];
  }
  const activeEmails = new Set(
    [...current.members, ...other.members].map(({ email }) =>
      normalizeEmail(email)
    )
  );
  return Object.entries(current.roleEntries)
    .filter(([email]) => !activeEmails.has(email))
    .map(([email, pokeRoles]) => ({ email, pokeRoles }));
}

export function useSuperusersAdmin() {
  const { regionInfo } = useRegionContext();
  const { fetcher } = useFetcher();
  const sendNotification = useSendNotification();
  const eu = useSWR<PokeGetSuperusers>(
    apiUrl("europe-west1", "/api/poke/superusers"),
    fetcher
  );
  const us = useSWR<PokeGetSuperusers>(
    apiUrl("us-central1", "/api/poke/superusers"),
    fetcher
  );
  const [current, other] =
    regionInfo.name === "europe-west1" ? [eu, us] : [us, eu];

  async function request(path: string, body: unknown, successTitle: string) {
    try {
      const response = await clientFetch(apiUrl(regionInfo.name, path), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const responseBody: unknown = await response.json().catch(() => null);
        sendNotification({
          title: "Update failed",
          description: isAPIErrorResponse(responseBody)
            ? responseBody.error.message
            : `Request failed (${response.status}).`,
          type: "error",
        });
        return false;
      }
      sendNotification({ title: successTitle, type: "success" });
      await Promise.all([eu.mutate(), us.mutate()]);
      return true;
    } catch (error) {
      sendNotification({
        title: "Update failed",
        description: normalizeError(error).message,
        type: "error",
      });
      return false;
    }
  }

  return {
    members: current.data
      ? enrichMembers(current.data)
      : emptyArray<SuperuserMemberInfo>(),
    orphanedRoleEntries: getCrossRegionOrphans(current.data, other.data),
    isLoading: !current.error && !current.data,
    error: current.error,
    auditUnavailable: Boolean(eu.error || us.error),
    setRoles: (email: string, roles: PokeRole[] | null) =>
      request(
        "/api/poke/superusers/roles",
        { email, roles },
        roles === null ? "Poke access removed" : "Poke roles updated"
      ),
    setDustSuperUser: (userId: string, isDustSuperUser: boolean) =>
      request(
        `/api/poke/superusers/${encodeURIComponent(userId)}/superuser`,
        { isDustSuperUser },
        "Dust superuser flag updated"
      ),
  };
}
