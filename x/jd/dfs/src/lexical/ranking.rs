use anyhow::{Result, ensure};
use std::{cmp::Ordering, collections::BinaryHeap, ops::Range, time::Instant};
use tantivy::{
    DocAddress, DocId, Score, Searcher, SegmentReader, Term,
    query::{Bm25Weight, EnableScoring, Query, Weight},
    schema::IndexRecordOption,
};

struct Hit {
    score: Score,
    address: DocAddress,
}

impl PartialEq for Hit {
    fn eq(&self, other: &Self) -> bool {
        self.cmp(other) == Ordering::Equal
    }
}

impl Eq for Hit {}

impl PartialOrd for Hit {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for Hit {
    fn cmp(&self, other: &Self) -> Ordering {
        other
            .score
            .partial_cmp(&self.score)
            .expect("finite scores")
            .then(self.address.cmp(&other.address))
    }
}

struct PhraseBound {
    term: Term,
    weight: Bm25Weight,
}

impl PhraseBound {
    fn new(searcher: &Searcher, terms: &[Term], limit: usize) -> Result<Option<Self>> {
        let mut frequencies = terms
            .iter()
            .map(|term| Ok((searcher.doc_freq(term)?, term)))
            .collect::<tantivy::Result<Vec<_>>>()?;
        frequencies.sort_by_key(|(frequency, _)| *frequency);
        let Some((frequency, _)) = frequencies.first() else {
            return Ok(None);
        };
        if *frequency <= (limit * 4) as u64 {
            return Ok(None);
        }
        let mut anchors = Vec::new();
        for (_, term) in frequencies.iter().filter(|(count, _)| count == frequency) {
            let mut sample = u64::MAX;
            for reader in searcher.segment_readers() {
                if let Some(postings) = reader
                    .inverted_index(term.field())?
                    .read_block_postings(term, IndexRecordOption::WithFreqs)?
                    && postings.block_len() > 0
                {
                    sample = (0..postings.block_len())
                        .map(|position| u64::from(postings.freq(position)))
                        .sum::<u64>()
                        * 128
                        / postings.block_len() as u64;
                    break;
                }
            }
            anchors.push((sample, *term));
        }
        let (_, term) = anchors
            .into_iter()
            .min_by_key(|(sample, _)| *sample)
            .expect("phrase terms");
        Ok(Some(Self {
            term: term.clone(),
            weight: Bm25Weight::for_terms(searcher, terms)?,
        }))
    }

