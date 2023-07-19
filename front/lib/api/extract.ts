import { Authenticator } from "@app/lib/auth";
import { EventSchema } from "@app/lib/models";
import { EventSchemaType } from "@app/types/extract";

export async function getEventSchemas(
  auth: Authenticator
): Promise<EventSchemaType[]> {
  const owner = auth.workspace();
  if (!owner) {
    return [];
  }

  const schemas = await EventSchema.findAll({
    where: {
      workspaceId: owner.id,
    },
    order: [["marker", "ASC"]],
  });

  return schemas.map((schema): EventSchemaType => {
    return {
      marker: schema.marker,
      description: schema.description,
      status: schema.status,
      properties: schema.properties,
    };
  });
}
