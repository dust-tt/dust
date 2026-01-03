## This is the init script used to initialize the development environment.
## Supports parameterized PostgreSQL connection via environment variables (for dust-hive):
##   POSTGRES_PORT (default: 5432)
##   POSTGRES_HOST (default: localhost)

# Use environment variables with defaults
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_URI="postgres://dev:dev@${POSTGRES_HOST}:${POSTGRES_PORT}/"

## Initializing PostgresSQL databases

if [[ "$1" == "--reset-db" ]]; then
    psql "$POSTGRES_URI" -c "DROP DATABASE dust_api;"
    psql "$POSTGRES_URI" -c "DROP DATABASE dust_databases_store;"
    psql "$POSTGRES_URI" -c "DROP DATABASE dust_front;"
    psql "$POSTGRES_URI" -c "DROP DATABASE dust_front_test;"
    psql "$POSTGRES_URI" -c "DROP DATABASE dust_connectors;"
    psql "$POSTGRES_URI" -c "DROP DATABASE dust_connectors_test;"
    psql "$POSTGRES_URI" -c "DROP DATABASE dust_oauth;"
else
    echo "Skipping database reset. Use --reset-db to drop existing databases."
fi


psql "$POSTGRES_URI" -c "CREATE DATABASE dust_api;";
psql "$POSTGRES_URI" -c "CREATE DATABASE dust_databases_store;";
psql "$POSTGRES_URI" -c "CREATE DATABASE dust_front;";
psql "$POSTGRES_URI" -c "CREATE DATABASE dust_front_test;";
psql "$POSTGRES_URI" -c "CREATE DATABASE dust_connectors;";
psql "$POSTGRES_URI" -c "CREATE DATABASE dust_connectors_test;";
psql "$POSTGRES_URI" -c "CREATE DATABASE dust_oauth;";

## Initilizing Qdrant collections
cd core/
cargo run --bin qdrant_create_collection -- --cluster cluster-0 --provider openai --model text-embedding-3-large-1536
cd -

## Initializing Elasticsearch indices
cd core/
cargo run --bin elasticsearch_create_index -- --index-name data_sources_nodes --index-version 4 --skip-confirmation
cargo run --bin elasticsearch_create_index -- --index-name data_sources --index-version 1 --skip-confirmation
cd -

cd front/
npm install
npx tsx ./scripts/create_elasticsearch_index.ts --index-name agent_message_analytics --index-version 2 --skip-confirmation
npx tsx ./scripts/create_elasticsearch_index.ts --index-name user_search --index-version 1 --skip-confirmation
cd -

echo "--"
echo "You should now run the following commands to setup the tables within the databases:"
echo "cd front && ./admin/init_db.sh --unsafe && cd -"
echo "cd front && ./admin/init_plans.sh --unsafe && cd -"
echo "cd connectors && ./admin/init_db.sh --unsafe && cd -"
echo "cd core && cargo run --bin init_db && cd -"
