use crate::data_sources::data_source::Section;
use crate::providers::embedder::Embedder;
use crate::providers::provider::{provider, ProviderID};
use crate::run::Credentials;
use crate::utils::ParseError;
use anyhow::{anyhow, Result};
use async_recursion::async_recursion;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::{cmp, str::FromStr};
use tokio::try_join;

#[derive(Debug, Clone)]
pub struct TokenizedText {
    pub text: String,
    pub tokens: Vec<usize>,
}

impl TokenizedText {
    pub async fn from(
        embedder: &Box<dyn Embedder + Sync + Send>,
        text: Option<&String>,
    ) -> Result<Option<Self>> {
        match text {
            Some(text) => {
                let tokens = embedder.encode(text).await?;
                Ok(Some(TokenizedText {
                    text: text.to_string(),
                    tokens,
                }))
            }
            None => Ok(None),
        }
    }
}

// This function tries to decode a chunk of token with allowance for utf8 encoding (possibly leaving
// a remainder if the chunk does not decode properly).
async fn decode_chunk_with_remainder(
    embedder: &Box<dyn Embedder + Sync + Send>,
    chunk: &[usize],
) -> Result<(String, Vec<usize>, Vec<usize>)> {
    // The maximum number of tokens to slide the window by when decoding fails.
    const MAX_ERROR_SLIDE: usize = 4;

    let mut end = chunk.len();

    while end > 0 {
        if chunk.len() - end > MAX_ERROR_SLIDE {
            return Err(anyhow!("Could not tokenize the provided document"));
        }
        match embedder.decode(chunk[0..end].to_vec()).await {
            Ok(decoded_string) => {
                return Ok((
                    decoded_string,
                    chunk[0..end].to_vec(),
                    chunk[end..].to_vec(),
                ));
            }
            Err(_) => {
                end -= 1;
                continue;
            }
        }
    }

    return Err(anyhow!("Could not tokenize the provided document."));
}

// This function splits text into chunks of at most `max_chunk_size`` tokens, returning the splitted
// strings and associated tokens.
async fn split_text(
    embedder: &Box<dyn Embedder + Sync + Send>,
    max_chunk_size: usize,
    text: &str,
) -> Result<Vec<TokenizedText>> {
    let mut encoded = embedder.encode(text).await?;

    // Construct valid decoded chunks.
    let mut splits: Vec<TokenizedText> = vec![];

    while encoded.len() > 0 {
        let mut current_chunk_size = cmp::min(max_chunk_size, encoded.len());
        let tokenized_chunk = &encoded[0..current_chunk_size];

        match decode_chunk_with_remainder(&embedder, tokenized_chunk).await {
            Ok((decoded, chunk, remainder)) => {
                current_chunk_size = current_chunk_size - remainder.len();
                splits.push(TokenizedText {
                    text: decoded,
                    tokens: chunk,
                });
            }
            Err(e) => {
                return Err(e);
            }
        }
        if current_chunk_size <= 0 {
            return Err(anyhow!("Could not tokenize the provided document"));
        }
        encoded = encoded[current_chunk_size..].to_vec();
    }

    Ok(splits)
}

/// TokenizedSection represents a section tree where each node contains the tokenized prefix and
/// tokenized content of the section.
///
/// As a remainder prefixes are propagated to childrens during chunking.
///
/// During the construction of the tokenized tree, we also enforce that all content + inherihted
/// prefix hold in max_chunk_size. When that's not the case, we split the content and add childrens
/// to the node (without prefix of their own since these splits don't induce new prefixes and will
/// inherit of the current node).
///
/// Invariants:
/// - All content + inherited prefixes hold in `max_chunk_size``.
/// - DFS traversal reconstructs the orginal document.
///
/// Once this tree is constructed we can traverse it doing a DFS and accumulate as much as possible
/// in each chunk. We store on each section all its parents prefixes. This will be used when
/// generating the final chunks.
#[derive(Debug, Clone)]
pub struct TokenizedSection {
    pub prefixes: Vec<TokenizedText>,
    // pub prefix: Option<TokenizedText>,
    pub content: Option<TokenizedText>,
    pub sections: Vec<TokenizedSection>,
}

