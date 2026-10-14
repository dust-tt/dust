use crate::rpc::{Attr, AttrBatch, AttrResult, ErrorDetails};

impl<E: Into<ErrorDetails>> FromIterator<Result<Attr, E>> for AttrBatch {
    fn from_iter<I: IntoIterator<Item = Result<Attr, E>>>(results: I) -> Self {
        let results = results
            .into_iter()
            .map(|result| match result {
                Ok(object) => AttrResult {
                    object: Some(object),
                    error: None,
                },
                Err(error) => AttrResult {
                    object: None,
                    error: Some(error.into()),
                },
            })
            .collect();
        Self { results }
    }
}
