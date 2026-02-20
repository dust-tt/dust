import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { faker } from "@faker-js/faker";

export class UserFactory {
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  static async basic() {
    return UserResource.makeNew(this.defaultParams(false));
  }

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  static async superUser() {
    return UserResource.makeNew(this.defaultParams(true));
  }

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  static async withCreatedAt(createdAt: Date) {
    return UserResource.makeNew(this.defaultParams(false, createdAt));
  }

  private static defaultParams = (
    superUser: boolean = false,
    createdAt: Date = new Date()
  ) => {
    return {
      sId: generateRandomModelSId(),
      workOSUserId: faker.string.uuid(),
      provider: "google" as const,
      providerId: faker.string.uuid(),

      username: faker.internet.displayName(),
      email: faker.internet.email({
        provider: superUser ? "dust.tt" : undefined,
      }),
      name: faker.person.fullName(),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),

      isDustSuperUser: superUser,
      createdAt,
      lastLoginAt: new Date(),
    };
  };
}
