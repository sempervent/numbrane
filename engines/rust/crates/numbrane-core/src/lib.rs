//! NUMBRANE core — deliberately small.

pub mod particles;
pub mod rng;
pub mod seed_streams;

pub use particles::{Particle, ParticleParams, ParticleSystem, FLOATS_PER_PARTICLE};
pub use rng::Rng;
pub use seed_streams::{stream_seed, SeedStreams, CANONICAL_STREAMS};
