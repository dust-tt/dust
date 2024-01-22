use crate::data_sources::data_source::Section;
use crate::providers::embedder::Embedder;
use crate::providers::provider::{provider, ProviderID};
use crate::run::Credentials;
use crate::utils::{self, ParseError};
use anyhow::{anyhow, Result};
use async_recursion::async_recursion;
use async_trait::async_trait;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fmt;
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

impl fmt::Display for TokenizedText {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "TokText: {} ({} tokens)", self.text, self.tokens.len())
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

    // We attempt to split in a balanced manner to avoid trailing samll chunks.
    let target_chunk_size = encoded.len() / (encoded.len() / max_chunk_size + 1);

    while encoded.len() > 0 {
        let mut current_chunk_size = cmp::min(target_chunk_size, encoded.len());
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
/// During the construction of the tokenized tree, we also enforce that all content + inherited
/// prefix hold in max_chunk_size. When that's not the case, we split the content and add childrens
/// to the node (without prefix of their own since these splits don't induce new prefixes and will
/// inherit of the current node). We also dissociate content from the node as a children if the node
/// has both a prefix and a content.
///
/// Invariants:
/// - All content + inherited prefixes hold in `max_chunk_size`.
/// - All TokenizedSection with content are materialied as leaf nodes.
/// - DFS traversal maintains the order and structure of the orginal document (see `fn chunk`).
/// - A node tokens_count is the token count to render the entire node (with prefixes).
///
/// Once this tree is constructed we can create chunks grouped by subtrees that hold inside the
/// `max_chunk_size` limit (see `fn chunks`).
#[derive(Debug, Clone)]
pub struct TokenizedSection {
    pub max_chunk_size: usize,
    pub prefixes: Vec<(String, TokenizedText)>,
    pub tokens_count: usize,
    pub content: Option<TokenizedText>,
    pub sections: Vec<TokenizedSection>,
}

impl fmt::Display for TokenizedSection {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        let prefixes = self
            .prefixes
            .iter()
            .map(|(_, tokenized_text)| tokenized_text.to_string())
            .collect::<Vec<String>>()
            .join(", ");
        let sections = self
            .sections
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<String>>()
            .join(", ");
        let content = match self.content.as_ref() {
            Some(c) => c.to_string(),
            None => "None".to_string(),
        };
        write!(
            f,
            "TSection: {{ prefixes: [{}],\n content: {},\n sections: [{}] }}\n",
            prefixes, content, sections
        )
    }
}

