import type { Attributes, ModelStatic, Transaction } from "sequelize";
import { Op } from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { WorkspaceDomainUseCaseModel } from "@app/lib/resources/storage/models/workspace_domain_use_case";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type {
  LightWorkspaceType,
  ModelId,
  Result,
  WorkspaceDomainUseCase,
  WorkspaceDomainUseCaseStatus,
  WorkspaceDomainUseCaseType,
  WorkspaceType,
} from "@app/types";
import { Err, Ok } from "@app/types";

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface WorkspaceDomainUseCaseResource
  extends ReadonlyAttributesType<WorkspaceDomainUseCaseModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class WorkspaceDomainUseCaseResource extends BaseResource<WorkspaceDomainUseCaseModel> {
  static model: ModelStatic<WorkspaceDomainUseCaseModel> =
    WorkspaceDomainUseCaseModel;

  constructor(
    model: ModelStatic<WorkspaceDomainUseCaseModel>,
    blob: Attributes<WorkspaceDomainUseCaseModel>
  ) {
    super(WorkspaceDomainUseCaseModel, blob);
  }

  /**
   * Check if a host is under a verified domain.
   * - Exact match: host === domain
   * - Subdomain match: host ends with '.' + domain
   * Both are normalized to lowercase.
   */
  static isHostUnderDomain(host: string, domain: string): boolean {
    const normalizedHost = host.toLowerCase().replace(/\.$/, "");
    const normalizedDomain = domain.toLowerCase().replace(/\.$/, "");

    return (
      normalizedHost === normalizedDomain ||
      normalizedHost.endsWith("." + normalizedDomain)
    );
  }

  /**
   * Check if a host matches any verified domain for a use case.
   * Rejects IP address literals for security.
   */
  static isIpAddress(host: string): boolean {
    // IPv4
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      return true;
    }
    // IPv6 (simplified check)
    if (/^[\da-f:]+$/i.test(host) && host.includes(":")) {
      return true;
    }
    return false;
  }

  /**
   * List all use cases for a workspace.
   */
  static async listByWorkspace(
    workspace: WorkspaceType | LightWorkspaceType
  ): Promise<WorkspaceDomainUseCaseResource[]> {
    const useCases = await WorkspaceDomainUseCaseModel.findAll({
      where: { workspaceId: workspace.id },
      // WORKSPACE_ISOLATION_BYPASS: Need to bypass isolation for workspace-level queries.
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    return useCases.map(
      (uc) => new WorkspaceDomainUseCaseResource(WorkspaceDomainUseCaseModel, uc.get())
    );
  }

  /**
   * List all use cases for a specific domain in a workspace.
   */
  static async listByDomain(
    workspace: WorkspaceType | LightWorkspaceType,
    domain: string
  ): Promise<WorkspaceDomainUseCaseResource[]> {
    const useCases = await WorkspaceDomainUseCaseModel.findAll({
      where: {
        workspaceId: workspace.id,
        domain: domain.toLowerCase(),
      },
      // WORKSPACE_ISOLATION_BYPASS: Need to bypass isolation for workspace-level queries.
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    return useCases.map(
      (uc) => new WorkspaceDomainUseCaseResource(WorkspaceDomainUseCaseModel, uc.get())
    );
  }

  /**
   * List all enabled domains for a specific use case in a workspace.
   */
  static async listEnabledDomainsForUseCase(
    workspace: WorkspaceType | LightWorkspaceType,
    useCase: WorkspaceDomainUseCase
  ): Promise<string[]> {
    const useCases = await WorkspaceDomainUseCaseModel.findAll({
      where: {
        workspaceId: workspace.id,
        useCase,
        status: "enabled",
      },
      // WORKSPACE_ISOLATION_BYPASS: Need to bypass isolation for workspace-level queries.
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    return useCases.map((uc) => uc.domain);
  }

  /**
   * Check if a use case is enabled for a specific domain.
   */
  static async isUseCaseEnabledForDomain(
    workspace: WorkspaceType | LightWorkspaceType,
    domain: string,
    useCase: WorkspaceDomainUseCase
  ): Promise<boolean> {
    const useCaseRecord = await WorkspaceDomainUseCaseModel.findOne({
      where: {
        workspaceId: workspace.id,
        domain: domain.toLowerCase(),
        useCase,
        status: "enabled",
      },
      // WORKSPACE_ISOLATION_BYPASS: Need to bypass isolation for workspace-level queries.
      dangerouslyBypassWorkspaceIsolationSecurity: true,
    });

    return useCaseRecord !== null;
  }

  /**
   * Check if a host should use static IP egress.
   * Returns true if:
   * - Host is not an IP address
   * - Host matches an enabled domain for the mcp_static_ip_egress use case
   */
  static async shouldUseStaticIPEgress(
    workspace: WorkspaceType | LightWorkspaceType,
    host: string
  ): Promise<boolean> {
    // Reject IP addresses for security
    if (this.isIpAddress(host)) {
      return false;
    }

    const enabledDomains = await this.listEnabledDomainsForUseCase(
      workspace,
      "mcp_static_ip_egress"
    );

    return enabledDomains.some((domain) => this.isHostUnderDomain(host, domain));
  }

  /**
   * Create or update a use case for a domain.
   */
  static async upsert(
    workspace: WorkspaceType | LightWorkspaceType,
    {
      domain,
      useCase,
      status,
    }: {
      domain: string;
      useCase: WorkspaceDomainUseCase;
      status: WorkspaceDomainUseCaseStatus;
    },
    transaction?: Transaction
  ): Promise<WorkspaceDomainUseCaseResource> {
    const [record] = await WorkspaceDomainUseCaseModel.upsert(
      {
        workspaceId: workspace.id,
        domain: domain.toLowerCase(),
        useCase,
        status,
      },
      { transaction }
    );

    return new WorkspaceDomainUseCaseResource(
      WorkspaceDomainUseCaseModel,
      record.get()
    );
  }

  /**
   * Update the status of a use case.
   */
  static async updateStatus(
    workspace: WorkspaceType | LightWorkspaceType,
    {
      domain,
      useCase,
      status,
    }: {
      domain: string;
      useCase: WorkspaceDomainUseCase;
      status: WorkspaceDomainUseCaseStatus;
    },
    transaction?: Transaction
  ): Promise<Result<void, Error>> {
    const [affectedCount] = await WorkspaceDomainUseCaseModel.update(
      { status },
      {
        where: {
          workspaceId: workspace.id,
          domain: domain.toLowerCase(),
          useCase,
        },
        transaction,
      }
    );

    if (affectedCount === 0) {
      return new Err(
        new Error(
          `Use case ${useCase} not found for domain ${domain} in workspace ${workspace.sId}`
        )
      );
    }

    return new Ok(undefined);
  }

  /**
   * Update all pending use cases for a domain to enabled.
   * Called when a domain is verified via WorkOS webhook.
   */
  static async enablePendingUseCasesForDomain(
    workspace: WorkspaceType | LightWorkspaceType,
    domain: string,
    transaction?: Transaction
  ): Promise<number> {
    const [affectedCount] = await WorkspaceDomainUseCaseModel.update(
      { status: "enabled" },
      {
        where: {
          workspaceId: workspace.id,
          domain: domain.toLowerCase(),
          status: "pending",
        },
        transaction,
      }
    );

    return affectedCount;
  }

  /**
   * Delete all use cases for a domain.
   * Called when a domain verification fails or domain is removed.
   */
  static async deleteForDomain(
    workspace: WorkspaceType | LightWorkspaceType,
    domain: string,
    transaction?: Transaction
  ): Promise<number> {
    const count = await WorkspaceDomainUseCaseModel.destroy({
      where: {
        workspaceId: workspace.id,
        domain: domain.toLowerCase(),
      },
      transaction,
    });

    return count;
  }

  /**
   * Delete all use cases for a workspace.
   */
  static async deleteAllForWorkspace(
    auth: Authenticator,
    transaction?: Transaction
  ): Promise<void> {
    const workspace = auth.getNonNullableWorkspace();

    await WorkspaceDomainUseCaseModel.destroy({
      where: { workspaceId: workspace.id },
      transaction,
    });
  }

  async delete(
    _auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<ModelId | undefined, Error>> {
    await this.model.destroy({
      where: { id: this.id },
      transaction,
    });

    return new Ok(this.id);
  }

  toJSON(): WorkspaceDomainUseCaseType {
    return {
      domain: this.domain,
      useCase: this.useCase,
      status: this.status,
    };
  }
}
