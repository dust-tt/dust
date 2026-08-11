#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
mod model;
#[cfg_attr(not(target_os = "linux"), allow(dead_code))]
mod mutation;

#[cfg(target_os = "linux")]
mod core;
#[cfg(target_os = "linux")]
mod fuse;

use std::path::PathBuf;

use anyhow::bail;
#[cfg(target_os = "linux")]
use anyhow::Context;
use clap::Args;

use model::MountSpec;

#[derive(Args, Debug)]
pub struct FilesystemArgs {
    #[arg(long = "mount-spec", value_parser = MountSpec::parse_json)]
    mount_specs: Vec<MountSpec>,
    #[arg(long)]
    mountpoint: Option<PathBuf>,
    #[arg(long)]
    api_url: Option<String>,
    #[arg(long)]
    token_file: Option<PathBuf>,
    #[arg(long)]
    self_test: bool,
}

#[cfg(target_os = "linux")]
#[derive(Debug)]
struct RuntimeArgs {
    mount_specs: Vec<MountSpec>,
    mountpoint: PathBuf,
    api_url: String,
    token_file: PathBuf,
}

#[cfg(target_os = "linux")]
impl FilesystemArgs {
    fn into_runtime(self) -> anyhow::Result<RuntimeArgs> {
        if self.self_test {
            bail!("self-test arguments cannot be used to mount the filesystem");
        }
        if self.mount_specs.is_empty() {
            bail!("at least one --mount-spec is required");
        }
        Ok(RuntimeArgs {
            mount_specs: self.mount_specs,
            mountpoint: self.mountpoint.context("--mountpoint is required")?,
            api_url: self.api_url.context("--api-url is required")?,
            token_file: self.token_file.context("--token-file is required")?,
        })
    }
}

#[cfg(target_os = "linux")]
pub fn cmd_filesystem(args: FilesystemArgs) -> anyhow::Result<()> {
    if args.self_test {
        return core::run_self_test();
    }
    fuse::mount(args.into_runtime()?)
}

#[cfg(not(target_os = "linux"))]
pub fn cmd_filesystem(args: FilesystemArgs) -> anyhow::Result<()> {
    let _ = args;
    bail!("dsbx filesystem is supported only on Linux")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mount_spec_is_strict_and_typed() {
        let spec = MountSpec::parse_json(
            r#"{"name":"conversation-conv_1","source":"/run/dust-fs/data/mount-0","kind":"conversation","ownerId":"conv_1","readOnly":false,"legacyName":"conversation"}"#,
        )
        .expect("valid mount spec should parse");

        assert_eq!(spec.name, "conversation-conv_1");
        assert!(!spec.read_only);
        assert!(MountSpec::parse_json(
            r#"{"name":"conversation","source":"/tmp","kind":"other","ownerId":"x","readOnly":false,"legacyName":null}"#,
        )
        .is_err());
    }
}
