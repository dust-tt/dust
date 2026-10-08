fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("cargo:rerun-if-changed=proto/dfs.proto");
    tonic_prost_build::configure()
        .type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]")
        .message_attribute(".", "#[serde(default)]")
        .btree_map(".")
        .extern_path(".dfs.v5.ObjectRef", "crate::ObjectRef")
        .extern_path(".dfs.v5.Revision", "crate::Revision")
        .compile_protos(&["proto/dfs.proto"], &["proto"])?;
    Ok(())
}
