#!/bin/bash
DIR=$(dirname $0)

function escaped_columns_list {
    echo $* | sed -E 's/ /,/g'| sed -E 's/([a-zA-Z_]+)/\\"\1\\"/g'
}
function escaped_values_list {
    echo $* | sed -E 's/ /,/g'| sed -E 's/([a-zA-Z_]+)/\\\\'\1\\\\'/g'
}
function columns_list {
    echo $* | sed -E 's/ /,/g'| sed -E 's/([a-zA-Z_]+)/"\1"/g'
}
function updates_clause {
    echo $* | sed -E 's/ /,/g'| sed -E 's/([a-zA-Z_]+)/"\1"=__copy."\1"/g'
}
function copy_clause {
    echo $* | sed -E 's/ /,/g'| sed -E 's/([a-zA-Z_]+)/__copy."\1"/g'
}
function fetch {
    database_uri=${1}
    table_name=${2}
    cols_to_fetch=${3}
    where_clause=${4}

    echo "Fetching ${table_name} from ${PRODBOX_POD_NAME}..."
    kubectl exec -it ${PRODBOX_POD_NAME} -- bash -c "psql \$${database_uri}_DATABASE_URI  -c \"COPY (SELECT $(escaped_columns_list ${cols_to_fetch}) FROM ${table_name} WHERE ${where_clause}) TO STDOUT;\"" > /tmp/dust-apps/${database_uri}_${table_name}.csv
}

function import {
    database_uri=${1}
    table_name=${2}
    cols_to_import=${3}
    cols_to_update=${4}
    on_conflict=${5}
    additional_where=${6}

    eval uri='$'${database_uri}_DATABASE_URI
    echo -n "Preparing ${table_name}... "
    psql ${uri} -c "drop table if exists __copy" > /dev/null 2>&1
    psql ${uri} -c "create table __copy as (select * from ${table_name} limit 0)" | tr -d '\n'
    echo -n "... Importing ${table_name}... "
    psql ${uri} -c "COPY __copy ($(columns_list ${cols_to_import})) from stdin;" < /tmp/dust-apps/${database_uri}_${table_name}.csv | tr -d '\n'
    echo -n "... Updating existing ${table_name}... "
    psql ${uri} -c "update ${table_name} set $(updates_clause $cols_to_update) from __copy where ${table_name}.id = __copy.id;" | tr -d '\n'
    echo -n "... Inserting new ${table_name}..."
    psql ${uri} -c "insert into ${table_name} ($(columns_list ${cols_to_import})) (select $(copy_clause ${cols_to_import}) from __copy left join ${table_name} using(id) where ${table_name} is null ${additional_where}) ${on_conflict};" | tr -d '\n'
    echo -n "... Cleaning up ${table_name}... "
    psql ${uri} -c "drop table if exists __copy;"
}

if [ -z "$DUST_APPS_SYNC_WORKSPACE_ID" ] 
then
    echo "Please set DUST_APPS_SYNC_WORKSPACE_ID if you want to synchronize dust-apps."
    exit 0
fi

mkdir -p /tmp/dust-apps

cd ${DIR}/..

if [ "$1" == "--cleanup" ]
then
    psql ${FRONT_DATABASE_URI} -c "delete from apps where id>1000;"
    psql ${CORE_DATABASE_URI} -c "delete from specifications where id>10000;"
    psql ${CORE_DATABASE_URI} -c "delete from datasets_joins where id>10000; delete from datasets_points where id>10000; delete from datasets where id>10000;"
fi

if [ "$1" != "--force" ]
then
    ./admin/cli.sh registry dump > /tmp/dust-apps/specs 2> /dev/null

    # Get the appIds in the registry
    REGISTRY_APP_IDS=$(cat /tmp/dust-apps/specs | jq -r '[.[].app.appId] | sort_by(.) | join("\n")')
    # Reads appHash values from JSON, escapes them for shell usage, and concatenates them with commas for SQL queries.
    IN_CLAUSE=$(jq -r '[.[].app.appHash] | map("\(. | @sh)") | join(",")' /tmp/dust-apps/specs)
    # Get projects matching the current specifications
    PROJECTS=$(psql $CORE_DATABASE_URI -c "copy (select distinct(project) from specifications where hash in (${IN_CLAUSE})) to stdout" | sed "s/.*/'&'/" | paste -sd, -)
    # Get appIds matching the specifications
    LOCAL_APP_IDS=$(psql $FRONT_DATABASE_URI -c "copy (select distinct(\"sId\") from apps where \"dustAPIProjectId\" in (${PROJECTS}) and visibility!='deleted' and \"workspaceId\"=${DUST_APPS_SYNC_WORKSPACE_ID} order by \"sId\") to stdout" | paste -sd\  -)

    # Check if any app is missing
    MISSING=false
    for item in $REGISTRY_APP_IDS
    do
        if [[ ! " ${LOCAL_APP_IDS} " =~ " $item " ]]
        then
            echo "Missing app $item"
            MISSING=true
        fi
    done

    if [ "$MISSING" == "false" ]
    then
        echo "All apps available, skipping."
        rm -R /tmp/dust-apps
        exit 0
    fi
