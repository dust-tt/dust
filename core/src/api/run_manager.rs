use crate::{app, run};

/// API State

pub(crate) struct RunManager {
    pub(crate) pending_apps: Vec<(app::App, run::Credentials, run::Secrets, bool)>,
    pub(crate) pending_runs: Vec<String>,
}
