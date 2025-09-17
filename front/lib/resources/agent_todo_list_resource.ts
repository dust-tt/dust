import type {
  Attributes,
  CreationAttributes,
  ModelStatic,
  Transaction,
} from "sequelize";

import type { Authenticator } from "@app/lib/auth";
import { BaseResource } from "@app/lib/resources/base_resource";
import { AgentTodoListModel } from "@app/lib/resources/storage/models/agent_todo_lists";
import type { ReadonlyAttributesType } from "@app/lib/resources/storage/types";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { getResourceIdFromSId, makeSId } from "@app/lib/resources/string_ids";
import type { ResourceFindOptions } from "@app/lib/resources/types";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type {
  LightAgentConfigurationType,
  ModelId,
  Result,
  UserType,
} from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

export interface TodoItem {
  [content: string]: boolean;
  id: number;
}

export interface TodoListsData {
  [listName: string]: TodoItem[];
}

// Attributes are marked as read-only to reflect the stateless nature of our Resource.
// This design will be moved up to BaseResource once we transition away from Sequelize.
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-unsafe-declaration-merging
export interface AgentTodoListResource
  extends ReadonlyAttributesType<AgentTodoListModel> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class AgentTodoListResource extends BaseResource<AgentTodoListModel> {
  static model: ModelStaticWorkspaceAware<AgentTodoListModel> =
    AgentTodoListModel;

  constructor(
    model: ModelStatic<AgentTodoListModel>,
    blob: Attributes<AgentTodoListModel>
  ) {
    super(AgentTodoListModel, blob);
  }

  static async makeNew(
    auth: Authenticator,
    blob: CreationAttributes<AgentTodoListModel>,
    transaction?: Transaction
  ) {
    const todoList = await AgentTodoListModel.create(
      {
        ...blob,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      { transaction }
    );

    return new this(AgentTodoListModel, todoList.get());
  }

  private static async baseFetch(
    auth: Authenticator,
    options?: ResourceFindOptions<AgentTodoListModel>,
    transaction?: Transaction
  ) {
    const { where, ...otherOptions } = options ?? {};

    const todoLists = await AgentTodoListModel.findAll({
      where: {
        ...where,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
      ...otherOptions,
      transaction,
    });

    return todoLists.map((t) => new this(AgentTodoListModel, t.get()));
  }

  static async fetchByModelIds(auth: Authenticator, ids: ModelId[]) {
    return this.baseFetch(auth, {
      where: {
        id: ids,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }

  static async fetchByIds(auth: Authenticator, ids: string[]) {
    return AgentTodoListResource.fetchByModelIds(
      auth,
      ids.map(getResourceIdFromSId).filter((id): id is ModelId => id !== null)
    );
  }

  static async findByAgentConfigurationAndUser(
    auth: Authenticator,
    {
      agentConfiguration,
      user,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      user: UserType | null;
    },
    transaction?: Transaction
  ): Promise<AgentTodoListResource | null> {
    const [todoListResource] = await this.baseFetch(
      auth,
      {
        where: {
          agentConfigurationId: agentConfiguration.sId,
          userId: user?.id ?? null,
        },
      },
      transaction
    );

    return todoListResource ?? null;
  }

  private parseTodoListsJson(): TodoListsData {
    try {
      return JSON.parse(this.todoListsJson) as TodoListsData;
    } catch (error) {
      console.error("Failed to parse todo lists JSON:", error);
      return {};
    }
  }

  private async saveTodoListsJson(
    data: TodoListsData,
    transaction?: Transaction
  ): Promise<void> {
    await this.update({ todoListsJson: JSON.stringify(data) }, transaction);
  }

  /**
   * API used by the todo list MCP server
   */

  static async getOrCreateTodoLists(
    auth: Authenticator,
    {
      agentConfiguration,
      user,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      user: UserType | null;
    }
  ): Promise<AgentTodoListResource> {
    return withTransaction(async (t) => {
      let todoListResource = await this.findByAgentConfigurationAndUser(
        auth,
        { agentConfiguration, user },
        t
      );

      if (!todoListResource) {
        todoListResource = await this.makeNew(
          auth,
          {
            agentConfigurationId: agentConfiguration.sId,
            todoListsJson: JSON.stringify({}),
            userId: user?.id ?? null,
          },
          t
        );
      }

      return todoListResource;
    });
  }

  static async listTodoLists(
    auth: Authenticator,
    {
      agentConfiguration,
      user,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      user: UserType | null;
    }
  ): Promise<string[]> {
    const todoListResource = await this.getOrCreateTodoLists(auth, {
      agentConfiguration,
      user,
    });

    const data = todoListResource.parseTodoListsJson();
    return Object.keys(data);
  }

  static async createTodoList(
    auth: Authenticator,
    {
      agentConfiguration,
      user,
      name,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      user: UserType | null;
      name: string;
    }
  ): Promise<Result<void, string>> {
    // Normalize name to lowercase with dashes
    const normalizedName = name.toLowerCase().replace(/\s+/g, "-");

    return withTransaction(async (t) => {
      const todoListResource = await this.getOrCreateTodoLists(auth, {
        agentConfiguration,
        user,
      });

      const data = todoListResource.parseTodoListsJson();

      if (data[normalizedName]) {
        return new Err(`Todo list '${normalizedName}' already exists`);
      }

      data[normalizedName] = [];
      await todoListResource.saveTodoListsJson(data, t);

      return new Ok(undefined);
    });
  }

  static async deleteTodoList(
    auth: Authenticator,
    {
      agentConfiguration,
      user,
      name,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      user: UserType | null;
      name: string;
    }
  ): Promise<Result<void, string>> {
    return withTransaction(async (t) => {
      const todoListResource = await this.getOrCreateTodoLists(auth, {
        agentConfiguration,
        user,
      });

      const data = todoListResource.parseTodoListsJson();

      if (!data[name]) {
        return new Err(`Todo list '${name}' does not exist`);
      }

      delete data[name];
      await todoListResource.saveTodoListsJson(data, t);

      return new Ok(undefined);
    });
  }

  static async listItemsInTodoList(
    auth: Authenticator,
    {
      agentConfiguration,
      user,
      todoListName,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      user: UserType | null;
      todoListName: string;
    }
  ): Promise<Result<TodoItem[], string>> {
    const todoListResource = await this.getOrCreateTodoLists(auth, {
      agentConfiguration,
      user,
    });

    const data = todoListResource.parseTodoListsJson();

    if (!data[todoListName]) {
      return new Err(`Todo list '${todoListName}' does not exist`);
    }

    return new Ok(data[todoListName]);
  }

  static async addItem(
    auth: Authenticator,
    {
      agentConfiguration,
      user,
      todoListName,
      item,
      state,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      user: UserType | null;
      todoListName: string;
      item: string;
      state: boolean;
    }
  ): Promise<Result<number, string>> {
    return withTransaction(async (t) => {
      const todoListResource = await this.getOrCreateTodoLists(auth, {
        agentConfiguration,
        user,
      });

      const data = todoListResource.parseTodoListsJson();

      if (!data[todoListName]) {
        return new Err(`Todo list '${todoListName}' does not exist`);
      }

      // Generate a unique ID
      const existingIds = data[todoListName].map((todoItem) => todoItem.id);
      const newId =
        existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;

      const newItem: TodoItem = { [item]: state, id: newId };
      data[todoListName].push(newItem);

      await todoListResource.saveTodoListsJson(data, t);

      return new Ok(newId);
    });
  }

  static async updateItemState(
    auth: Authenticator,
    {
      agentConfiguration,
      user,
      todoListName,
      id,
      state,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      user: UserType | null;
      todoListName: string;
      id: number;
      state: boolean;
    }
  ): Promise<Result<void, string>> {
    return withTransaction(async (t) => {
      const todoListResource = await this.getOrCreateTodoLists(auth, {
        agentConfiguration,
        user,
      });

      const data = todoListResource.parseTodoListsJson();

      if (!data[todoListName]) {
        return new Err(`Todo list '${todoListName}' does not exist`);
      }

      const itemIndex = data[todoListName].findIndex(
        (todoItem) => todoItem.id === id
      );

      if (itemIndex === -1) {
        return new Err(`Item with id ${id} not found in todo list`);
      }

      const item = data[todoListName][itemIndex];
      const content = Object.keys(item).find((key) => key !== "id");

      if (!content) {
        return new Err(`Invalid item structure for id ${id}`);
      }

      // Update the state
      item[content] = state;

      await todoListResource.saveTodoListsJson(data, t);

      return new Ok(undefined);
    });
  }

  static async deleteItem(
    auth: Authenticator,
    {
      agentConfiguration,
      user,
      todoListName,
      id,
    }: {
      agentConfiguration: LightAgentConfigurationType;
      user: UserType | null;
      todoListName: string;
      id: number;
    }
  ): Promise<Result<void, string>> {
    return withTransaction(async (t) => {
      const todoListResource = await this.getOrCreateTodoLists(auth, {
        agentConfiguration,
        user,
      });

      const data = todoListResource.parseTodoListsJson();

      if (!data[todoListName]) {
        return new Err(`Todo list '${todoListName}' does not exist`);
      }

      const itemIndex = data[todoListName].findIndex(
        (todoItem) => todoItem.id === id
      );

      if (itemIndex === -1) {
        return new Err(`Item with id ${id} not found in todo list`);
      }

      data[todoListName].splice(itemIndex, 1);

      await todoListResource.saveTodoListsJson(data, t);

      return new Ok(undefined);
    });
  }

  async delete(
    auth: Authenticator,
    { transaction }: { transaction?: Transaction }
  ): Promise<Result<undefined, Error>> {
    try {
      await this.model.destroy({
        where: {
          workspaceId: auth.getNonNullableWorkspace().id,
          id: this.id,
        },
        transaction,
      });

      return new Ok(undefined);
    } catch (err) {
      return new Err(normalizeError(err));
    }
  }

  static async deleteAllForWorkspace(auth: Authenticator): Promise<undefined> {
    await this.model.destroy({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });
  }

  get sId(): string {
    return AgentTodoListResource.modelIdToSId({
      id: this.id,
      workspaceId: this.workspaceId,
    });
  }

  static modelIdToSId({
    id,
    workspaceId,
  }: {
    id: ModelId;
    workspaceId: ModelId;
  }): string {
    return makeSId("agent_todo_list", {
      id,
      workspaceId,
    });
  }

  toJSON() {
    return {
      sId: this.sId,
      lastUpdated: this.updatedAt,
      todoListsJson: this.todoListsJson,
    };
  }
}