fi

echo "Will copy apps into workspace ${DUST_APPS_SYNC_WORKSPACE_ID}..."
echo "You'll have to manually update front/lib/api/config.ts to use localhost:3000 instead of dust.tt,"
echo "and front/lib/development.ts / types/src/front/lib/actions/registry.ts to set your workspace sId in PRODUCTION_DUST_APPS_WORKSPACE_ID"
echo "Ensure you have valid env variables for DUST_MANAGED_ANTHROPIC_API_KEY, DUST_MANAGED_SERP_API_KEY and DUST_MANAGED_BROWSERLESS_API_KEY."
set -e

echo "Fetching prodbox pod..."
PRODBOX_POD_NAME=$(kubectl get pods |grep prodbox |cut -d \  -f1)

# ---- front

fetch FRONT apps "id createdAt updatedAt sId name description visibility savedSpecification savedConfig savedRun dustAPIProjectId workspaceId" "\\\"workspaceId\\\"=5069"
project_ids=$(cut -f 11 /tmp/dust-apps/FRONT_apps.csv |paste -sd "," -)
fetch FRONT datasets "id createdAt updatedAt name description schema appId workspaceId" "\\\"workspaceId\\\"=5069"


# ---- apps
cat /tmp/dust-apps/FRONT_apps.csv | cut -f1-11 | sed -E "s/^(.*)$/\1\t${DUST_APPS_SYNC_WORKSPACE_ID}/g" > /tmp/dust-apps/FRONT_apps_transformed.csv
mv /tmp/dust-apps/FRONT_apps_transformed.csv /tmp/dust-apps/FRONT_apps.csv
import FRONT apps "id createdAt updatedAt sId name description visibility savedSpecification savedConfig savedRun dustAPIProjectId workspaceId" "updatedAt name description visibility savedSpecification savedConfig savedRun dustAPIProjectId"

# ---- datasets
cat /tmp/dust-apps/FRONT_datasets.csv | cut -f1-7 | sed -E "s/^(.*)$/\1\t${DUST_APPS_SYNC_WORKSPACE_ID}/g" > /tmp/dust-apps/FRONT_datasets_transformed.csv
mv /tmp/dust-apps/FRONT_datasets_transformed.csv /tmp/dust-apps/FRONT_datasets.csv
import FRONT datasets "id createdAt updatedAt name description schema appId workspaceId" "updatedAt name description schema"

# ---- core

fetch CORE projects "id" "\\\"id\\\" in (${project_ids})"
fetch CORE specifications "id project created hash specification" "\\\"project\\\" in (${project_ids})"
fetch CORE datasets "id project created dataset_id hash" "\\\"project\\\" in (${project_ids})"
dataset_ids=$(cut -f 1 /tmp/dust-apps/CORE_datasets.csv |paste -sd "," -)
fetch CORE datasets_joins "id dataset point point_idx" "\\\"dataset\\\" in (${dataset_ids})"
dataset_points_ids=$(cut -f 3 /tmp/dust-apps/CORE_datasets_joins.csv |paste -sd "," -)
fetch CORE datasets_points "id hash json" "\\\"id\\\" in (${dataset_points_ids})"

# ---- projects
import CORE projects "id" "id"

# ---- specifications
import CORE specifications "id project created hash specification" "hash specification"

# ---- datasets
import CORE datasets "id project created dataset_id hash" "hash"
import CORE datasets_points "id hash json" "hash json" "on conflict(hash) do nothing"
import CORE datasets_joins "id dataset point point_idx" "point point_idx" "" "and __copy.point in (select id from datasets_points)"

rm -R /tmp/dust-apps
