//! Named deterministic substream seeds derived from a master `u32` seed.
//!
//! # Algorithm
//!
//! Must match Python `numbrane_python.seed_streams`:
//!
//! 1. Hash the UTF-8 name bytes with **FNV-1a 32-bit**
//!    (`offset = 0x811C_9DC5`, `prime = 0x0100_0193`).
//! 2. Mix with the master seed: `state = seed ^ h`.
//! 3. Advance **one** full **splitmix32** step (same constants as NAP RNG
//!    expansion in `rng.rs`) and use that output as the stream seed:
//!    ```text
//!    state = state + 0x9E3779B9
//!    z = state
//!    z = (z ^ (z >> 16)) * 0x85EBCA6B
//!    z = (z ^ (z >> 13)) * 0xC2B2AE35
//!    stream_seed = z ^ (z >> 16)
//!    ```
//!
//! Derivation is **order-independent**: requesting `"geometry"` then `"particles"`
//! yields the same stream seeds as the reverse order. Streams are named, not
//! sequential draws from a shared RNG.

/// Canonical LATTICEFALL / NUMBRANE stream names.
pub const STREAM_GEOMETRY: &str = "geometry";
pub const STREAM_FIELD: &str = "field";
pub const STREAM_PARTICLES: &str = "particles";
pub const STREAM_FRACTAL: &str = "fractal";
pub const STREAM_PALETTE: &str = "palette";
pub const STREAM_AUDIO: &str = "audio";
pub const STREAM_INTERACTION: &str = "interaction";

/// All canonical stream names in a stable documentation order.
pub const CANONICAL_STREAMS: &[&str] = &[
    STREAM_GEOMETRY,
    STREAM_FIELD,
    STREAM_PARTICLES,
    STREAM_FRACTAL,
    STREAM_PALETTE,
    STREAM_AUDIO,
    STREAM_INTERACTION,
];

const FNV_OFFSET: u32 = 0x811C_9DC5;
const FNV_PRIME: u32 = 0x0100_0193;

/// FNV-1a 32-bit hash of arbitrary bytes.
pub fn fnv1a32(bytes: &[u8]) -> u32 {
    let mut h = FNV_OFFSET;
    for &b in bytes {
        h ^= u32::from(b);
        h = h.wrapping_mul(FNV_PRIME);
    }
    h
}

/// One splitmix32 step — identical to `rng::splitmix32` / Python `_splitmix32`.
fn splitmix32(state: &mut u32) -> u32 {
    *state = state.wrapping_add(0x9E37_79B9);
    let mut z = *state;
    z = (z ^ (z >> 16)).wrapping_mul(0x85EB_CA6B);
    z = (z ^ (z >> 13)).wrapping_mul(0xC2B2_AE35);
    z ^ (z >> 16)
}

/// Derive an independent `u32` stream seed for `name` from `master`.
///
/// Same `(master, name)` always produces the same result; order of requests
/// across names does not matter.
pub fn stream_seed(master: u32, name: &str) -> u32 {
    let h = fnv1a32(name.as_bytes());
    let mut state = master ^ h;
    splitmix32(&mut state)
}

/// Convenience bundle of the seven canonical LATTICEFALL stream seeds.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SeedStreams {
    pub geometry: u32,
    pub field: u32,
    pub particles: u32,
    pub fractal: u32,
    pub palette: u32,
    pub audio: u32,
    pub interaction: u32,
}

impl SeedStreams {
    /// Derive all canonical named streams from `master`.
    pub fn from_master(master: u32) -> Self {
        Self {
            geometry: stream_seed(master, STREAM_GEOMETRY),
            field: stream_seed(master, STREAM_FIELD),
            particles: stream_seed(master, STREAM_PARTICLES),
            fractal: stream_seed(master, STREAM_FRACTAL),
            palette: stream_seed(master, STREAM_PALETTE),
            audio: stream_seed(master, STREAM_AUDIO),
            interaction: stream_seed(master, STREAM_INTERACTION),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn named_streams_stable_for_same_seed() {
        let a = SeedStreams::from_master(42);
        let b = SeedStreams::from_master(42);
        assert_eq!(a, b);
        assert_eq!(stream_seed(42, STREAM_GEOMETRY), a.geometry);
        assert_eq!(stream_seed(42, STREAM_PARTICLES), a.particles);
    }

    #[test]
    fn different_names_differ() {
        let s = SeedStreams::from_master(7);
        let vals = [
            s.geometry,
            s.field,
            s.particles,
            s.fractal,
            s.palette,
            s.audio,
            s.interaction,
        ];
        for i in 0..vals.len() {
            for j in (i + 1)..vals.len() {
                assert_ne!(
                    vals[i], vals[j],
                    "streams {} and {} collided",
                    CANONICAL_STREAMS[i], CANONICAL_STREAMS[j]
                );
            }
        }
    }

    #[test]
    fn order_independent_derivation() {
        let reverse: Vec<u32> = CANONICAL_STREAMS
            .iter()
            .rev()
            .map(|n| stream_seed(99, n))
            .collect();
        let forward: Vec<u32> = CANONICAL_STREAMS
            .iter()
            .map(|n| stream_seed(99, n))
            .collect();
        for (name, &fwd) in CANONICAL_STREAMS.iter().zip(forward.iter()) {
            let rev = reverse
                .iter()
                .zip(CANONICAL_STREAMS.iter().rev())
                .find(|(_, n)| *n == name)
                .map(|(v, _)| *v)
                .unwrap();
            assert_eq!(fwd, rev, "mismatch for {name}");
        }
    }

    #[test]
    fn different_masters_differ() {
        assert_ne!(SeedStreams::from_master(1), SeedStreams::from_master(2));
    }

    #[test]
    fn matches_python_seed42_geometry() {
        // Cross-check vs Python numbrane_python.seed_streams for seed=42.
        assert_eq!(stream_seed(42, STREAM_GEOMETRY), 1225911174);
        assert_eq!(stream_seed(42, STREAM_FIELD), 1139474178);
    }
}