    fn collect(
        &self,
        reader: &SegmentReader,
        exact: &dyn Weight,
        mut threshold: Score,
        deadline: Instant,
        collect: &mut dyn FnMut(DocId, Score) -> Score,
    ) -> Result<()> {
        let Some(mut postings) = reader
            .inverted_index(self.term.field())?
            .read_block_postings(&self.term, IndexRecordOption::WithFreqs)?
        else {
            return Ok(());
        };
        let norms = reader.get_fieldnorms_reader(self.term.field())?;
        let mut scorer = exact.scorer(reader, 1.0)?;
        while postings.block_len() > 0 {
            ensure!(Instant::now() < deadline, "query deadline");
            if postings.block_max_score(&norms, &self.weight) > threshold {
                for position in 0..postings.block_len() {
                    let doc = postings.doc(position);
                    let upper_bound = self
                        .weight
                        .score(norms.fieldnorm_id(doc), postings.freq(position));
                    if upper_bound > threshold && scorer.doc() <= doc && scorer.seek(doc) == doc {
                        let score = scorer.score();
                        if score > threshold {
                            threshold = collect(doc, score);
                        }
                    }
                }
            }
            postings.advance();
        }
        Ok(())
    }
}

pub fn top_docs(
    searcher: &Searcher,
    query: &dyn Query,
    mut permitted: impl FnMut(u32) -> Result<bool>,
    range: Range<usize>,
    deadline: Instant,
    exact_phrase_terms: Option<&[Term]>,
    mut accepts: impl FnMut(DocAddress) -> Result<bool>,
) -> Result<Vec<(Score, DocAddress)>> {
    ensure!(
        range.start < range.end && range.end <= 10_100,
        "ranking bounds"
    );
    let weight = query.weight(EnableScoring::enabled_from_searcher(searcher))?;
    let phrase_bound = exact_phrase_terms
        .map(|terms| PhraseBound::new(searcher, terms, range.end))
        .transpose()?
        .flatten();
    let mut hits = BinaryHeap::<Hit>::with_capacity(range.end);
    let mut threshold = Score::MIN;
    for (ordinal, reader) in searcher.segment_readers().iter().enumerate() {
        ensure!(Instant::now() < deadline, "query deadline");
        let slots = reader.fast_fields().u64("slot")?;
        let mut failure = None;
        let initial_threshold = threshold;
        let mut collect = |doc, score: Score| {
            if failure.is_some() {
                return Score::MAX;
            }
            if Instant::now() >= deadline {
                failure = Some(anyhow::anyhow!("query deadline"));
                return Score::MAX;
            }
            if reader
                .alive_bitset()
                .is_some_and(|alive| alive.is_deleted(doc))
            {
                return threshold;
            }
            let Some(slot) = slots.first(doc).and_then(|slot| u32::try_from(slot).ok()) else {
                failure = Some(anyhow::anyhow!("missing or invalid document slot"));
                return Score::MAX;
            };
            match permitted(slot) {
                Ok(false) => return threshold,
                Err(error) => {
                    failure = Some(error);
                    return Score::MAX;
                }
                Ok(true) => {}
            }
            let address = DocAddress::new(ordinal as u32, doc);
            match accepts(address) {
                Ok(false) => return threshold,
                Err(error) => {
                    failure = Some(error);
                    return Score::MAX;
                }
                Ok(true) => {}
            }
            if !score.is_finite() {
                failure = Some(anyhow::anyhow!("invalid search score"));
                return Score::MAX;
            }
            let hit = Hit { score, address };
            if hits.len() < range.end {
                hits.push(hit);
            } else if hits.peek().is_some_and(|worst| hit < *worst) {
                *hits.peek_mut().expect("full ranking heap") = hit;
            }
            if hits.len() == range.end {
                threshold = hits.peek().expect("full ranking heap").score;
            }
            threshold
        };
        if let Some(bound) = &phrase_bound {
            bound.collect(
                reader,
                weight.as_ref(),
                initial_threshold,
                deadline,
                &mut collect,
            )?;
        } else {
            weight.for_each_pruning(initial_threshold, reader, &mut collect)?;
        }
        if let Some(error) = failure {
            return Err(error);
        }
    }
    ensure!(Instant::now() < deadline, "query deadline");
    Ok(hits
        .into_sorted_vec()
        .into_iter()
        .skip(range.start)
        .map(|hit| (hit.score, hit.address))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use roaring::RoaringBitmap;
    use std::time::Duration;
    use tantivy::{
        Index, TantivyDocument, Term,
        collector::{FilterCollector, TopDocs},
        doc,
        merge_policy::NoMergePolicy,
        query::{AllQuery, BooleanQuery, Occur, PhraseQuery, TermQuery},
        schema::{FAST, INDEXED, IndexRecordOption, STORED, Schema, TEXT, Value},
    };

    #[test]
    fn pruning_matches_native_filtered_top_k_with_deletes_ties_and_offsets() {
        let mut schema = Schema::builder();
        let slot = schema.add_u64_field("slot", FAST | INDEXED);
        let text = schema.add_text_field("text", TEXT | STORED);
        let index = Index::create_in_ram(schema.build());
        let mut writer = index.writer_with_num_threads(1, 20_000_000).unwrap();
        writer.set_merge_policy(Box::new(NoMergePolicy));
        for batch in 0..3 {
            for id in batch * 256..(batch + 1) * 256 {
                let body = format!(
                    "common common {} {} {}",
                    if id % 11 == 0 {
                        "common filler signal ".repeat(id % 5 + 1)
                    } else {
                        "common signal ".repeat(id % 5 + 1)
                    },
                    "filler ".repeat(id % 17),
                    if id % 7 == 0 {
                        "literalneedle"
                    } else {
                        "different"
                    }
                );
                writer
                    .add_document(doc!(slot => id as u64, text => body))
                    .unwrap();
            }
            writer.commit().unwrap();
        }
        for id in (0..768).step_by(23) {
            writer.delete_term(Term::from_field_u64(slot, id));
        }
        writer.commit().unwrap();
        let searcher = index.reader().unwrap().searcher();
        assert!(searcher.segment_readers().len() >= 3);
        let common = Term::from_field_text(text, "common");
        let signal = Term::from_field_text(text, "signal");
        assert_eq!(
            PhraseBound::new(&searcher, &[common, signal.clone()], 13)
                .unwrap()
                .unwrap()
                .term,
            signal
        );
        let term = || {
            Box::new(TermQuery::new(
                Term::from_field_text(text, "common"),
                IndexRecordOption::WithFreqs,
            )) as Box<dyn Query>
        };
        let queries: Vec<Box<dyn Query>> = vec![
            Box::new(AllQuery),
            term(),
            Box::new(PhraseQuery::new(vec![
                Term::from_field_text(text, "common"),
                Term::from_field_text(text, "signal"),
            ])),
            Box::new(BooleanQuery::new(vec![
                (Occur::Should, term()),
                (
                    Occur::Should,
                    Box::new(TermQuery::new(
                        Term::from_field_text(text, "filler"),
                        IndexRecordOption::WithFreqs,
                    )),
                ),
            ])),
        ];
        for query in queries.into_iter().chain([
            Box::new(PhraseQuery::new_with_offset(vec![
                (0, Term::from_field_text(text, "common")),
                (2, Term::from_field_text(text, "signal")),
            ])) as Box<dyn Query>,
            Box::new(PhraseQuery::new(vec![
                Term::from_field_text(text, "common"),
                Term::from_field_text(text, "signal"),
                Term::from_field_text(text, "common"),
            ])),
        ]) {
            let phrase_terms = query
                .downcast_ref::<PhraseQuery>()
                .map(|phrase| phrase.phrase_terms());
            for allowed in [
                RoaringBitmap::new(),
                (0..768).collect(),
                (0..768).filter(|id| id % 19 == 0).collect(),
            ] {
                for literal in [false, true] {
                    for offset in [0, 7, 200] {
                        let expected_allowed = allowed.clone();
                        let native = FilterCollector::new(
                            "slot".into(),
                            move |id: u64| {
                                expected_allowed.contains(id as u32)
                                    && (!literal || id.is_multiple_of(7))
                            },
                            TopDocs::with_limit(13).and_offset(offset).order_by_score(),
                        );
                        let expected = searcher.search(query.as_ref(), &native).unwrap();
                        let actual = top_docs(
                            &searcher,
                            query.as_ref(),
                            |slot| Ok(allowed.contains(slot)),
                            offset..offset + 13,
                            Instant::now() + Duration::from_secs(10),
                            phrase_terms.as_deref(),
                            |address| {
                                Ok(!literal
                                    || searcher
                                        .doc::<TantivyDocument>(address)?
                                        .get_first(text)
                                        .and_then(|v| v.as_str())
                                        .unwrap()
                                        .contains("literalneedle"))
                            },
                        )
                        .unwrap();
                        assert_eq!(actual, expected);
                    }
                }
            }
        }
        let all: RoaringBitmap = (0..768).collect();
        assert!(
            top_docs(
                &searcher,
                &AllQuery,
                |slot| Ok(all.contains(slot)),
                0..13,
                Instant::now(),
                None,
                |_| Ok(true)
            )
            .is_err()
        );
        assert!(
            top_docs(
                &searcher,
                &AllQuery,
                |slot| Ok(all.contains(slot)),
                0..13,
                Instant::now() + Duration::from_secs(10),
                None,
                |_| anyhow::bail!("body read failed")
            )
            .is_err()
        );
        let mut checked = 0;
        assert!(
            top_docs(
                &searcher,
                &AllQuery,
                |_| {
                    checked += 1;
                    ensure!(checked < 2, "permission projection read failed");
                    Ok(true)
                },
                0..13,
                Instant::now() + Duration::from_secs(10),
                None,
                |_| Ok(true)
            )
            .is_err()
        );
        assert_eq!(checked, 2);
    }
}