impl TokenizedSection {
    #[async_recursion]
    pub async fn from(
        embedder: &Box<dyn Embedder + Sync + Send>,
        max_chunk_size: usize,
        mut prefixes: Vec<(String, TokenizedText)>,
        section: &Section,
        path: Option<String>,
    ) -> Result<Self> {
        let path = match path.as_ref() {
            Some(p) => p,
            None => "",
        };

        let (prefix, mut content) = try_join!(
            TokenizedText::from(embedder, section.prefix.as_ref()),
            TokenizedText::from(embedder, section.content.as_ref())
        )?;

        // Add the new prefix to the list of prefixes to be passed down children.
        match prefix.as_ref() {
            Some(prefix) => {
                prefixes.push((path.to_string(), prefix.clone()));
            }
            None => (),
        };

        let prefixes_tokens_count = prefixes.iter().map(|(_, p)| p.tokens.len()).sum::<usize>();
        if prefixes_tokens_count >= max_chunk_size / 2 {
            Err(anyhow!(
                "Could not tokenize the provided document,
                 prefixes accrue to more than half `max_chunk_size`"
            ))?;
        }

        let mut sections: Vec<TokenizedSection> = vec![];

        // Create new children for content if the section already has children or has a prefix, to
        // enforce the invariant that content nodes are leaf nodes and don't have prefix (see
        // tokens_count calculation at the end of this method). Even if there are no children, but
        // content overflows max_chunk_size, we split in multiple nodes to enforce the invariant
        // that any content node fit in a `max_chunk_size`.
        if let Some(c) = content.as_ref() {
            if (c.tokens.len() + prefixes_tokens_count) > max_chunk_size
                || !section.sections.is_empty()
                || prefix.is_some()
            {
                let effective_max_chunk_size = max_chunk_size - prefixes_tokens_count;

                let splits = match c.tokens.len() > effective_max_chunk_size {
                    true => split_text(&embedder, effective_max_chunk_size, &c.text).await?,
                    false => vec![c.clone()],
                };

                // Prepend to childrens the splits of the content with no additional prefixes (they
                // will inherit the current section prefixes whose content will be removed).
                sections.extend(
                    splits
                        .into_iter()
                        .map(|t| TokenizedSection {
                            max_chunk_size,
                            prefixes: prefixes.clone(),
                            tokens_count: prefixes_tokens_count + t.tokens.len(),
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
            futures::future::join_all(section.sections.iter().enumerate().map(|(i, s)| {
                TokenizedSection::from(
                    embedder,
                    max_chunk_size,
                    prefixes.clone(),
                    s,
                    Some(format!("{}/{}", path, i)),
                )
            }))
            .await
            .into_iter()
            .collect::<Result<Vec<_>>>()?,
        );

        Ok(TokenizedSection {
            max_chunk_size,
            prefixes,
            // The tokens_count is `prefixes_tokens_count` to which we add:
            // - (for content leaf nodes) the sum of the content tokens
            // OR
            // - (for non content nodes) the tokens_count of the childrens to which we remove
            // childrens times the `prefixes_tokens_count` as they would not be repeated in children
            // if we were to reconstruct that node as a full chunk
            tokens_count: prefixes_tokens_count
                + match content.as_ref() {
                    Some(c) => {
                        assert!(sections.is_empty());
                        c.tokens.len()
                    }
                    None => {
                        sections.iter().map(|s| s.tokens_count).sum::<usize>()
                            - sections.len() * prefixes_tokens_count
                    }
                },
            content,
            sections,
        })
    }

    /// DFS traversal of the TokenizedSection tree to generate a vector.
    fn dfs(&self) -> Vec<&Self> {
        let mut res = vec![self];
        for section in &self.sections {
            res.extend(section.dfs());
        }
        res
    }

    fn size(&self) -> usize {
        return self.dfs().len();
    }

    /// This function materialize a chunk from a TokenizedSection node.
    fn chunk(&self) -> TokenizedText {
        let mut seen_prefixes: HashSet<String> = HashSet::new();
        let mut text = String::new();
        let mut tokens: Vec<usize> = vec![];

        for s in self.dfs() {
            s.prefixes.iter().for_each(|(h, p)| {
                if !seen_prefixes.contains(h) {
                    seen_prefixes.insert(h.clone());
                    tokens.extend(p.tokens.clone());
                    text += &p.text;
                }
            });

            match s.content.as_ref() {
                Some(c) => {
                    tokens.extend(c.tokens.clone());
                    text += &c.text;
                }
                None => (),
            };
        }

        TokenizedText { text, tokens }
    }

    fn chunks(self) -> Vec<TokenizedText> {
        match self.tokens_count <= self.max_chunk_size {
            // If the current node holds within `max_chunk_size` tokens, we have a chunk.
            true => {
                let c = self.chunk();
                assert_eq!(c.tokens.len(), self.tokens_count);
                assert!(c.tokens.len() <= self.max_chunk_size);
                vec![c]
            }
            false => {
                // This is the non-fancy implementation.
                // self.sections
                //     .iter()
                //     .map(|s| s.chunks())
                //     .flatten()
                //     .collect::<Vec<_>>()

                // This is the fancy implementation. Instead of splitting and recursing, we grow a
                // selection of nodes if they are below the `max_chunk_size` and generate a chunk
                // from them when needed (a new node grows the selection above `max_chunk_size` or a
                // node is simply above `max_chunk_size` itself).

                let mut results: Vec<TokenizedText> = vec![];

                let max_chunk_size = self.max_chunk_size;
                let prefixes = self.prefixes.clone();
                assert!(self.content.is_none());

                let prefixes_tokens_count = self
                    .prefixes
                    .iter()
                    .map(|(_, p)| p.tokens.len())
                    .sum::<usize>();

                let mut selection: Vec<TokenizedSection> = vec![];
                let mut selection_tokens_count: usize = prefixes_tokens_count;

                // Define closure to flush the current selection
                let flush_selection =
                    |selection: &mut Vec<TokenizedSection>,
                     selection_tokens_count: &mut usize,
                     results: &mut Vec<TokenizedText>| {
                        if !selection.is_empty() {
                            results.extend(
                                TokenizedSection {
                                    max_chunk_size,
                                    prefixes: prefixes.clone(),
                                    tokens_count: *selection_tokens_count,
                                    content: None,
                                    sections: selection.drain(..).collect(),
                                }
                                .chunks(),
                            );
                            *selection_tokens_count = prefixes_tokens_count;
                        }
                    };

                for s in self.sections {
                    if s.tokens_count > max_chunk_size {
                        // If the node is above max_chunk_size we flush the current selection and
                        // recurse into it, it will get splitted and can't be merged with anyone
                        // else.
                        flush_selection(&mut selection, &mut selection_tokens_count, &mut results);
                        results.extend(s.chunks());
                    } else {
                        if selection_tokens_count + s.tokens_count - prefixes_tokens_count
                            <= self.max_chunk_size
                        {
                            // The current node can be added to the current selection.
                            selection_tokens_count += s.tokens_count - prefixes_tokens_count;
                            selection.push(s);
                        } else {
                            // The node can't be added so we flush the current selection and make
                            // that node the new selection.
                            flush_selection(
                                &mut selection,
                                &mut selection_tokens_count,
                                &mut results,
                            );
                            selection_tokens_count += s.tokens_count - prefixes_tokens_count;
                            selection.push(s);
                        }
                    }
                }
                // Finally if the selection is not empty we flush it.
                flush_selection(&mut selection, &mut selection_tokens_count, &mut results);

                results
            }
        }
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

        let mut now = utils::now();

        let tokenized_section =
            TokenizedSection::from(&embedder, max_chunk_size, vec![], &section, None).await?;

        utils::info(&format!(
            "Splitter: tokenized_section_tree_size={} duration={}",
            tokenized_section.size(),
            utils::now() - now
        ));

        now = utils::now();

        // We filter out whitespace only or empty strings which is possible to obtain if the section
        // passed have empty or whitespace only content.
        let chunks: Vec<String> = tokenized_section
            .chunks()
            .into_iter()
            .filter(|t| t.text.trim().len() > 0)
            .map(|t| t.text)
            .collect();

        utils::info(&format!(
            "Splitter: chunks_count={} duration={}",
            chunks.len(),
            utils::now() - now
        ));

        Ok(chunks)
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
                12,
            ),
            (
                "a  random  document \nstring WITH double spaces".repeat(8),
                12,
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
                "pc..".to_string(),
                "pp0c0........c01......".to_string(),
                "pp0p02c02....".to_string(),
                "pp1c1p10c10........".to_string(),
            ]
            .join("|")
        )
    }

    #[tokio::test]
    async fn test_splitter_v0_sections_variant() {
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
                "pc..".to_string(),
                "pp0c0........c01......".to_string(),
                "pp0p02c02....".to_string(),
                "pp1p10c10........".to_string(),
            ]
            .join("|")
        )
    }

