import { faker } from "@faker-js/faker";
import type { InferCreationAttributes } from "sequelize";

import { TemplateModel } from "@app/lib/resources/storage/models/templates";

import { Factory } from "./factories";

class TemplateFactory extends Factory<TemplateModel> {
  constructor() {
    super({
      description: faker.company.catchPhrase(),
      backgroundColor: "#FFFFFF",
      emoji: faker.internet.emoji(),
      handle: faker.person.firstName(),
      presetTemperature: "balanced",
      presetProviderId: "anthropic",
      presetModelId: "claude-3-opus-20240229",
      presetActions: [],
      tags: [],
      timeFrameDuration: null,
      timeFrameUnit: null,
      presetDescription: null,
      presetInstructions: null,
      helpInstructions: null,
      helpActions: null,
    });
  }

  async make(params: InferCreationAttributes<TemplateModel>) {
    return TemplateModel.create(params);
  }

  published() {
    return this.params({
      visibility: "published",
    });
  }

  draft() {
    return this.params({
      visibility: "draft",
    });
  }
}

export const templateFactory = () => {
  return new TemplateFactory();
};
