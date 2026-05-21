pub mod algorithms;
pub mod core;
pub mod ffi;
pub mod telemetry;

// Only expose the Node bridge if we are building for Node
#[cfg(feature = "napi")]
pub use ffi::node_bridge::PaceNode;