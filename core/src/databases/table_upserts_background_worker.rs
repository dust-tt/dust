use std::collections::HashMap;

use redis::AsyncCommands;
use tracing::error;

use crate::{
    cache,
    databases::table::{TableUpsertCall, REDIS_TABLE_UPSERT_HASH_NAME},
    project::Project,
    stores::{postgres, store},
};

pub async fn table_upserts_and_deletes_loop() {
    let store: Box<dyn store::Store + Sync + Send> = match std::env::var("CORE_DATABASE_URI") {
        Ok(db_uri) => {
            let store = postgres::PostgresStore::new(&db_uri).await;
            Box::new(store.unwrap())
        }
        Err(_) => panic!("CORE_DATABASE_URI is required (postgres)"),
    };

    if let Some(client) = &*cache::REDIS_CLIENT {
        match client.get_async_connection().await {
            Ok(mut conn) => {
                loop {
                    println!("Running periodic task...");

                    let upsert_call = TableUpsertCall {
                        time: 1234,
                        project_id: 14,
                        data_source_id:
                            "ec567863a147a99af72f73af32c96c326634503be5e0522eac1d38df8ddf9350"
                                .to_string(),
                        table_id: "notion-227d1aba-f14f-80b4-9f56-e0b63d917e70".to_string(),
                    };

                    // Set a Redis hash value
                    let _: () = conn
                        .hset(
                            REDIS_TABLE_UPSERT_HASH_NAME,
                            "id1",
                            serde_json::to_string(&upsert_call).unwrap(),
                        )
                        .await
                        .unwrap();

                    let mut upsert_call = TableUpsertCall {
                    time: 1236,
                    project_id: 20,
                    data_source_id:
                        "bca1ce7bc9a883619457e9854235897aac8c6c3981e3d3c07242c52a99ac40a0"
                            .to_string(),
                    table_id: "google-spreadsheet-19aLn6sKedw1tUHtGaedvs6xV0aC8ACczn7g0UAq9x44-sheet-0".to_string(),
                };
                    let _: () = conn
                        .hset(
                            REDIS_TABLE_UPSERT_HASH_NAME,
                            "id2",
                            serde_json::to_string(&upsert_call).unwrap(),
                        )
                        .await
                        .unwrap();

                    upsert_call.time = 1235;
                    if let Err(e) = conn
                        .hset::<_, _, _, ()>(
                            REDIS_TABLE_UPSERT_HASH_NAME,
                            "id3",
                            serde_json::to_string(&upsert_call).unwrap(),
                        )
                        .await
                    {
                        eprintln!("Redis error: {}", e);
                    }

                    let all_values: HashMap<String, String> =
                        conn.hgetall(REDIS_TABLE_UPSERT_HASH_NAME).await.unwrap();
                    println!("All values in my_hash: {:?}", all_values);

                    let mut values: Vec<TableUpsertCall> = all_values
                        .values()
                        .filter_map(|json_value| serde_json::from_str(json_value).ok())
                        .collect();
                    values.sort_by(|a, b| b.time.cmp(&a.time));
                    // println!("All values ordered by time desc: {:?}", values);

                    for call in values {
                        println!(
                            "Retrieved value from Redis: time={}, project_id={}, data_source_id={}, table_id={}",
                            call.time, call.project_id, call.data_source_id, call.table_id
                        );

                        let table = store
                            .load_data_source_table(
                                &Project::new_from_id(call.project_id),
                                &call.data_source_id,
                                &call.table_id,
                            )
                            .await
                            .unwrap();

                        println!("Loaded table: {:?}", Some(table));
                    }

                    // let rows = GoogleCloudStorageCSVContent {
                    //     bucket: bucket.to_string(),
                    //     bucket_csv_path: bucket_csv_path.to_string(),
                    // }
                    // .parse()
                    // .await?;

                    tokio::time::sleep(std::time::Duration::from_millis(1024)).await;
                }
            }
            Err(e) => {
                error!("Error connecting to Redis: {}.", e);
            }
        }
    }
}
