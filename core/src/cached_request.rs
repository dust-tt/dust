pub trait CachedRequest {
    /// The version of the cache. This should be incremented whenever the inputs or
    /// outputs of the block are changed, to ensure that the cached data is invalidated.
    const VERSION: i32;

    const REQUEST_TYPE: &'static str;

    /// Gets the version of the cache.
    fn version() -> i32 {
        Self::VERSION
    }

    /// Gets the type of the request.
    fn request_type() -> String {
        Self::REQUEST_TYPE.to_string()
    }
}
