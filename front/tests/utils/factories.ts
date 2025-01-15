import type { InferCreationAttributes, Model } from "sequelize";

export abstract class Factory<
  M extends Model,
  A extends InferCreationAttributes<M>,
> {
  attrs: Partial<A> = {};

  abstract make(params: Partial<A>): Promise<M>;

  params(newAttrs: Partial<A>) {
    this.attrs = { ...this.attrs, ...newAttrs };
    return this;
  }

  async createList(count: number, params: Partial<A>): Promise<M[]> {
    const models: M[] = [];
    for (let i = 0; i < count; i++) {
      const model = await this.create(params);
      models.push(model);
    }
    return models;
  }

  async create(params?: Partial<A>): Promise<M> {
    return this.make({ ...this.attrs, ...params });
  }
}
