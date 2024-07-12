## This is the init script used to initialize the development environment.

## Initializing PostgresSQL databases
psql "postgres://dev:dev@localhost:5432/" -c "CREATE DATABASE dust_api;";
psql "postgres://dev:dev@localhost:5432/" -c "CREATE DATABASE dust_databases_store;";
psql "postgres://dev:dev@localhost:5432/" -c "CREATE DATABASE dust_front;";
psql "postgres://dev:dev@localhost:5432/" -c "CREATE DATABASE dust_connectors;";
psql "postgres://dev:dev@localhost:5432/" -c "CREATE DATABASE dust_oauth;";

## Initilizing Qdrant collections
cd core/
cargo run --bin qdrant_create_collection -- --cluster cluster-0 --provider openai --model text-embedding-3-large-1536
cd -
