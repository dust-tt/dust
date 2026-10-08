use std::{collections::BTreeMap, time::Instant};

pub struct Trace {
    started: Instant,
    checkpoint: Instant,
    pub stages_ms: BTreeMap<String, f64>,
}

impl Default for Trace {
    fn default() -> Self {
        let started = Instant::now();
        Self {
            started,
            checkpoint: started,
            stages_ms: BTreeMap::new(),
        }
    }
}

impl Trace {
    pub fn mark(&mut self, name: &str) {
        let now = Instant::now();
        self.stages_ms.insert(
            name.into(),
            now.duration_since(self.checkpoint).as_secs_f64() * 1000.0,
        );
        self.checkpoint = now;
    }

    pub fn finish(mut self, name: &str) -> BTreeMap<String, f64> {
        self.stages_ms
            .insert(name.into(), self.started.elapsed().as_secs_f64() * 1000.0);
        self.stages_ms
    }
}
