import { makeScript } from "scripts/helpers";

import { dataSourceConfigFromConnector } from "@connectors/lib/api/data_source_config";
import { deleteDataSourceTable } from "@connectors/lib/data_sources";
import { ConnectorResource } from "@connectors/resources/connector_resource";

const values = [
  { connectorId: 1436, fileId: "11gvdJuFIEImUjQfXMeJ0QEll83blbx_i" },
  { connectorId: 1436, fileId: "16XPVqXUJj6eGpkFnpZiY1wAR08mrwOaF" },
  { connectorId: 1436, fileId: "19rKhMi-xRymY2z-KAHTJFxa_C6Q4JT5F" },
  { connectorId: 1436, fileId: "1aeP_biVYTRgMAlyt_k5nOlFIA6I9ZUyu" },
  { connectorId: 1436, fileId: "1c2EvM7tB7UOzil2MhBCL-MENzWFnsTbY" },
  { connectorId: 1436, fileId: "1d8jMELO_plknB2QFR_q-VyZpMwjxPyQv" },
  { connectorId: 1436, fileId: "1jKRWXkzk-CQ2w_QazGNMk2wEUpNVPEMR" },
  { connectorId: 1436, fileId: "1JMOQlW6mH_-0nazPpCknp37ksckf2epO" },
  { connectorId: 1436, fileId: "1RTFrgCpwrvnKbl5AO4y_X2l0ob9mBGzZ" },
  { connectorId: 1436, fileId: "1TL9_ZAu3IJW-FlDl5iwD2erjamKGeBjT" },
  { connectorId: 1436, fileId: "1TOljU7Qy165GNdvaArg6iu6Sg18_OLLh" },
  { connectorId: 1436, fileId: "1V6sMgoSZZQrwBIYglfEQU6jrSjn49OVB" },
  { connectorId: 1436, fileId: "1vG1uedE9byrkWQT8I8JTkA705KEGUsAd" },
];
const deleteTable = async ({
  connectorId,
  tableId,
}: {
  connectorId: number;
  tableId: string;
}) => {
  const connector = await ConnectorResource.fetchById(connectorId);
  if (!connector) {
    throw new Error("Connector not found.");
  }
  if (connector) {
    const dataSourceConfig = dataSourceConfigFromConnector(connector);
    await deleteDataSourceTable({ dataSourceConfig, tableId });
  }
};

makeScript({}, async () => {
  for (const value of values) {
    try {
      await deleteTable({
        connectorId: value.connectorId,
        tableId: value.fileId,
      });
    } catch (e) {
      console.error(e);
    }
  }
});
