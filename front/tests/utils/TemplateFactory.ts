import { faker } from "@faker-js/faker";

import { TemplateResource } from "@app/lib/resources/template_resource";

export class TemplateFactory {
  private static defaultParams = () => {
    return {
      description: faker.company.catchPhrase(),
      backgroundColor: "#FFFFFF",
      emoji: faker.internet.emoji(),
      handle: faker.person.firstName(),
      presetTemperature: "balanced" as const,
      presetProviderId: "anthropic" as const,
      presetModelId: "claude-3-opus-20240229" as const,
      presetActions: [],
      tags: [],
      timeFrameDuration: null,
      timeFrameUnit: null,
      presetDescription: null,
      presetInstructions: null,
      helpInstructions: null,
      helpActions: null,
    };
  };

  static async published() {
    return TemplateResource.makeNew({
      ...this.defaultParams(),
      visibility: "published",
    });
  }

  static async draft() {
    return TemplateResource.makeNew({
      ...this.defaultParams(),
      visibility: "draft",
    });
  }
}
