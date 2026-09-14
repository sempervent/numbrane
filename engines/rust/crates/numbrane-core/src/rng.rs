//! NAP v0 deterministic RNG: xoshiro128** with splitmix32 seed expansion.

#[derive(Clone, Debug)]
pub struct Rng {
    s: [u32; 4],
}

fn rotl(x: u32, k: u32) -> u32 {
    x.rotate_left(k)
}

fn splitmix32(state: &mut u32) -> u32 {
    *state = state.wrapping_add(0x9E3779B9);
    let mut z = *state;
    z = (z ^ (z >> 16)).wrapping_mul(0x85EBCA6B);
    z = (z ^ (z >> 13)).wrapping_mul(0xC2B2AE35);
    z ^ (z >> 16)
}

pub fn expand_seed(seed: u32) -> [u32; 4] {
    let mut sm = seed;
    let mut s = [
        splitmix32(&mut sm),
        splitmix32(&mut sm),
        splitmix32(&mut sm),
        splitmix32(&mut sm),
    ];
    if s.iter().all(|&x| x == 0) {
        s[0] = 1;
    }
    s
}

impl Rng {
    pub fn new(seed: u32) -> Self {
        Self {
            s: expand_seed(seed),
        }
    }

    pub fn state(&self) -> [u32; 4] {
        self.s
    }

    pub fn random_u32(&mut self) -> u32 {
        let s = &mut self.s;
        let result = rotl(s[1].wrapping_mul(5), 7).wrapping_mul(9);
        let t = s[1] << 9;
        s[2] ^= s[0];
        s[3] ^= s[1];
        s[1] ^= s[2];
        s[0] ^= s[3];
        s[2] ^= t;
        s[3] = rotl(s[3], 11);
        result
    }

    /// Unit interval [0, 1) using top 24 bits.
    pub fn random_f64(&mut self) -> f64 {
        (self.random_u32() >> 8) as f64 * (1.0 / 16_777_216.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;
    use std::fs;
    use std::path::PathBuf;

    #[derive(Deserialize)]
    struct Case {
        seed: u32,
        state0: [u32; 4],
        u32: Vec<u32>,
        f64: Vec<f64>,
    }

    #[derive(Deserialize)]
    struct Vectors {
        cases: Vec<Case>,
    }

    fn vectors_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../../spec/rng/vectors.json")
    }

    #[test]
    fn rng_vectors() {
        let data: Vectors =
            serde_json::from_str(&fs::read_to_string(vectors_path()).unwrap()).unwrap();
        for case in data.cases {
            assert_eq!(expand_seed(case.seed), case.state0);
            let mut rng = Rng::new(case.seed);
            for expected in case.u32 {
                assert_eq!(rng.random_u32(), expected);
            }
            let mut rng = Rng::new(case.seed);
            for expected in case.f64 {
                let got = rng.random_f64();
                assert!((got - expected).abs() < 1e-15);
            }
        }
    }
}
