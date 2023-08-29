import { Authenticator } from "@app/lib/auth";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { EventSchema, ExtractedEvent, ModelId } from "@app/lib/models";
import { generateModelSId } from "@app/lib/utils";
import { EventSchemaType, ExtractedEventType } from "@app/types/extract";

function _getEventSchemaType(schema: EventSchema): EventSchemaType {
  return {
    id: schema.id,
    sId: schema.sId,
    marker: schema.marker,
    description: schema.description,
    status: schema.status,
    properties: schema.properties,
  };
}

function _getExtractedEventType(event: ExtractedEvent): ExtractedEventType {
  return {
    id: event.id,
    sId: event.sId,
    marker: event.marker,
    properties: event.properties,
    dataSourceName: event.dataSourceName,
    documentId: event.documentId,
    documentSourceUrl: event.documentSourceUrl,
  };
}

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
    return _getEventSchemaType(schema);
  });
}

export async function getEventSchema({
  auth,
  sId,
}: {
  auth: Authenticator;
  sId: string;
}): Promise<EventSchemaType | null> {
  const owner = auth.workspace();
  if (!owner) {
    return null;
  }

  const schema = await EventSchema.findOne({
    where: {
      sId: sId,
      workspaceId: owner.id,
    },
  });

  if (!schema) {
    return null;
  }

  return _getEventSchemaType(schema);
}

export async function getEventSchemaByModelId({
  auth,
  id,
}: {
  auth: Authenticator;
  id: ModelId;
}): Promise<EventSchemaType | null> {
  const owner = auth.workspace();
  if (!owner) {
    return null;
  }

  const schema = await EventSchema.findOne({
    where: {
      id: id,
      workspaceId: owner.id,
    },
  });

  if (!schema) {
    return null;
  }

  return _getEventSchemaType(schema);
}

export async function createEventSchema({
  auth,
  marker,
  description,
  properties,
}: {
  auth: Authenticator;
  marker: string;
  description: string;
  properties: [];
}): Promise<EventSchemaType | void> {
  const owner = auth.workspace();
  const user = auth.user();
  if (!owner || !user) {
    return;
  }

  const schema = await EventSchema.create({
    sId: generateModelSId(),
    marker: marker,
    description: description,
    properties: properties,
    status: "active",
    workspaceId: owner.id,
    debug: isDevelopmentOrDustWorkspace(owner), // @todo Daph schema_debug_feature
    userId: user.id,
  });

  return _getEventSchemaType(schema);
}

export async function updateEventSchema({
  auth,
  eventSId,
  newMarker,
  newDescription,
  newProperties,
}: {
  auth: Authenticator;
  eventSId: string;
  newMarker: string;
  newDescription: string;
  newProperties: [];
}): Promise<EventSchemaType | void> {
  const owner = auth.workspace();
  if (!owner) {
    return;
  }

  const schema = await EventSchema.findOne({
    where: {
      sId: eventSId,
      workspaceId: owner.id,
    },
  });

  if (!schema) {
    return;
  }

  await schema.update({
    marker: newMarker,
    description: newDescription,
    properties: newProperties,
  });

  return _getEventSchemaType(schema);
}

export async function getExtractedEvent({
  auth,
  sId,
}: {
  auth: Authenticator;
  sId: string;
}): Promise<ExtractedEventType | null> {
  const owner = auth.workspace();
  if (!owner) {
    return null;
  }

  const event = await ExtractedEvent.findOne({
    where: {
      sId,
    },
  });

  if (!event) {
    return null;
  }

  return _getExtractedEventType(event);
}

export async function getExtractedEvents({
  auth,
  schemaSId,
}: {
  auth: Authenticator;
  schemaSId: string;
}): Promise<ExtractedEventType[]> {
  const owner = auth.workspace();
  if (!owner) {
    return [];
  }

  const schema = await EventSchema.findOne({
    where: {
      sId: schemaSId,
      workspaceId: owner.id,
    },
  });

  if (!schema) {
    return [];
  }

  const events = await ExtractedEvent.findAll({
    where: {
      eventSchemaId: schema.id,
    },
    order: [["createdAt", "DESC"]],
  });

  return events.map((event): ExtractedEventType => {
    return _getExtractedEventType(event);
  });
}

export async function updateExtractedEvent({
  auth,
  sId,
  status,
}: {
  auth: Authenticator;
  sId: string;
  status: "accepted" | "rejected";
}): Promise<ExtractedEventType | null> {
  const owner = auth.workspace();
  if (!owner) {
    return null;
  }

  const event = await ExtractedEvent.findOne({
    where: {
      sId: sId,
    },
  });

  if (!event) {
    return null;
  }

  // Make sure the event belongs to the workspace before editing
  const schema = await EventSchema.findOne({
    where: {
      id: event.eventSchemaId,
    },
  });
  if (!schema || schema.workspaceId !== owner.id) {
    return null;
  }

  await event.update({
    status,
  });

  return _getExtractedEventType(event);
}
