import type { DomainUseCase } from "@app/types/domain";

export interface WorkspaceDomain {
  domain: string;
  domainAutoJoinEnabled: boolean;
  useCases: DomainUseCase[];
}
