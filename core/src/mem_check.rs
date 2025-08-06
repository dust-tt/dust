use tikv_jemalloc_ctl::{epoch, stats};
use tracing::info;

// Methods to help debug memory usage
// Probably should be called in production code, but more meant to be used in test branches

fn get_memory_usage() -> Result<(usize, usize), Box<dyn std::error::Error>> {
    // advance epoch to get fresh stats
    epoch::advance().map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?;

    let allocated =
        stats::allocated::read().map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?; // bytes allocated by app
    let resident =
        stats::resident::read().map_err(|e| Box::<dyn std::error::Error>::from(e.to_string()))?; // bytes in physical memory

    Ok((allocated, resident))
}

pub fn log_mem(message: &str) {
    if let Ok((allocated, resident)) = get_memory_usage() {
        info!(
            allocated = allocated,
            resident = resident,
            "MEMORY USE: {}",
            message
        );
    } else {
        info!("Failed to get memory usage: {}", message);
    }
}
