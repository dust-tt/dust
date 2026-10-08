fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("cargo:rerun-if-changed=proto/dfs.proto");
    tonic_prost_build::configure()
        .type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]")
        .message_attribute(".", "#[serde(default)]")
        .message_attribute(".dfs.v1.DenyGrant", "#[serde(deny_unknown_fields)]")
        .btree_map(".")
        .extern_path(".dfs.v1.ObjectId", "crate::ObjectId")
        .extern_path(".dfs.v1.ObjectRef", "crate::ObjectRef")
        .compile_protos(&["proto/dfs.proto"], &["proto"])?;
    Ok(())
}
