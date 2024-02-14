import type { Attributes, Model, ModelStatic } from "sequelize";

// BaseResource is an abstract foundation for resource classes, focusing
// on stateless behavior. It retains only the Id, enabling operations like
// delete and update. Updates require a full attribute set, ensuring
// explicit data management.
export class BaseResource<M extends Model> {
  readonly id: number;

  constructor(protected readonly model: ModelStatic<M>, blob: Attributes<M>) {
    Object.assign(this, blob);
    // TODO();
    this.id = (blob as unknown as { id: number }).id;
  }

  static async fetchById<T extends BaseResource<M>, M extends Model>(
    this: {
      new (model: ModelStatic<M>, blob: Attributes<M>): T;
      model: ModelStatic<M>;
    },
    id: number | string
  ): Promise<T | null> {
    const parsedId = typeof id === "string" ? parseInt(id, 10) : id;
    // Use `raw: true` to avoid the nested level with `dataValues`.
    const blob = await this.model.findByPk(parsedId, { raw: true });
    if (!blob) {
      return null;
    }

    return new this(this.model, blob);
  }

  async delete(): Promise<number> {
    return this.model.destroy({
      // @ts-expect-error test
      where: {
        id: this.id,
      },
    });
  }

  async update(blob: Partial<Attributes<M>>): Promise<void> {
    await this.model.update(blob, {
      // @ts-expect-error test
      where: {
        id: this.id,
      },
    });
  }
}
