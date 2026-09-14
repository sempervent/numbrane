use numbrane_core::Rng;
use std::env;

fn main() {
    let seed: u32 = env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(42);
    let mut rng = Rng::new(seed);
    println!("numbrane rng seed={seed} first_u32={}", rng.random_u32());
}
