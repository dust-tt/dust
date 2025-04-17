type ResourceWithName = {
  name: string;
};

export const isResourceWithName = (
  resource: object
): resource is ResourceWithName => {
  return "name" in resource && typeof resource.name === "string";
};
