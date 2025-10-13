use std::sync::Arc;

use anyhow::{anyhow, Result};
use cloud_storage::Object;
use csv_async::AsyncReaderBuilder;
use futures::stream::StreamExt;
use lazy_static::lazy_static;
use tokio::io::AsyncReadExt;

use regex::Regex;
use tokio_util::compat::TokioAsyncReadCompatExt;
use tracing::info;
use unicode_normalization::UnicodeNormalization;

use crate::{databases::table::Row, utils};

pub struct GoogleCloudStorageCSVContent {
    pub bucket: String,
    pub bucket_csv_path: String,
}

pub const MAX_TABLE_COLUMNS: usize = 512;
pub const MAX_COLUMN_NAME_LENGTH: usize = 1024;
const MAX_TABLE_ROWS: usize = 500_000;

impl GoogleCloudStorageCSVContent {
    pub async fn parse(&self) -> Result<Vec<Row>> {
        let now = utils::now();
        let bucket = &self.bucket;
        let path = &self.bucket_csv_path;

        // This is not the most efficient as we download the entire file here but we will
        // materialize it in memory as Vec<Row> anyway so that's not a massive difference.
        let content = Object::download(bucket, path).await?;
        let rdr = std::io::Cursor::new(content);

        // We buffer the reader to make sure we yield the thread while processing.
        const CHUNK_SIZE: usize = 64 * 1024; // 64KB chunks
        let buffered = tokio::io::BufReader::with_capacity(CHUNK_SIZE, rdr);
        let download_duration = utils::now() - now;

        let now = utils::now();
        let (delimiter, rdr) = Self::find_delimiter(buffered).await?;
        let delimiter_duration = utils::now() - now;

        let now = utils::now();
        let rows = Self::csv_to_rows(rdr, delimiter).await?;
        let csv_to_rows_duration = utils::now() - now;

        info!(
            row_count = rows.len(),
            download_duration = download_duration,
            delimiter_duration = delimiter_duration,
            csv_to_rows_duration = csv_to_rows_duration,
            "CSV parse"
        );
        Ok(rows)
    }

    fn slugify(text: &str) -> String {
        lazy_static! {
            static ref DIACRITICS: Regex = Regex::new(r"[\u{0300}-\u{036f}]").unwrap();
            static ref UNDERSCORES: Regex = Regex::new(r"_+").unwrap();
            static ref WHITESPACE: Regex = Regex::new(r"\s+").unwrap();
            static ref NON_ASCII: Regex = Regex::new(r"[^a-zA-Z0-9_]").unwrap();
        }

        let s = text
            .nfkd() // Normalize to decomposed form
            .collect::<String>();
        let s = DIACRITICS.replace_all(&s, "").to_string();

        // Insert _ between lowercase and uppercase/number
        let mut with_separators = String::new();
        let chars: Vec<char> = s.chars().collect();
        for (i, &c) in chars.iter().enumerate() {
            if i > 0 && (c.is_uppercase() || c.is_ascii_digit()) {
                if chars[i - 1].is_lowercase() {
                    with_separators.push('_');
                }
            }
            with_separators.push(c);
        }

        let s = with_separators.to_lowercase().trim().to_string();
        let s = WHITESPACE.replace_all(&s, "_").to_string();
        let s = NON_ASCII.replace_all(&s, "_").to_string();

        UNDERSCORES.replace_all(&s, "_").to_string()
    }

    pub fn sanitize_headers(headers: Vec<&str>) -> Result<Vec<String>> {
        let mut acc = Vec::new();

        for curr in headers {
            // Special case for __dust_id which is a reserved header
            let slug = if curr == "__dust_id" {
                curr.to_string()
            } else {
                let s = Self::slugify(&curr.to_lowercase());
                if s.is_empty() {
                    format!("col_{}", acc.len())
                } else {
                    s
                }
            };

            if slug.len() > MAX_COLUMN_NAME_LENGTH {
                return Err(anyhow!("Column name exceeds maximum length"));
            }

            if !acc.contains(&slug) {
                acc.push(slug);
                continue;
            }

            // Handle conflicts by appending incrementing numbers
            let mut conflict_resolved = false;
            for i in 2..64 {
                let candidate = Self::slugify(&format!("{}-{}", slug, i));
                if !acc.contains(&candidate) {
                    acc.push(candidate);
                    conflict_resolved = true;
                    break;
                }
            }

            if !conflict_resolved {
                return Err(anyhow!(
                    "Failed to generate unique slugified name \
                      for header '{}' after multiple attempts",
                    curr
                ));
            }
        }

        Ok(acc)
    }

