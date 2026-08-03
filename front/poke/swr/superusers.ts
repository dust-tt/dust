import { useSendNotification } from "@app/hooks/useNotification";
import type { PokeGetSuperusers } from "@app/lib/api/poke/superusers";
import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, useFetcher } from "@app/lib/swr/swr";
import type { PokeRole } from "@app/types/poke/roles";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { useCallback } from "react";
import type { Fetcher, KeyedMutator } from "swr";
import useSWR from "swr";

export function usePokeSuperusers() {
  const { fetcher } = useFetcher();
  const { data, error, mutate } = useSWR(
    "/api/poke/superusers",
    fetcher as Fetcher<PokeGetSuperusers>
  );

  return {
    members: data?.members ?? emptyArray(),
    orphanedRoleEntries: data?.orphanedRoleEntries ?? emptyArray(),
    isLoading: !error && !data,
    error,
    mutate,
  };
}

export function useSuperuserMutations(mutate: KeyedMutator<PokeGetSuperusers>) {
  const sendNotification = useSendNotification();

  const request = useCallback(
    async (url: string, body: unknown, successTitle: string) => {
      try {
        const response = await clientFetch(url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const error = await response.json().catch(() => null);
          throw new Error(
            error?.error?.message ?? `Request failed (${response.status}).`
          );
        }
        sendNotification({ title: successTitle, type: "success" });
        await mutate();
        return true;
      } catch (error) {
        sendNotification({
          title: "Update failed",
          description: normalizeError(error).message,
          type: "error",
        });
        return false;
      }
    },
    [mutate, sendNotification]
  );

  return {
    setRoles: (email: string, roles: PokeRole[] | null) =>
      request(
        "/api/poke/superusers/roles",
        { email, roles },
        roles === null ? "Poke access removed" : "Poke roles updated"
      ),
    setDustSuperUser: (userSId: string, isDustSuperUser: boolean) =>
      request(
        `/api/poke/superusers/${encodeURIComponent(userSId)}/superuser`,
        { isDustSuperUser },
        "Dust superuser flag updated"
      ),
  };
}
