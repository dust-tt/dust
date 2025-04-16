export interface Company {
  id: string;
  properties: Record<string, unknown>;
}

export interface Contact {
  id: string;
  properties: {
    [key: string]: string;
  };
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export interface Deal {
  id: string;
  properties: {
    [key: string]: string;
  };
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export interface Ticket {
  id: string;
  properties: {
    [key: string]: string;
  };
}

export interface Order {
  id: string;
  properties: {
    [key: string]: string;
  };
}

export interface Note {
  id: string;
  properties: {
    [key: string]: string;
  };
}

export interface HubspotFilter {
  propertyName: string;
  operator: string;
  value: string;
}