    async fn find_delimiter<R: tokio::io::AsyncRead + Unpin + Send + 'static>(
        mut rdr: R,
    ) -> Result<(u8, Box<dyn tokio::io::AsyncRead + Unpin + Send>)> {
        let mut buffer = vec![0; 16 * 1024];
        let n = rdr.read(&mut buffer).await?;
        buffer.truncate(n);

        let candidates = b",;\t";

        let mut counts = vec![0; candidates.len()];
        let mut in_quotes = false;

        for &c in &buffer {
            match c {
                b'"' => in_quotes = !in_quotes,
                _ if !in_quotes => {
                    for (i, &candidate) in candidates.iter().enumerate() {
                        if c == candidate {
                            counts[i] += 1;
                        }
                    }
                }
                _ => {}
            }
        }

        let (i, _) = counts
            .iter()
            .enumerate()
            // Negative index to prioritize earlier delimiters
            .max_by_key(|&(i, count)| (count, -(i as i32)))
            .ok_or_else(|| anyhow!("No delimiter found"))?;

        Ok((
            candidates[i],
            Box::new(tokio::io::AsyncReadExt::chain(
                std::io::Cursor::new(buffer),
                rdr,
            )),
        ))
    }

    async fn csv_to_rows<R>(rdr: R, delimiter: u8) -> Result<Vec<Row>>
    where
        R: tokio::io::AsyncRead + Unpin + Send,
    {
        let mut csv = AsyncReaderBuilder::new()
            .delimiter(delimiter)
            .flexible(true)
            .create_reader(TokioAsyncReadCompatExt::compat(rdr));

        let headers = Self::sanitize_headers(csv.headers().await?.iter().collect::<Vec<&str>>())?;
        let headers = Arc::new(headers);

        if headers.len() > MAX_TABLE_COLUMNS {
            Err(anyhow!("Too many columns in CSV file"))?;
        }
        if headers.len() == 0 {
            Err(anyhow!("No columns in CSV file"))?;
        }

        // If we have a __dust_id column, we need to remove it from the headers but save the column index for later.
        let dust_id_pos = headers.iter().position(|h| h == "__dust_id");
        let headers = match dust_id_pos {
            Some(pos) => {
                let mut headers = headers.iter().cloned().collect::<Vec<String>>();
                headers.remove(pos);
                Arc::new(headers)
            }
            None => headers,
        };

        let mut rows = Vec::new();

        let mut records = csv.records();
        let mut row_idx = 0;
        while let Some(record) = records.next().await {
            let record = record?;
            let mut record = record.iter().collect::<Vec<_>>();

            // If we have a __dust_id column, we need to remove it from the record and use it as the row id.
            // It has been removed from the headers already.
            let (row_id, record) = if let Some(pos) = dust_id_pos {
                let row_id = record.remove(pos).trim().to_string();
                (row_id, record)
            } else {
                (row_idx.to_string(), record)
            };

            let row = Row::from_csv_record(headers.clone(), record, row_id)?;
            row_idx += 1;
            if row_idx > MAX_TABLE_ROWS {
                Err(anyhow!("Too many rows in CSV file"))?;
            }
            rows.push(row);
        }

        Ok(rows)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use crate::databases::table_schema::{TableSchema, TableSchemaFieldType};

    use super::*;

    #[tokio::test]
    async fn test_find_delimiter() -> anyhow::Result<()> {
        let csv = "a,b,c\n1,2,3\n4,5,6";
        let (delimiter, _) =
            GoogleCloudStorageCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        assert_eq!(delimiter, b',');

        let csv = "a;b;c\n1;2;3\n4;5;6";
        let (delimiter, mut rdr) =
            GoogleCloudStorageCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        assert_eq!(delimiter, b';');

        // read content of rdr to a string
        let mut content = String::new();
        rdr.read_to_string(&mut content).await?;
        assert_eq!(content, csv);

        let csv = "URL,Example\n\
FOO,swap\tblocked\tstyle-src-elem\ttheme.js:2\n\
BAR,acme";
        let (delimiter, _) =
            GoogleCloudStorageCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        assert_eq!(delimiter, b',');

        Ok(())
    }

    #[tokio::test]
    async fn test_sanitize_headers() -> anyhow::Result<()> {
        // This test covers alignment of the slugification we were doing in front before moving
        // this logic to core. It's important to preserve it as non truncated upserts would be
        // impacted by a change of headers.
        let headers = vec![
            "helloWorld",
            "b,.,2Fkls",
            "Æúű---cool?",
            "___",
            "a",
            "c_____d__",
            "___",
            "__dust_id",
            "a",
            "",
            "a",
            "Тип задачи",
            "Примечания",
            "",
            "重要度",
            "入出荷数量(+ or -) の COU",
            "旧_Offered price per video(2024.7)",
            "🦄 IG User ID",
        ];
        let sanitized = GoogleCloudStorageCSVContent::sanitize_headers(headers)?;
        assert_eq!(
            sanitized,
            vec![
                "helloworld",
                "b_2fkls",
                "_uu_cool_",
                "_",
                "a",
                "c_d_",
                "_2",
                "__dust_id",
                "a_2",
                "col_9",
                "a_3",
                "_3",
                "_4",
                "col_13",
                "_5",
                "_or_cou",
                "_offered_price_per_video_2024_7_",
                "_ig_user_id"
            ]
        );
        Ok(())
    }

    #[tokio::test]
    async fn test_csv_to_rows() -> anyhow::Result<()> {
        let csv = "hellWorld,super-fast,c/foo,DATE\n\
                   1,2.23,3,2025-02-14T15:06:52.380Z\n\
                   4,hello world,6,\"Fri, 14 Feb 2025 15:10:34 GMT\"";
        let (delimiter, rdr) =
            GoogleCloudStorageCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        let rows = GoogleCloudStorageCSVContent::csv_to_rows(rdr, delimiter).await?;

        assert_eq!(rows.len(), 2);

        // Test first row
        assert_eq!(rows[0].row_id, "0");
        assert_eq!(rows[0].value()["hellworld"], 1.0);
        assert_eq!(rows[0].value()["super_fast"], 2.23);
        assert_eq!(rows[0].value()["c_foo"], 3.0);
        let value = rows[0].value();
        let date = value["date"].as_object().unwrap();
        assert_eq!(date["type"], "datetime");
        assert_eq!(date["epoch"], 1739545612380i64);
        assert_eq!(date["string_value"], "2025-02-14T15:06:52.380Z");

        // Test second row
        assert_eq!(rows[1].row_id, "1");
        assert_eq!(rows[1].value()["hellworld"], 4.0);
        assert_eq!(rows[1].value()["super_fast"], "hello world");
        assert_eq!(rows[1].value()["c_foo"], 6.0);
        let value = rows[1].value();
        let date = value["date"].as_object().unwrap();
        assert_eq!(date["type"], "datetime");
        assert_eq!(date["epoch"], 1739545834000i64);
        assert_eq!(date["string_value"], "Fri, 14 Feb 2025 15:10:34 GMT");

        let csv = "__dust_id,super-fast,c/foo,DATE\n\
                   MYID1,2.23,3,2025-02-14T15:06:52.380Z\n\
                   MYID2,hello world,6,\"Fri, 14 Feb 2025 15:10:34 GMT\"";
        let (delimiter, rdr) =
            GoogleCloudStorageCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        let rows = GoogleCloudStorageCSVContent::csv_to_rows(rdr, delimiter).await?;

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].row_id, "MYID1");
        assert_eq!(rows[1].row_id, "MYID2");
        assert_eq!(
            rows[0].headers.iter().collect::<Vec<&String>>(),
            &["super_fast", "c_foo", "date"]
        );
        assert_eq!(
            rows[1].headers.iter().collect::<Vec<&String>>(),
            &["super_fast", "c_foo", "date"]
        );

        Ok(())
    }

    #[tokio::test]
    async fn test_csv_with_dust_id() -> anyhow::Result<()> {
        let csv = "hellWorld,super-fast,__dust_id,c/foo,DATE\n\
                   1,2.23,foo0,3,2025-02-14T15:06:52.380Z\n\
                   4,hello world,foo1,6,\"Fri, 14 Feb 2025 15:10:34 GMT\"";
        let (delimiter, rdr) =
            GoogleCloudStorageCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        let rows = GoogleCloudStorageCSVContent::csv_to_rows(rdr, delimiter).await?;

        assert_eq!(rows.len(), 2);

        // Test that __dust_id is used to define the row ids.
        assert_eq!(rows[0].row_id, "foo0");
        assert_eq!(rows[1].row_id, "foo1");

        // Test that __dust_id is not inserted.
        let row_0_concatenated_keys = rows[0]
            .value()
            .keys()
            .into_iter()
            .map(|k| k.to_string())
            .collect::<Vec<String>>()
            .join(",");

        assert_eq!(row_0_concatenated_keys, "hellworld,super_fast,c_foo,date");

        Ok(())
    }

    #[tokio::test]
    async fn test_csv_errors() -> anyhow::Result<()> {
        // Test empty CSV
        let csv = "";
        let (delimiter, rdr) =
            GoogleCloudStorageCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        assert!(GoogleCloudStorageCSVContent::csv_to_rows(rdr, delimiter)
            .await
            .is_err());

        // Test CSV with only headers
        let csv = "header1,header2";
        let (delimiter, rdr) =
            GoogleCloudStorageCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        let rows = GoogleCloudStorageCSVContent::csv_to_rows(rdr, delimiter).await?;
        assert_eq!(rows.len(), 0);

        // Test CSV with too many columns (if MAX_TABLE_COLUMNS is defined)
        let mut csv = String::new();
        for i in 0..1000 {
            if i > 0 {
                csv.push(',');
            }
            csv.push_str(&format!("header{}", i));
        }
        let (delimiter, rdr) =
            GoogleCloudStorageCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        assert!(GoogleCloudStorageCSVContent::csv_to_rows(rdr, delimiter)
            .await
            .is_err());

        Ok(())
    }

    #[tokio::test]
    async fn test_csv_to_schema_end_to_end() -> anyhow::Result<()> {
        let csv = "string,int,float,bool,date\n\
                   foo,123,0.231,true,2025-02-14T15:06:52.380Z\n\
                   ,,,,\n\
                    , , , , \n\
                    , , ,TRUE , \n\
                    , , ,FALSE, \n\
                    , , ,t , \n\
                   bar,0,23123.0,false,\"Fri, 14 Feb 2025 15:10:34 GMT\"";
        let (delimiter, rdr) =
            GoogleCloudStorageCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        let rows = Arc::new(GoogleCloudStorageCSVContent::csv_to_rows(rdr, delimiter).await?);
        let schema = TableSchema::from_rows_async(rows).await?;

        assert_eq!(schema.columns()[0].value_type, TableSchemaFieldType::Text);
        assert_eq!(schema.columns()[1].value_type, TableSchemaFieldType::Int);
        assert_eq!(schema.columns()[2].value_type, TableSchemaFieldType::Float);
        assert_eq!(schema.columns()[3].value_type, TableSchemaFieldType::Bool);
        assert_eq!(
            schema.columns()[4].value_type,
            TableSchemaFieldType::DateTime
        );

        Ok(())
    }
}
