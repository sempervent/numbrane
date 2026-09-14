//! NUMBRANE WASM bridge — LATTICEFALL particle simulation.

use numbrane_core::{ParticleParams, ParticleSystem, FLOATS_PER_PARTICLE};
use wasm_bindgen::prelude::*;

/// LATTICEFALL particle simulator exposed to JavaScript / TypeScript.
///
/// # Particle buffer layout
///
/// `particle_buffer()` returns a flat `Float32Array`-compatible `Vec<f32>`:
/// `[id, x, y, vx, vy, age, lifetime, energy, source_node] × N`
/// where `id` / `source_node` are integer values stored as `f32`.
#[wasm_bindgen]
pub struct LatticefallSim {
    inner: ParticleSystem,
}

#[wasm_bindgen]
impl LatticefallSim {
    /// Create a simulation.
    ///
    /// - `seed` — master u32 seed (named streams derived inside core)
    /// - `count` — particle count
    /// - `node_xy` — interleaved lattice node positions `[x0,y0, x1,y1, …]`
    /// - `params` — optional flat params (empty → defaults); see
    ///   [`ParticleParams::from_slice`](numbrane_core::ParticleParams::from_slice)
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u32, count: u32, node_xy: &[f32], params: &[f32]) -> LatticefallSim {
        let mut nodes = Vec::with_capacity(node_xy.len() / 2);
        let mut i = 0;
        while i + 1 < node_xy.len() {
            nodes.push((node_xy[i], node_xy[i + 1]));
            i += 2;
        }
        let p = ParticleParams::from_slice(params);
        LatticefallSim {
            inner: ParticleSystem::new(seed, count, &nodes, p),
        }
    }

    /// Advance one step. Pass `attractor_strength = 0` to disable the mouse term.
    pub fn step(
        &mut self,
        dt: f32,
        t: f32,
        attractor_x: f32,
        attractor_y: f32,
        attractor_strength: f32,
    ) {
        let attractor = if attractor_strength == 0.0 {
            None
        } else {
            Some((attractor_x, attractor_y, attractor_strength))
        };
        self.inner.step(dt, t, attractor);
    }

    /// Update live params (flat slice; same layout as constructor).
    pub fn set_params(&mut self, params: &[f32]) {
        self.inner.set_params(ParticleParams::from_slice(params));
    }

    /// Flat particle state buffer (see struct docs).
    pub fn particle_buffer(&self) -> Vec<f32> {
        self.inner.export_buffer()
    }

    /// Number of particles.
    pub fn particle_count(&self) -> u32 {
        self.inner.len() as u32
    }

    /// Floats per particle in `particle_buffer` (always 9).
    pub fn floats_per_particle(&self) -> u32 {
        FLOATS_PER_PARTICLE as u32
    }

    /// FNV-1a 64 hex digest of quantized particle state (for golden tests).
    pub fn digest(&self) -> String {
        self.inner.digest()
    }
}

/// Placeholder export retained for smoke / contract checks.
#[wasm_bindgen]
pub fn rng_first_u32(seed: u32) -> u32 {
    numbrane_core::Rng::new(seed).random_u32()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn smoke_rng() {
        assert_ne!(rng_first_u32(1), rng_first_u32(2));
    }

    #[test]
    fn latticefall_roundtrip() {
        let nodes = [0.0f32, 0.0, 1.0, 0.0, 0.5, 0.8];
        let mut sim = LatticefallSim::new(42, 8, &nodes, &[]);
        assert_eq!(sim.particle_count(), 8);
        assert_eq!(sim.floats_per_particle(), 9);
        sim.step(1.0 / 60.0, 0.0, 0.0, 0.0, 0.0);
        let buf = sim.particle_buffer();
        assert_eq!(buf.len(), 8 * 9);
        let d1 = sim.digest();
        let mut sim2 = LatticefallSim::new(42, 8, &nodes, &[]);
        sim2.step(1.0 / 60.0, 0.0, 0.0, 0.0, 0.0);
        assert_eq!(d1, sim2.digest());
    }
}
