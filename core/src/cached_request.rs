pub trait CachedRequest {
    /// The version of the cache. This should be incremented whenever the inputs or
    /// outputs of the block are changed, to ensure that the cached data is invalidated.
    const VERSION: i32;

    /// Gets the version of the cache.
    fn version() -> i32 {
        Self::VERSION
    }
}
