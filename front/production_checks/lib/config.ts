const {
  CONNECTORS_DATABASE_READ_REPLICA_URI,
  FRONT_DATABASE_READ_REPLICA_URI,
} = process.env;

const config = {
  getConnectorsDatabaseReadReplicaUri: () =>
    CONNECTORS_DATABASE_READ_REPLICA_URI,
  getFrontDatabaseReadReplicaUri: () => FRONT_DATABASE_READ_REPLICA_URI,
};

export default config;
