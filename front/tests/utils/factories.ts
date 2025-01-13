import type { InferCreationAttributes, Model } from "sequelize";

export abstract class Factory<M extends Model> {
  attrs: Partial<InferCreationAttributes<M>> = {};

  constructor(attrs?: Partial<InferCreationAttributes<M>>) {
    if (attrs) {
      this.attrs = attrs;
    }
  }

  abstract make(params: Partial<InferCreationAttributes<M>>): Promise<M>;

  params(newAttrs: Partial<InferCreationAttributes<M>>) {
    this.attrs = { ...this.attrs, ...newAttrs };
    return this;
  }

  async createList(
    count: number,
    params: Partial<InferCreationAttributes<M>>
  ): Promise<M[]> {
    const models: M[] = [];
    for (let i = 0; i < count; i++) {
      const model = await this.create(params);
      models.push(model);
    }
    return models;
  }

  async create(params?: Partial<InferCreationAttributes<M>>): Promise<M> {
    return this.make({ ...this.attrs, ...params });
  }
}
