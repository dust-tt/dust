import { faker } from "@faker-js/faker";

import type { Authenticator } from "@app/lib/auth";
import { OnboardingTaskResource } from "@app/lib/resources/onboarding_task_resource";
import type { OnboardingTaskKind } from "@app/lib/resources/storage/models/onboarding_tasks";
import { ONBOARDING_TASK_KINDS } from "@app/lib/resources/storage/models/onboarding_tasks";

export class OnboardingTaskFactory {
  static async create(
    auth: Authenticator,
    {
      context = faker.lorem.sentence(),
      kind = "learning",
      toolName = null,
    }: {
      context?: string;
      kind?: OnboardingTaskKind;
      toolName?: string | null;
    } = {}
  ) {
    const task = await OnboardingTaskResource.makeNew(auth, {
      context,
      kind,
      toolName,
    });

    return task;
  }

  static async createMultiple(
    auth: Authenticator,
    count: number,
    overrides?: {
      context?: string;
      kind?: OnboardingTaskKind;
      toolName?: string | null;
    }
  ) {
    const tasks = [];
    for (let i = 0; i < count; i++) {
      const task = await this.create(auth, {
        context: overrides?.context
          ? `${overrides.context} ${i + 1}`
          : `Test task ${i + 1}`,
        kind:
          overrides?.kind ??
          ONBOARDING_TASK_KINDS[i % ONBOARDING_TASK_KINDS.length],
        toolName: overrides?.toolName,
      });
      tasks.push(task);
    }
    return tasks;
  }
}
