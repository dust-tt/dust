#[allow(dead_code)]
pub fn config(config: dfs_tikv::Config) -> dfs_tikv::Config {
    config
}

#[allow(dead_code)]
pub fn artifact(path: &str) -> std::path::PathBuf {
    let path = if let Ok(root) = std::env::var("DFS_TIKV_TEST_RESULTS") {
        std::path::Path::new(&root).join(std::path::Path::new(path).file_name().unwrap())
    } else {
        path.into()
    };
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    path
}
