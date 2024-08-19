#!/bin/bash
DIR=$(dirname $0)

if [ -z "$TARGET_WORKSPACE_ID" ] 
then
    echo "Please set TARGET_WORKSPACE_ID to set where to create dust-apps."
    exit 1
fi

mkdir /tmp/dust-apps

echo "Will copy apps into workspace ${TARGET_WORKSPACE_ID}..."
echo "You'll have to manually update front/lib/api/config.ts to use localhost:3000 instead of dust.tt,"
echo "and front/lib/development.ts / types/src/front/lib/actions/registry.ts to set your workspace sId in PRODUCTION_DUST_APPS_WORKSPACE_ID"
echo "Ensure you have valid env variables for DUST_MANAGED_ANTHROPIC_API_KEY, DUST_MANAGED_SERP_API_KEY and DUST_MANAGED_BROWSERLESS_API_KEY."
set -e

echo "Fetching prodbox pod..."
PRODBOX_POD_NAME=$(kubectl get pods |grep prodbox |cut -d \  -f1)

function escaped_columns_list {
    echo $* | sed -E 's/ /,/g'| sed -E 's/([a-zA-Z_]+)/\\"\1\\"/g'
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

    eval uri='$'${database_uri}_DATABASE_URI
    echo -n "Preparing ${table_name}... "
    psql ${uri} -c "drop table if exists __copy; create table __copy as (select * from ${table_name} limit 0);"
    echo -n "Importing ${table_name}... "
    psql ${uri} -c "COPY __copy ($(columns_list ${cols_to_import})) from stdin;" < /tmp/dust-apps/${database_uri}_${table_name}.csv
    echo -n "Updating existing ${table_name}... "
    psql ${uri} -c "update ${table_name} set $(updates_clause $cols_to_update) from __copy where ${table_name}.id = __copy.id;"
    echo -n "Inserting new ${table_name}... "
    psql ${uri} -c "insert into ${table_name} ($(columns_list ${cols_to_import})) (select $(copy_clause ${cols_to_import}) from __copy left join ${table_name} using(id) where ${table_name} is null);"
    echo -n "Cleaning up ${table_name}... "
    psql ${uri} -c "drop table if exists __copy;"
}

# ---- apps
fetch FRONT apps "id createdAt updatedAt sId name description visibility savedSpecification savedConfig savedRun dustAPIProjectId workspaceId" "\\\"workspaceId\\\"=5069"
cat FRONT_apps.csv | cut -f1-11 | sed -E "s/^(.*)$/\1\t${TARGET_WORKSPACE_ID}/g" > FRONT_apps_transformed.csv
mv FRONT_apps_transformed.csv FRONT_apps.csv
import FRONT apps "id createdAt updatedAt sId name description visibility savedSpecification savedConfig savedRun dustAPIProjectId workspaceId" "updatedAt name description visibility savedSpecification savedConfig savedRun dustAPIProjectId"

# ---- datasets
fetch FRONT datasets "id createdAt updatedAt name description schema appId workspaceId" "\\\"workspaceId\\\"=5069"
cat FRONT_datasets.csv | cut -f1-7 | sed -E "s/^(.*)$/\1\t${TARGET_WORKSPACE_ID}/g" > FRONT_datasets_transformed.csv
mv FRONT_datasets_transformed.csv FRONT_datasets.csv
import FRONT datasets "id createdAt updatedAt name description schema appId workspaceId" "updatedAt name description schema"

project_ids=$(cut -f 11 FRONT_apps.csv |paste -sd "," -)

# ---- projects
fetch CORE projects "id" "\\\"id\\\" in (${project_ids})"
import CORE projects "id" "id"

# ---- specifications
fetch CORE specifications "id project created hash specification" "\\\"project\\\" in (${project_ids})"
import CORE specifications "id project created hash specification" "hash specification"

# ---- datasets
fetch CORE datasets "id project created dataset_id hash" "\\\"project\\\" in (${project_ids})"
dataset_ids=$(cut -f 1 CORE_datasets.csv |paste -sd "," -)
fetch CORE datasets_joins "id dataset point point_idx" "\\\"dataset\\\" in (${dataset_ids})"
dataset_points_ids=$(cut -f 3 CORE_datasets_joins.csv |paste -sd "," -)
fetch CORE datasets_points "id hash json" "\\\"id\\\" in (${dataset_points_ids})"

import CORE datasets "id project created dataset_id hash" "hash"
import CORE datasets_points "id hash json" "hash json"
import CORE datasets_joins " id dataset point point_idx" "point point_idx"

rm -R /tmp/dust-apps