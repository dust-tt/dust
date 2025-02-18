use anyhow::{anyhow, Result};
use cloud_storage::Object;
use csv_async::AsyncReaderBuilder;
use futures::stream::StreamExt;
use lazy_static::lazy_static;
use tokio::io::AsyncReadExt;

use regex::Regex;
use tokio_util::compat::TokioAsyncReadCompatExt;
use unicode_normalization::UnicodeNormalization;

use crate::databases::table::Row;

pub struct UpsertQueueCSVContent {
    pub upsert_queue_bucket_csv_path: String,
}

const MAX_TABLE_COLUMNS: usize = 512;
const MAX_COLUMN_NAME_LENGTH: usize = 1024;

impl UpsertQueueCSVContent {
    async fn get_upsert_queue_bucket() -> Result<String> {
        match std::env::var("DUST_UPSERT_QUEUE_BUCKET") {
            Ok(bucket) => Ok(bucket),
            Err(_) => Err(anyhow!("DUST_UPSERT_QUEUE_BUCKET is not set")),
        }
    }

    pub async fn parse(&self) -> Result<Vec<Row>> {
        let bucket = Self::get_upsert_queue_bucket().await?;
        let path = &self.upsert_queue_bucket_csv_path;

        // This is not the most efficient as we download the entire file here but we will
        // materialize it in memory as Vec<Row> anyway so that's not a massive difference.
        let content = Object::download(&bucket, path).await?;
        let rdr = std::io::Cursor::new(content);

        // We buffer the reader to make sure we yield the thread while processing.
        const CHUNK_SIZE: usize = 64 * 1024; // 64KB chunks
        let buffered = tokio::io::BufReader::with_capacity(CHUNK_SIZE, rdr);

        let (delimiter, rdr) = Self::find_delimiter(buffered).await?;
        Self::csv_to_rows(rdr, delimiter).await
    }

    fn slugify(text: &str) -> String {
        lazy_static! {
            static ref DIACRITICS: Regex = Regex::new(r"[\u{0300}-\u{036f}]").unwrap();
            static ref UNDERSCORES: Regex = Regex::new(r"_+").unwrap();
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

        let s = with_separators
            .to_lowercase()
            .trim()
            .split_whitespace()
            .collect::<Vec<_>>()
            .join("_") // Replace spaces with _
            .chars()
            .map(|c| if c.is_alphanumeric() { c } else { '_' }) // Replace non-word chars
            .collect::<String>();

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

        let candidates = b",;\t|";

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
            .max_by_key(|&(_, count)| count)
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
            .create_reader(TokioAsyncReadCompatExt::compat(rdr));

        let headers = UpsertQueueCSVContent::sanitize_headers(
            csv.headers().await?.iter().collect::<Vec<&str>>(),
        )?;

        if headers.len() > MAX_TABLE_COLUMNS {
            Err(anyhow!("Too many columns in CSV file"))?;
        }
        if headers.len() == 0 {
            Err(anyhow!("No columns in CSV file"))?;
        }

        let mut rows = Vec::new();

        let mut records = csv.records();
        let mut row_idx = 0;
        while let Some(record) = records.next().await {
            let record = record?;
            let row = Row::from_csv_record(&headers, record.iter().collect::<Vec<_>>(), row_idx)?;
            row_idx += 1;
            rows.push(row);
        }

        Ok(rows)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_find_delimiter() -> anyhow::Result<()> {
        let csv = "a,b,c\n1,2,3\n4,5,6";
        let (delimiter, _) =
            UpsertQueueCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        assert_eq!(delimiter, b',');

        let csv = "a;b;c\n1;2;3\n4;5;6";
        let (delimiter, mut rdr) =
            UpsertQueueCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        assert_eq!(delimiter, b';');

        // read content of rdr to a string
        let mut content = String::new();
        rdr.read_to_string(&mut content).await?;
        assert_eq!(content, csv);

        Ok(())
    }

    #[tokio::test]
    async fn test_sanitize_headers() -> anyhow::Result<()> {
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
        ];
        let sanitized = UpsertQueueCSVContent::sanitize_headers(headers)?;
        assert_eq!(
            sanitized,
            vec![
                "helloworld",
                "b_2fkls",
                "æuu_cool_",
                "_",
                "a",
                "c_d_",
                "_2",
                "__dust_id",
                "a_2",
                "col_9",
                "a_3"
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
            UpsertQueueCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        let rows = UpsertQueueCSVContent::csv_to_rows(rdr, delimiter).await?;

        assert_eq!(rows.len(), 2);

        // Test first row
        assert_eq!(rows[0].row_id, "0");
        let value = rows[0].value.as_object().unwrap();
        assert_eq!(value["hell_world"], 1.0);
        assert_eq!(value["super_fast"], 2.23);
        assert_eq!(value["c_foo"], 3.0);
        let date = value["date"].as_object().unwrap();
        assert_eq!(date["type"], "datetime");
        assert_eq!(date["epoch"], 1739545612380i64);
        assert_eq!(date["string_value"], "2025-02-14T15:06:52.380Z");

        // Test second row
        assert_eq!(rows[1].row_id, "1");
        let value = rows[1].value.as_object().unwrap();
        assert_eq!(value["hell_world"], 4.0);
        assert_eq!(value["super_fast"], "hello world");
        assert_eq!(value["c_foo"], 6.0);
        let date = value["date"].as_object().unwrap();
        assert_eq!(date["type"], "datetime");
        assert_eq!(date["epoch"], 1739545834000i64);
        assert_eq!(date["string_value"], "Fri, 14 Feb 2025 15:10:34 GMT");

        let csv = "__dust_id,super-fast,c/foo,DATE\n\
                   MYID1,2.23,3,2025-02-14T15:06:52.380Z\n\
                   MYID2,hello world,6,\"Fri, 14 Feb 2025 15:10:34 GMT\"";
        let (delimiter, rdr) =
            UpsertQueueCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        let rows = UpsertQueueCSVContent::csv_to_rows(rdr, delimiter).await?;

        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].row_id, "MYID1");
        assert_eq!(rows[1].row_id, "MYID2");

        Ok(())
    }

    #[tokio::test]
    async fn test_csv_errors() -> anyhow::Result<()> {
        // Test empty CSV
        let csv = "";
        let (delimiter, rdr) =
            UpsertQueueCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        assert!(UpsertQueueCSVContent::csv_to_rows(rdr, delimiter)
            .await
            .is_err());

        // Test CSV with only headers
        let csv = "header1,header2";
        let (delimiter, rdr) =
            UpsertQueueCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        let rows = UpsertQueueCSVContent::csv_to_rows(rdr, delimiter).await?;
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
            UpsertQueueCSVContent::find_delimiter(std::io::Cursor::new(csv)).await?;
        assert!(UpsertQueueCSVContent::csv_to_rows(rdr, delimiter)
            .await
            .is_err());

        Ok(())
    }
}
