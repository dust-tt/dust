use anyhow::{anyhow, Result};
use rusqlite::Connection;
use tokio::sync::{
    mpsc::{self, Sender},
    oneshot,
};

pub enum DbMessage {
    Execute {
        query: String,
        response: oneshot::Sender<rusqlite::Result<Vec<String>>>,
    },
}

pub struct SqliteDatabase {
    sender: Sender<DbMessage>,
}

impl SqliteDatabase {
    pub fn new(database_id: &str) -> Self {
        let (tx, mut rx) = mpsc::channel(32);
        let db_id_clone = database_id.to_string();

        tokio::spawn(async move {
            // TODD: init code
            let conn = Connection::open_in_memory().unwrap();
            while let Some(message) = rx.recv().await {
                match message {
                    DbMessage::Execute { query, response } => {
                        println!("Executing query: {} on db: {}", query, db_id_clone);
                        // Execute the query and collect results
                        let mut stmt = conn.prepare(&query).unwrap();
                        let rows = stmt.query_map([], |row| row.get(0)).unwrap();

                        let mut results = Vec::new();
                        for value in rows {
                            results.push(value.unwrap());
                        }

                        // Send the results back through the oneshot channel
                        let _ = response.send(Ok(results));
                    }
                }
            }
        });

        Self { sender: tx }
    }

    pub async fn query(&self, query: String) -> Result<Vec<String>> {
        // Create a oneshot channel for the response
        let (response_tx, response_rx) = oneshot::channel();

        // Send the query and the sender part of the oneshot channel
        self.sender
            .send(DbMessage::Execute {
                query,
                response: response_tx,
            })
            .await
            .unwrap();

        // Await the response
        match response_rx.await {
            Ok(result) => Ok(result?),
            Err(e) => Err(anyhow!("Failed to receive response: {}", e)),
        }
    }
}
