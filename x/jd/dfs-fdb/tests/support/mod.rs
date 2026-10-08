pub fn main(tests: Vec<libtest_mimic::Trial>) {
    let args = libtest_mimic::Arguments::from_args();
    let conclusion = {
        let _network = unsafe { dfs_fdb::boot() };
        libtest_mimic::run(&args, tests)
    };
    conclusion.exit();
}

pub fn run(
    future: impl std::future::Future<Output = anyhow::Result<()>>,
) -> Result<(), libtest_mimic::Failed> {
    tokio::runtime::Builder::new_multi_thread()
        .worker_threads(8)
        .enable_all()
        .build()
        .map_err(|error| libtest_mimic::Failed::from(error.to_string()))?
        .block_on(future)
        .map_err(|error| error.to_string().into())
}
