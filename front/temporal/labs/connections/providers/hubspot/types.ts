import * as t from "io-ts";

const CompanyCodec = t.type({
  id: t.string,
  properties: t.record(t.string, t.unknown),
});

const ContactCodec = t.type({
  id: t.string,
  properties: t.record(t.string, t.union([t.string, t.null])),
  createdAt: t.string,
  updatedAt: t.string,
  archived: t.boolean,
});

const DealCodec = t.type({
  id: t.string,
  properties: t.record(t.string, t.union([t.string, t.null])),
  createdAt: t.string,
  updatedAt: t.string,
  archived: t.boolean,
});

const TicketCodec = t.type({
  id: t.string,
  properties: t.record(t.string, t.union([t.string, t.null])),
  createdAt: t.string,
  updatedAt: t.string,
  archived: t.boolean,
});

const OrderCodec = t.type({
  id: t.string,
  properties: t.record(t.string, t.union([t.string, t.null])),
  createdAt: t.string,
  updatedAt: t.string,
  archived: t.boolean,
});

const NoteCodec = t.type({
  id: t.string,
  properties: t.record(t.string, t.union([t.string, t.null])),
  createdAt: t.string,
  updatedAt: t.string,
  archived: t.boolean,
});

const HubspotFilterCodec = t.type({
  propertyName: t.string,
  operator: t.string,
  value: t.string,
});

export type Company = t.TypeOf<typeof CompanyCodec>;
export type Contact = t.TypeOf<typeof ContactCodec>;
export type Deal = t.TypeOf<typeof DealCodec>;
export type Ticket = t.TypeOf<typeof TicketCodec>;
export type Order = t.TypeOf<typeof OrderCodec>;
export type Note = t.TypeOf<typeof NoteCodec>;
export type HubspotFilter = t.TypeOf<typeof HubspotFilterCodec>;

export {
  CompanyCodec,
  ContactCodec,
  DealCodec,
  HubspotFilterCodec,
  NoteCodec,
  OrderCodec,
  TicketCodec,
};