    #[tokio::test]
    async fn test_splitter_v0_sections_no_content() {
        let section = Section {
            prefix: Some("p".to_string()),
            content: None,
            sections: vec![
                Section {
                    prefix: Some("p0".to_string()),
                    content: None,
                    sections: vec![
                        Section {
                            prefix: Some("p01".to_string()),
                            content: None,
                            sections: vec![],
                        },
                        Section {
                            prefix: Some("p02".to_string()),
                            content: None,
                            sections: vec![],
                        },
                    ],
                },
                Section {
                    prefix: Some("p1".to_string()),
                    content: None,
                    sections: vec![Section {
                        prefix: Some("p10".to_string()),
                        content: None,
                        sections: vec![],
                    }],
                },
                Section {
                    prefix: Some("p2".to_string()),
                    content: None,
                    sections: vec![
                        Section {
                            prefix: Some("p21".to_string()),
                            content: None,
                            sections: vec![],
                        },
                        Section {
                            prefix: Some("p22".to_string()),
                            content: None,
                            sections: vec![],
                        },
                    ],
                },
                Section {
                    prefix: Some("p3".to_string()),
                    content: None,
                    sections: vec![Section {
                        prefix: Some("p30".to_string()),
                        content: None,
                        sections: vec![],
                    }],
                },
                Section {
                    prefix: Some("p4".to_string()),
                    content: None,
                    sections: vec![Section {
                        prefix: Some("p40".to_string()),
                        content: None,
                        sections: vec![],
                    }],
                },
                Section {
                    prefix: Some("p5".to_string()),
                    content: None,
                    sections: vec![Section {
                        prefix: Some("p50".to_string()),
                        content: None,
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
                "pp0p01p02p1p10".to_string(),
                "pp2p21p22p3p30".to_string(),
                "pp4p40p5p50".to_string()
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
                "pc..".to_string(),
                "pp0c0........+-+-+-+-+-+-+-+-+-+-+-+-+-++-".to_string(),
                "pp0+-+-+-+-+-++-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-".to_string(),
                "pp0++-+-+-+-+-+-++-+-+-+-+-+-+-".to_string(),
                "pp0c01......p02c02....".to_string(),
                "pp1c1p10c10........".to_string(),
            ]
            .join("|")
        )
    }

    #[tokio::test]
    async fn test_splitter_v0_unaligned_content() {
        let section = Section {
            prefix: None,
            content: Some("asdjqweiozclknasidjhqlkdnaljch\n".to_string()),
            sections: vec![],
        };

        let provider_id = ProviderID::OpenAI;
        let model_id = "text-embedding-ada-002";
        let credentials = Credentials::from([("OPENAI_API_KEY".to_string(), "abc".to_string())]);

        let splitted = splitter(SplitterID::BaseV0)
            .split(credentials, provider_id, model_id, 8, section)
            .await
            .unwrap();

        assert_eq!(
            splitted.join("|"),
            vec![
                "asdjqweioz".to_string(),
                "clknasidjh".to_string(),
                "qlkdnaljch\n".to_string(),
            ]
            .join("|")
        )
    }

    #[tokio::test]
    async fn test_splitter_v0_bug_20231201() {
        let section = Section {
            prefix: Some(
                "Thread in #brand [20230908 10:16]: Should we make a poster?...\n".to_string(),
            ),
            content: None,
            sections: vec![
                Section {
                    prefix: Some(">> @ed [20230908 10:16]:\n".to_string()),
                    content: Some("Should we make a poster?\n".to_string()),
                    sections: vec![],
                },
                Section {
                    prefix: Some(">> @spolu [20230908 10:16]:\n".to_string()),
                    content: Some(":100:\n".to_string()),
                    sections: vec![],
                },
                Section {
                    prefix: Some(">> @spolu [20230908 10:16]:\n".to_string()),
                    content: Some("\"Factory\" :p\n".to_string()),
                    sections: vec![],
                },
            ],
        };

        let provider_id = ProviderID::OpenAI;
        let model_id = "text-embedding-ada-002";
        let credentials = Credentials::from([("OPENAI_API_KEY".to_string(), "abc".to_string())]);

        let splitted = splitter(SplitterID::BaseV0)
            .split(credentials, provider_id, model_id, 256, section)
            .await
            .unwrap();

        // Before the bug the second @spolu prefix would be skipped because we were doing string
        // matching vs prefix position matching.

        assert_eq!(
            splitted.join("|"),
            "Thread in #brand [20230908 10:16]: Should we make a poster?...\n\
             >> @ed [20230908 10:16]:\nShould we make a poster?\n\
             >> @spolu [20230908 10:16]:\n:100:\n\
             >> @spolu [20230908 10:16]:\n\"Factory\" :p\n"
        )
    }

    #[tokio::test]
    async fn test_splitter_bug_20240111() {
        // Splitting issue with a section with no prefix but with content and childrens.
        let section = Section {
            prefix: Some("Ok a prefix\n".to_string()),
            content: None,
            sections: vec![Section {
                prefix: None,
                content: Some(
                    "Then a section with no prefix, but content and children".to_string(),
                ),
                sections: vec![
                    Section {
                        prefix: Some("Prefix1".to_string()),
                        content: Some("Text1".to_string()),
                        sections: vec![],
                    },
                    Section {
                        prefix: Some("Prefix2".to_string()),
                        content: Some("Text2".to_string()),
                        sections: vec![],
                    },
                ],
            }],
        };

        let provider_id = ProviderID::OpenAI;
        let model_id = "text-embedding-ada-002";
        let credentials = Credentials::from([("OPENAI_API_KEY".to_string(), "abc".to_string())]);

        // Before the fix, this would fail (assertion failure in TokenizedSection.chunk).
        splitter(SplitterID::BaseV0)
            .split(credentials, provider_id, model_id, 256, section)
            .await
            .unwrap();
    }

    #[tokio::test]
    #[ignore] // ignored as it's high CPU
    async fn test_splitter_bug_20240112() {
        let bstr = "\t\t\t\t\t\t\r\n";
        let section = Section {
            prefix: None,
            content: bstr.repeat(8192).into(),
            sections: vec![],
        };

        let provider_id = ProviderID::OpenAI;
        let model_id = "text-embedding-ada-002";
        let credentials = Credentials::from([("OPENAI_API_KEY".to_string(), "abc".to_string())]);

        splitter(SplitterID::BaseV0)
            .split(credentials, provider_id, model_id, 256, section)
            .await
            .unwrap();
    }
}