impl TokenizedSection {
    #[async_recursion]
    pub async fn from(
        embedder: &Box<dyn Embedder + Sync + Send>,
        max_chunk_size: usize,
        mut prefixes: Vec<TokenizedText>,
        section: &Section,
    ) -> Result<Self> {
        let (prefix, mut content) = try_join!(
            TokenizedText::from(embedder, section.prefix.as_ref()),
            TokenizedText::from(embedder, section.content.as_ref())
        )?;

        // Add the new prefix to the list of prefixes to be passed down children.
        match prefix.as_ref() {
            Some(prefix) => {
                prefixes.push(prefix.clone());
            }
            None => (),
        };

        let prefixes_tokens_count = prefixes.iter().map(|p| p.tokens.len()).sum::<usize>();
        if prefixes_tokens_count >= max_chunk_size / 2 {
            Err(anyhow!(
                "Could not tokenize the provided document,
                 prefixes acrrue to more than half `max_chunk_size`"
            ))?;
        }

        let mut sections: Vec<TokenizedSection> = vec![];

        // Create new children for content if content overflows max_chunk_size.
        if let Some(c) = content.as_ref() {
            let effective_max_chunk_size = max_chunk_size - prefixes_tokens_count;

            if c.tokens.len() > effective_max_chunk_size {
                let splits = split_text(&embedder, effective_max_chunk_size, &c.text).await?;

                // Prepend to childrens the splits of the content with no additional prefixes (they
                // will inherit the current section prefixes whose content will be removed).
                sections.extend(
                    splits
                        .into_iter()
                        .map(|t| TokenizedSection {
                            prefixes: prefixes.clone(),
                            content: Some(t),
                            sections: vec![],
                        })
                        .collect::<Vec<_>>(),
                );

                // Remove the content from the current section.
                content = None;
            }
        }

        sections.extend(
            futures::future::join_all(
                section
                    .sections
                    .iter()
                    .map(|s| TokenizedSection::from(embedder, max_chunk_size, prefixes.clone(), s)),
            )
            .await
            .into_iter()
            .collect::<Result<Vec<_>>>()?,
        );

        Ok(TokenizedSection {
            prefixes,
            content,
            sections,
        })
    }

    /// Generate the chunk induced by sublist of DFS traversal sections. We add prefixes if we've
    /// never seen them only which leads to the exact reconstruction of the original document.
    fn chunk_from_sections(&self, sections: Vec<&Self>) -> TokenizedText {
        let mut seen_prefixes: HashSet<String> = HashSet::new();
        let mut text = String::new();
        let mut tokens: Vec<usize> = vec![];

        sections.iter().for_each(|s| {
            s.prefixes.iter().for_each(|p| {
                if !seen_prefixes.contains(&p.text) {
                    tokens.extend(p.tokens.clone());
                    text += &p.text;
                    seen_prefixes.insert(p.text.clone());
                }
            });

            match s.content.as_ref() {
                Some(c) => {
                    tokens.extend(c.tokens.clone());
                    text += &c.text;
                }
                None => (),
            };
        });

        TokenizedText { text, tokens }
    }

    fn tokens_count_from_sections(sections: Vec<&Self>) -> usize {
        let mut seen_prefixes: HashSet<String> = HashSet::new();
        let mut tokens_count: usize = 0;

        sections.iter().for_each(|s| {
            s.prefixes.iter().for_each(|p| {
                if !seen_prefixes.contains(&p.text) {
                    tokens_count += p.tokens.len();
                    seen_prefixes.insert(p.text.clone());
                }
            });
            match s.content.as_ref() {
                Some(c) => {
                    tokens_count += c.tokens.len();
                }
                None => (),
            };
        });

        tokens_count
    }

    /// DFS traversal of the TokenizedSection tree to generate a vector.
    fn dfs(&self) -> Vec<&Self> {
        let mut res = vec![self];
        for section in &self.sections {
            res.extend(section.dfs());
        }
        res
    }

    /// This function traverses the tree (using DFS) and generates chunks of at most
    /// `max_chunk_size` tokens.
    pub fn chunks(&self, max_chunk_size: usize) -> Vec<TokenizedText> {
        let mut chunk: Vec<&Self> = vec![];
        let mut chunks: Vec<TokenizedText> = vec![];

        for s in self.dfs() {
            let mut attempt = chunk.clone();
            attempt.push(s);

            if Self::tokens_count_from_sections(attempt) <= max_chunk_size {
                chunk.push(s);
            } else {
                chunks.push(self.chunk_from_sections(chunk.clone()));
                chunk = vec![s];
            }
        }
        if chunk.len() > 0 {
            chunks.push(self.chunk_from_sections(chunk.clone()));
        }

        chunks
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SplitterID {
    BaseV0,
}

impl ToString for SplitterID {
    fn to_string(&self) -> String {
        match self {
            SplitterID::BaseV0 => String::from("base_v0"),
        }
    }
}

impl FromStr for SplitterID {
    type Err = ParseError;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "base_v0" => Ok(SplitterID::BaseV0),
            _ => Err(ParseError::with_message(
                "Unknown splitter ID (possible values: base_v0)",
            ))?,
        }
    }
}

#[async_trait]
pub trait Splitter {
    fn id(&self) -> SplitterID;

