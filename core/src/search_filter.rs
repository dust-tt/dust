use anyhow::{anyhow, Result};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use std::collections::HashMap;

pub trait Filterable {
    fn match_filter(&self, filter: &Option<SearchFilter>) -> bool;
    fn get_timestamp(&self) -> u64;
    fn get_tags(&self) -> Vec<String>;
    fn get_parents(&self) -> Vec<String>;
}

/// A filter to apply to the search query based on `tags`. All documents returned must have at least
/// one tag in `is_in` and none of the tags in `is_not`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TagsFilter {
    #[serde(rename = "in")]
    pub is_in: Option<Vec<String>>,
    #[serde(rename = "not")]
    pub is_not: Option<Vec<String>>,
}

/// A filter to apply to the search query based on document parents. All documents returned must have at least
/// one parent in `is_in` and none of their parents in `is_not`. The `is_in_map` field allows to
/// sepecify parents per data_source_id.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ParentsFilter {
    #[serde(rename = "in")]
    pub is_in: Option<Vec<String>>,
    #[serde(rename = "in_map")]
    pub is_in_map: Option<HashMap<String, Vec<String>>>,
    #[serde(rename = "not")]
    pub is_not: Option<Vec<String>>,
}

/// A filter to apply to the search query based on `timestamp`. All documents returned must have a
/// timestamp greater than `gt` and less than `lt`.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TimestampFilter {
    pub gt: Option<i64>,
    pub lt: Option<i64>,
}

// Custom deserializer for `TimestampFilter`
fn deserialize_timestamp_filter<'de, D>(
    deserializer: D,
) -> Result<Option<TimestampFilter>, D::Error>
where
    D: Deserializer<'de>,
{
    #[derive(Deserialize)]
    struct InnerTimestampFilter {
        gt: Option<f64>,
        lt: Option<f64>,
    }

    let f = Option::<InnerTimestampFilter>::deserialize(deserializer)?.map(|inner_filter| {
        TimestampFilter {
            gt: inner_filter.gt.map(|value| value as i64), // Convert f64 to u64
            lt: inner_filter.lt.map(|value| value as i64), // Convert f64 to u64
        }
    });

    Ok(f)
}

/// Filter argument to perform semantic search or simple reverse-chron querying.
/// It is used to filter the search results based on the
/// presence of tags, parents, or time spans for timestamps.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchFilter {
    pub tags: Option<TagsFilter>,
    pub parents: Option<ParentsFilter>,
    #[serde(deserialize_with = "deserialize_timestamp_filter")]
    pub timestamp: Option<TimestampFilter>,
}

impl SearchFilter {
    pub fn from_json_str(json: &str) -> Result<Self> {
        let filter: SearchFilter = serde_json::from_str(json)?;
        Ok(filter)
    }

    pub fn from_json(json: &Value) -> Result<Self> {
        let filter: SearchFilter = serde_json::from_value(json.clone())?;
        Ok(filter)
    }

