// Marketing only needs the WhitelistableFeature type to satisfy CONNECTOR_CONFIGURATIONS.rollingOutFlag.
// The full registry lives in front; here we keep an open string type rather than mirroring it.
export type WhitelistableFeature = string;