    async fn split(
        &self,
        credentials: Credentials,
        provider_id: ProviderID,
        model_id: &str,
        max_chunk_size: usize,
        sections: Section,
    ) -> Result<Vec<String>>;
}

pub fn splitter(s: SplitterID) -> Box<dyn Splitter + Sync + Send> {
    match s {
        SplitterID::BaseV0 => Box::new(BaseV0Splitter::new()),
    }
}

pub struct BaseV0Splitter {}

impl BaseV0Splitter {
    pub fn new() -> Self {
        BaseV0Splitter {}
    }
}

#[async_trait]
impl Splitter for BaseV0Splitter {
    fn id(&self) -> SplitterID {
        SplitterID::BaseV0
    }

    async fn split(
        &self,
        credentials: Credentials,
        provider_id: ProviderID,
        model_id: &str,
        max_chunk_size: usize,
        section: Section,
    ) -> Result<Vec<String>> {
        let mut embedder = provider(provider_id).embedder(model_id.to_string());
        embedder.initialize(credentials).await?;

        let tokenized_section =
            TokenizedSection::from(&embedder, max_chunk_size, vec![], &section).await?;

        Ok(tokenized_section
            .chunks(max_chunk_size)
            .into_iter()
            .map(|t| t.text)
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use anyhow::Ok;

    use super::*;

    async fn test_splitter_v0(
        input: &String,
        max_chunk_size: usize,
        splits_count: usize,
    ) -> Result<()> {
        let provider_id = ProviderID::OpenAI;
        let model_id = "text-embedding-ada-002";

        let credentials = Credentials::from([("OPENAI_API_KEY".to_string(), "abc".to_string())]);

        let text = input;
        let splitted = splitter(SplitterID::BaseV0)
            .split(
                credentials,
                provider_id,
                model_id,
                max_chunk_size,
                Section {
                    prefix: None,
                    content: Some(text.to_string()),
                    sections: vec![],
                },
            )
            .await?;

        assert_eq!(&splitted.join(""), input);
        assert_eq!(splitted.len(), splits_count);
        Ok(())
    }
    #[tokio::test]
    async fn test_splitter_one_utf8_char_maps_to_multiple_tokens() {
        let max_chunk_size: usize = 4;

        // A single '🔥' emoji gets tokenized as : [9468, 242, 98].
        // So the string '🔥🔥' gets tokenized as : [9468, 242, 98, 9468, 242, 98]
        // With max_chunk_size=4, we end up with two chunks : [9468, 242, 98, 9468] and [242, 98].
        // Without proper handling, the decoding of the first chunk would fail because the token
        // "9468" alone is incomplete.
        // We test that the splitter() function is properly handling this case.
        let input = "🔥🔥".to_string();

        test_splitter_v0(&input, max_chunk_size, 2).await.unwrap();
    }

    #[tokio::test]
    async fn test_splitter_v0_basic_text() {
        let cases: [(String, usize); 2] = [
            (
                "a random document string with no double space".repeat(10),
                10,
            ),
            (
                "a  random  document \nstring WITH double spaces".repeat(8),
                10,
            ),
        ];

        let max_chunk_size = 8;

        for (case, splits_count) in cases {
            test_splitter_v0(&case, max_chunk_size, splits_count)
                .await
                .unwrap();
        }
    }

    #[tokio::test]
    async fn test_splitter_v0_sections_normal() {
        let section = Section {
            prefix: Some("# title\n".to_string()),
            content: Some("A line.\nAnother line.\n".to_string()),
            sections: vec![
                Section {
                    prefix: Some("# p1\n".to_string()),
                    content: Some("A paragraph\nAnother paragraph.\n".to_string()),
                    sections: vec![],
                },
                Section {
                    prefix: Some("# p2 alone\n".to_string()),
                    content: None,
                    sections: vec![],
                },
            ],
        };

        let provider_id = ProviderID::OpenAI;
        let model_id = "text-embedding-ada-002";
        let credentials = Credentials::from([("OPENAI_API_KEY".to_string(), "abc".to_string())]);

        let splitted = splitter(SplitterID::BaseV0)
            .split(credentials, provider_id, model_id, 18, section)
            .await
            .unwrap();

        assert_eq!(
            splitted.join("|"),
            vec![
                "# title\nA line.\nAnother line.\n".to_string(),
                "# title\n# p1\nA paragraph\nAnother paragraph.\n# p2 alone\n".to_string()
            ]
            .join("|")
        )
    }

    #[tokio::test]
    async fn test_splitter_v0_sections() {
        let section = Section {
            prefix: Some("p".to_string()),
            content: Some("c..".to_string()),
            sections: vec![
                Section {
                    prefix: Some("p0".to_string()),
                    content: Some("c0........".to_string()),
                    sections: vec![
                        Section {
                            prefix: None,
                            content: Some("c01......".to_string()),
                            sections: vec![],
                        },
                        Section {
                            prefix: Some("p02".to_string()),
                            content: Some("c02....".to_string()),
                            sections: vec![],
                        },
                    ],
                },
                Section {
                    prefix: Some("p1".to_string()),
                    content: Some("c1".to_string()),
                    sections: vec![Section {
                        prefix: Some("p10".to_string()),
                        content: Some("c10........".to_string()),
                        sections: vec![],
                    }],
                },
            ],
        };

        let provider_id = ProviderID::OpenAI;
        let model_id = "text-embedding-ada-002";
        let credentials = Credentials::from([("OPENAI_API_KEY".to_string(), "abc".to_string())]);

        let splitted = splitter(SplitterID::BaseV0)
            .split(credentials, provider_id, model_id, 12, section)
            .await
            .unwrap();

        assert_eq!(
            splitted.join("|"),
            vec![
                "pc..p0c0........c01......".to_string(),
                "pp0p02c02....p1c1".to_string(), // notice p1c1 rendered here
                "pp1p10c10........".to_string(), // with p and p1 repeated in that chunk
            ]
            .join("|")
        )
    }

    #[tokio::test]
    async fn test_splitter_v0_sections_do_not_skip_no_content() {
        let section = Section {
            prefix: Some("p".to_string()),
            content: Some("c..".to_string()),
            sections: vec![
                Section {
                    prefix: Some("p0".to_string()),
                    content: Some("c0........".to_string()),
                    sections: vec![
                        Section {
                            prefix: None,
                            content: Some("c01......".to_string()),
                            sections: vec![],
                        },
                        Section {
                            prefix: Some("p02".to_string()),
                            content: Some("c02....".to_string()),
                            sections: vec![],
                        },
                    ],
                },
                Section {
                    prefix: Some("p1".to_string()),
                    content: None,
                    sections: vec![Section {
                        prefix: Some("p10".to_string()),
                        content: Some("c10........".to_string()),
                        sections: vec![],
                    }],
                },
            ],
        };

        let provider_id = ProviderID::OpenAI;
        let model_id = "text-embedding-ada-002";
        let credentials = Credentials::from([("OPENAI_API_KEY".to_string(), "abc".to_string())]);

        let splitted = splitter(SplitterID::BaseV0)
            .split(credentials, provider_id, model_id, 12, section)
            .await
            .unwrap();

        assert_eq!(
            splitted.join("|"),
            vec![
                "pc..p0c0........c01......".to_string(),
                "pp0p02c02....p1".to_string(), // p1 has no content but is taken here
                "pp1p10c10........".to_string(),
            ]
            .join("|")
        )
    }

    #[tokio::test]
    async fn test_splitter_v0_sections_long_content() {
        let section = Section {
            prefix: Some("p".to_string()),
            content: Some("c..".to_string()),
            sections: vec![
                Section {
                    prefix: Some("p0".to_string()),
                    content: Some(
                        "c0........+-+-+-+-+-+-+-+-+-+-+-+-+-++-+-+-+-+-+-++-+-+-+-+-+-+-\
                         +-+-+-+-+-+-+-+-+-+-+-+-+-++-+-+-+-+-+-++-+-+-+-+-+-+-"
                            .to_string(),
                    ),
                    sections: vec![
                        Section {
                            prefix: None,
                            content: Some("c01......".to_string()),
                            sections: vec![],
                        },
                        Section {
                            prefix: Some("p02".to_string()),
                            content: Some("c02....".to_string()),
                            sections: vec![],
                        },
                    ],
                },
                Section {
                    prefix: Some("p1".to_string()),
                    content: Some("c1".to_string()),
                    sections: vec![Section {
                        prefix: Some("p10".to_string()),
                        content: Some("c10........".to_string()),
                        sections: vec![],
                    }],
                },
            ],
        };

        let provider_id = ProviderID::OpenAI;
        let model_id = "text-embedding-ada-002";
        let credentials = Credentials::from([("OPENAI_API_KEY".to_string(), "abc".to_string())]);

        let splitted = splitter(SplitterID::BaseV0)
            .split(credentials, provider_id, model_id, 12, section)
            .await
            .unwrap();

        assert_eq!(
            splitted.join("|"),
            vec![
                "pc..p0".to_string(),
                "pp0c0........+-+-+-+-+-+-+-+-+-+-+-+-+-++-+-+-+-+-".to_string(),
                "pp0+-++-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-++-".to_string(),
                "pp0+-+-+-+-+-++-+-+-+-+-+-+-c01......".to_string(),
                "pp0p02c02....p1c1".to_string(),
                "pp1p10c10........".to_string(),
            ]
            .join("|")
        )
    }
}
