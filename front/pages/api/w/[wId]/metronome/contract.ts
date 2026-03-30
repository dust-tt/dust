/** @ignoreswagger */
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import {
  endMetronomeContract,
  getMetronomeActiveContract,
} from "@app/lib/metronome/client";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";

// Pro seat price in USD cents — kept in sync with the Metronome rate card.
const PRO_SEAT_PRICE_CENTS = 2900;
const MAX_SEAT_PRICE_CENTS = 9900;

export type GetMetronomeContractResponseBody = {
  proSeats: number;
  maxSeats: number;
  // Estimated monthly billing in USD cents (excluding taxes).
  estimatedMonthlyCents: number;
  contractId: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetMetronomeContractResponseBody>>,
  auth: Authenticator
): Promise<void> {
  if (!auth.isAdmin()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only admins can manage the workspace subscription.",
      },
    });
  }

  const workspace = auth.getNonNullableWorkspace();
  const plan = auth.subscription()?.plan;

  if (!plan?.metronomePackageAlias) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "This workspace is not on a Metronome-billed plan.",
      },
    });
  }

  switch (req.method) {
    case "GET": {
      const workspaceResource = await WorkspaceResource.fetchById(
        workspace.sId
      );
      if (!workspaceResource?.metronomeCustomerId) {
        return res.status(200).json({
          proSeats: 0,
          maxSeats: 0,
          estimatedMonthlyCents: 0,
          contractId: null,
        });
      }

      // Seat counts: until seat types (Block 3) all members are Pro seats.
      const proSeats = await MembershipResource.countActiveSeatsInWorkspace(
        workspace.sId
      );
      const maxSeats = 0;

      const contractResult = await getMetronomeActiveContract(
        workspaceResource.metronomeCustomerId
      );
      const contractId = contractResult.isOk()
        ? (contractResult.value?.contractId ?? null)
        : null;

      return res.status(200).json({
        proSeats,
        maxSeats,
        estimatedMonthlyCents:
          proSeats * PRO_SEAT_PRICE_CENTS + maxSeats * MAX_SEAT_PRICE_CENTS,
        contractId,
      });
    }

    case "DELETE": {
      const workspaceResource = await WorkspaceResource.fetchById(
        workspace.sId
      );
      if (!workspaceResource?.metronomeCustomerId) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "subscription_not_found",
            message: "No Metronome customer found for this workspace.",
          },
        });
      }

      const contractResult = await getMetronomeActiveContract(
        workspaceResource.metronomeCustomerId
      );
      if (contractResult.isErr() || !contractResult.value) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "subscription_not_found",
            message: "No active Metronome contract found for this workspace.",
          },
        });
      }

      const endResult = await endMetronomeContract({
        metronomeCustomerId: workspaceResource.metronomeCustomerId,
        contractId: contractResult.value.contractId,
      });

      if (endResult.isErr()) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: `Failed to cancel Metronome contract: ${endResult.error.message}`,
          },
        });
      }

      return res.status(200).json({
        proSeats: 0,
        maxSeats: 0,
        estimatedMonthlyCents: 0,
        contractId: null,
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "Method not supported.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspace(handler);
