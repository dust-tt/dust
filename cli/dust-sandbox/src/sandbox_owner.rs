//! Which kind of owner this sandbox runs for, read from the owner env var front sets at sandbox
//! creation (see `getSandboxOwnerEnvVars` in front/lib/api/sandbox/owner.ts).

const CONVERSATION_ID_ENV: &str = "CONVERSATION_ID";
const FRAME_ID_ENV: &str = "FRAME_ID";

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum SandboxOwner {
    Conversation,
    Frame,
    /// Neither owner env var is set (local dev, or a shell without the sandbox env).
    Unknown,
}

fn is_set(name: &str) -> bool {
    std::env::var_os(name).is_some_and(|value| !value.is_empty())
}

pub(crate) fn detect() -> SandboxOwner {
    if is_set(CONVERSATION_ID_ENV) {
        SandboxOwner::Conversation
    } else if is_set(FRAME_ID_ENV) {
        SandboxOwner::Frame
    } else {
        SandboxOwner::Unknown
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_owner_from_env() {
        let _guard = crate::commands::ENV_LOCK.lock().expect("ENV_LOCK poisoned");
        let saved_conversation = std::env::var_os(CONVERSATION_ID_ENV);
        let saved_frame = std::env::var_os(FRAME_ID_ENV);

        std::env::remove_var(CONVERSATION_ID_ENV);
        std::env::remove_var(FRAME_ID_ENV);
        assert_eq!(detect(), SandboxOwner::Unknown);

        std::env::set_var(FRAME_ID_ENV, "");
        assert_eq!(detect(), SandboxOwner::Unknown);

        std::env::set_var(FRAME_ID_ENV, "fil_abc123");
        assert_eq!(detect(), SandboxOwner::Frame);

        std::env::remove_var(FRAME_ID_ENV);
        std::env::set_var(CONVERSATION_ID_ENV, "conv_123");
        assert_eq!(detect(), SandboxOwner::Conversation);

        for (name, saved) in [
            (CONVERSATION_ID_ENV, saved_conversation),
            (FRAME_ID_ENV, saved_frame),
        ] {
            match saved {
                Some(value) => std::env::set_var(name, value),
                None => std::env::remove_var(name),
            }
        }
    }
}
