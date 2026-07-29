import { useSendNotification } from "@app/hooks/useNotification";
import type {
  PartialFailureState,
  PokeGetSuperusers,
  SuperuserMutationResult,
} from "@app/lib/api/poke/superusers";
import { clientFetch } from "@app/lib/egress/client";
import type { PokeRole } from "@app/lib/poke/roles";
import { emptyArray, useFetcher } from "@app/lib/swr/swr";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { useCallback } from "react";
import type { Fetcher, KeyedMutator } from "swr";
import useSWR from "swr";

// ---------------------------------------------------------------------------
// Read hook
// ---------------------------------------------------------------------------

export function usePokeSuperusers() {
  const { fetcher } = useFetcher();
  const superusersFetcher: Fetcher<PokeGetSuperusers> = fetcher;

  const { data, error, mutate } = useSWR(
    "/api/poke/superusers",
    superusersFetcher
  );

  return {
    members: data?.members ?? emptyArray(),
    generation: data?.generation ?? 0,
    isSuperusersLoading: !error && !data,
    isSuperusersError: error,
    mutateSuperusers: mutate,
  };
}

// ---------------------------------------------------------------------------
// Shared mutation helpers
// ---------------------------------------------------------------------------

interface PartialFailureBody {
  partialFailure: PartialFailureState;
}

async function handleMutationResponse(
  res: Response,
  sendNotification: ReturnType<typeof useSendNotification>,
  successTitle: string,
  mutateSuperusers: KeyedMutator<PokeGetSuperusers>
): Promise<SuperuserMutationResult | null> {
  if (res.ok) {
    const body: { result: SuperuserMutationResult } = await res.json();
    sendNotification({
      title: successTitle,
      description: `${body.result.email} updated successfully.`,
      type: "success",
    });
    await mutateSuperusers();
    return body.result;
  }

  if (res.status === 409) {
    sendNotification({
      title: "Conflict",
      description:
        "Someone else modified superuser data. Please refresh and try again.",
      type: "error",
    });
    return null;
  }

  const body = await res.json().catch(() => null);

  if (res.status === 500 && body?.partialFailure) {
    const pf = (body as PartialFailureBody).partialFailure;
    sendNotification({
      title: "Partial failure",
      description: `${pf.remediation} (drift: ${pf.currentDriftState})`,
      type: "error",
    });
    await mutateSuperusers();
    return null;
  }

  sendNotification({
    title: "Error",
    description: body?.error?.message ?? `Request failed (${res.status}).`,
    type: "error",
  });
  return null;
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useGrantSuperuser(
  mutateSuperusers: KeyedMutator<PokeGetSuperusers>
) {
  const sendNotification = useSendNotification();

  return useCallback(
    async (
      userSId: string,
      roles: PokeRole[],
      generation: number
    ): Promise<SuperuserMutationResult | null> => {
      try {
        const res = await clientFetch(
          `/api/poke/superusers/${encodeURIComponent(userSId)}/grant`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roles, generation }),
          }
        );

        return handleMutationResponse(
          res,
          sendNotification,
          "Superuser granted",
          mutateSuperusers
        );
      } catch (err) {
        sendNotification({
          title: "Failed to grant superuser",
          description: normalizeError(err).message,
          type: "error",
        });
        return null;
      }
    },
    [sendNotification, mutateSuperusers]
  );
}

export function useRevokeSuperuser(
  mutateSuperusers: KeyedMutator<PokeGetSuperusers>
) {
  const sendNotification = useSendNotification();

  return useCallback(
    async (
      userSId: string,
      generation: number
    ): Promise<SuperuserMutationResult | null> => {
      try {
        const res = await clientFetch(
          `/api/poke/superusers/${encodeURIComponent(userSId)}/revoke`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ generation }),
          }
        );

        return handleMutationResponse(
          res,
          sendNotification,
          "Superuser revoked",
          mutateSuperusers
        );
      } catch (err) {
        sendNotification({
          title: "Failed to revoke superuser",
          description: normalizeError(err).message,
          type: "error",
        });
        return null;
      }
    },
    [sendNotification, mutateSuperusers]
  );
}

export function useUpdateSuperuserRoles(
  mutateSuperusers: KeyedMutator<PokeGetSuperusers>
) {
  const sendNotification = useSendNotification();

  return useCallback(
    async (
      userSId: string,
      roles: PokeRole[],
      generation: number
    ): Promise<SuperuserMutationResult | null> => {
      try {
        const res = await clientFetch(
          `/api/poke/superusers/${encodeURIComponent(userSId)}/roles`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ roles, generation }),
          }
        );

        return handleMutationResponse(
          res,
          sendNotification,
          "Roles updated",
          mutateSuperusers
        );
      } catch (err) {
        sendNotification({
          title: "Failed to update roles",
          description: normalizeError(err).message,
          type: "error",
        });
        return null;
      }
    },
    [sendNotification, mutateSuperusers]
  );
}

export function useRepairSuperuserDrift(
  mutateSuperusers: KeyedMutator<PokeGetSuperusers>
) {
  const sendNotification = useSendNotification();

  return useCallback(
    async (
      userSId: string,
      generation: number,
      roles?: PokeRole[]
    ): Promise<SuperuserMutationResult | null> => {
      try {
        const res = await clientFetch(
          `/api/poke/superusers/${encodeURIComponent(userSId)}/repair`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ generation, ...(roles ? { roles } : {}) }),
          }
        );

        return handleMutationResponse(
          res,
          sendNotification,
          "Drift repaired",
          mutateSuperusers
        );
      } catch (err) {
        sendNotification({
          title: "Failed to repair drift",
          description: normalizeError(err).message,
          type: "error",
        });
        return null;
      }
    },
    [sendNotification, mutateSuperusers]
  );
}