    // This function applies the passed SearchFilter to the current SearchFilter. Applying means
    // merging the tags, parents, filters arrays or overriding the timestamp values.
    pub fn apply(&mut self, other: &SearchFilter) -> () {
        match other.tags {
            None => (),
            Some(ref tags) => match &mut self.tags {
                None => self.tags = Some(tags.clone()),
                Some(ref mut self_tags) => {
                    match &tags.is_in {
                        None => (),
                        Some(ref is_in) => match &mut self_tags.is_in {
                            None => self_tags.is_in = Some(is_in.clone()),
                            Some(ref mut self_is_in) => {
                                self_is_in.extend(is_in.clone());
                            }
                        },
                    }
                    match &tags.is_not {
                        None => (),
                        Some(ref is_not) => match &mut self_tags.is_not {
                            None => self_tags.is_not = Some(is_not.clone()),
                            Some(ref mut self_is_not) => {
                                self_is_not.extend(is_not.clone());
                            }
                        },
                    }
                }
            },
        }

        match other.parents {
            None => (),
            Some(ref parents) => match &mut self.parents {
                None => self.parents = Some(parents.clone()),
                Some(ref mut self_parents) => {
                    match &parents.is_in {
                        None => (),
                        Some(ref is_in) => match &mut self_parents.is_in {
                            None => self_parents.is_in = Some(is_in.clone()),
                            Some(ref mut self_is_in) => {
                                self_is_in.extend(is_in.clone());
                            }
                        },
                    }
                    match &parents.is_in_map {
                        None => (),
                        Some(ref is_in_map) => match &mut self_parents.is_in_map {
                            None => self_parents.is_in_map = Some(is_in_map.clone()),
                            Some(ref mut self_is_in_map) => {
                                for (k, v) in is_in_map.iter() {
                                    match self_is_in_map.get_mut(k) {
                                        None => {
                                            self_is_in_map.insert(k.clone(), v.clone());
                                        }
                                        Some(ref mut self_v) => {
                                            self_v.extend(v.clone());
                                        }
                                    }
                                }
                            }
                        },
                    }
                    match &parents.is_not {
                        None => (),
                        Some(ref is_not) => match &mut self_parents.is_not {
                            None => self_parents.is_not = Some(is_not.clone()),
                            Some(ref mut self_is_not) => {
                                self_is_not.extend(is_not.clone());
                            }
                        },
                    }
                }
            },
        }

        match other.timestamp {
            None => (),
            Some(ref timestamp) => match &mut self.timestamp {
                None => self.timestamp = Some(timestamp.clone()),
                Some(ref mut self_timestamp) => {
                    match &timestamp.gt {
                        None => (),
                        Some(ref gt) => self_timestamp.gt = Some(gt.clone()),
                    }
                    match &timestamp.lt {
                        None => (),
                        Some(ref lt) => self_timestamp.lt = Some(lt.clone()),
                    }
                }
            },
        }
    }

    pub fn match_filter(&self, resource: &dyn Filterable) -> bool {
        let mut m = true;
        match &self.tags {
            Some(tags) => {
                m = m
                    && match &tags.is_in {
                        Some(is_in) => is_in.iter().any(|tag| resource.get_tags().contains(tag)),
                        None => true,
                    };
                m = m
                    && match &tags.is_not {
                        Some(is_not) => is_not.iter().all(|tag| !resource.get_tags().contains(tag)),
                        None => true,
                    };
            }
            None => (),
        }
        match &self.parents {
            Some(parents) => {
                m = m
                    && match &parents.is_in {
                        Some(is_in) => is_in
                            .iter()
                            .any(|parent| resource.get_parents().contains(parent)),
                        None => true,
                    };
                m = m
                    && match &parents.is_not {
                        Some(is_not) => is_not
                            .iter()
                            .all(|parent| !resource.get_parents().contains(parent)),
                        None => true,
                    };
            }
            None => (),
        }
        match &self.timestamp {
            Some(timestamp) => {
                m = m
                    && match timestamp.gt {
                        Some(gt) => resource.get_timestamp() as i64 >= gt,
                        None => true,
                    };
                m = m
                    && match timestamp.lt {
                        Some(lt) => resource.get_timestamp() as i64 <= lt,
                        None => true,
                    };
            }
            None => (),
        }
        m
    }

    // We postprocess `parents.is_in_map` if it is set to augment or set `parents.is_in` based on
    // the current `data_source_id`` and set `parents.is_in_map` to `None` since this is a virtual
    // filter that we never want to send to qdrant.
    pub fn postprocess_for_data_source(&self, data_source_id: &str) -> SearchFilter {
        let filter = SearchFilter {
            tags: self.tags.clone(),
            parents: match &self.parents {
                Some(parents) => {
                    let mut is_in: Option<Vec<String>> = None;

                    match &parents.is_in {
                        Some(v) => {
                            is_in = Some(v.clone());
                        }
                        None => (),
                    }

                    match &parents.is_in_map {
                        Some(h) => match h.get(data_source_id) {
                            Some(v) => match &mut is_in {
                                Some(is_in) => {
                                    is_in.extend(v.clone());
                                }
                                None => {
                                    is_in = Some(v.clone());
                                }
                            },
                            None => (),
                        },
                        None => (),
                    }

                    Some(ParentsFilter {
                        is_in,
                        is_in_map: None,
                        is_not: parents.is_not.clone(),
                    })
                }
                None => None,
            },
            timestamp: self.timestamp.clone(),
        };
        filter
    }

    pub fn ensure_postprocessed(&self) -> Result<()> {
        match &self.parents {
            Some(parents) => match &parents.is_in_map {
                Some(_) => Err(anyhow!(
                    "SearchFilter must be postprocessed before being used"
                )),
                None => Ok(()),
            },
            None => Ok(()),
        }
    }
}
