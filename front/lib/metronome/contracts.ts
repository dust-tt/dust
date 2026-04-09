import {
  createMetronomeContract,
  createMetronomeCustomer,
  findMetronomeCustomerByAlias,
  scheduleMetronomeContractEnd,
} from "@app/lib/metronome/client";
import { provisionSeatsForContract } from "@app/lib/metronome/seats";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";

/**
 * Switch a Metronome contract to a different package (end old + create new).
 * Customer must already exist.
 */
export async function switchMetronomeContractPackage({
  metronomeCustomerId,
  oldContractId,
  workspace,
  packageAlias,
}: {
  metronomeCustomerId: string;
  oldContractId: string;
  workspace: LightWorkspaceType;
  packageAlias: string;
}): Promise<Result<{ metronomeContractId: string }, Error>> {
  const endResult = await scheduleMetronomeContractEnd({
    metronomeCustomerId,
    contractId: oldContractId,
  });
  if (endResult.isErr()) {
    return new Err(endResult.error);
  }

  const contractResult = await createMetronomeContract({
    metronomeCustomerId,
    packageAlias,
  });
  if (contractResult.isErr()) {
    return new Err(contractResult.error);
  }

  const { contractId: metronomeContractId, startingAt } = contractResult.value;

  await provisionSeatsForContract({
    metronomeCustomerId,
    contractId: metronomeContractId,
    workspace,
    startingAt,
  });

  return new Ok({ metronomeContractId });
}

/**
 * Ensure a Metronome customer and contract exist for a workspace.
 * Creates the customer if missing, then creates a contract via the package alias.
 * Used from both Stripe webhook (checkout) and Poke (admin upgrade).
 */
export async function provisionMetronomeCustomerAndContract({
  workspace,
  stripeCustomerId,
  packageAlias,
  uniquenessKey,
}: {
  workspace: LightWorkspaceType;
  stripeCustomerId: string;
  packageAlias: string;
  uniquenessKey: string;
}): Promise<
  Result<{ metronomeCustomerId: string; metronomeContractId: string }, Error>
> {
  // Find or create customer.
  let metronomeCustomerId: string | null = null;

  const findResult = await findMetronomeCustomerByAlias(workspace.sId);
  if (findResult.isOk()) {
    metronomeCustomerId = findResult.value;
  }

  if (!metronomeCustomerId) {
    const createResult = await createMetronomeCustomer({
      workspaceId: workspace.sId,
      workspaceName: workspace.name,
      stripeCustomerId,
    });
    if (createResult.isErr()) {
      return new Err(createResult.error);
    }
    metronomeCustomerId = createResult.value.metronomeCustomerId;
  }

  const contractResult = await createMetronomeContract({
    metronomeCustomerId,
    packageAlias,
    uniquenessKey,
  });
  if (contractResult.isErr()) {
    return new Err(contractResult.error);
  }

  const { contractId: metronomeContractId, startingAt } = contractResult.value;

  // Provision all existing workspace members as seats on the new contract.
  await provisionSeatsForContract({
    metronomeCustomerId,
    contractId: metronomeContractId,
    workspace,
    startingAt,
  });

  return new Ok({
    metronomeCustomerId,
    metronomeContractId,
  });
}
