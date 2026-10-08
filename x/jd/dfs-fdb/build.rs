fn main() -> Result<(), Box<dyn std::error::Error>> {
    let mut config = tonic_build::Config::new();
    config.protoc_executable(protoc_bin_vendored::protoc_bin_path()?);
    tonic_build::configure().compile_protos_with_config(
        config,
        &["proto/dfs.proto"],
        &["proto"],
    )?;
    Ok(())
}
