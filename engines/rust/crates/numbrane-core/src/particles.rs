//! Deterministic particle system for LATTICEFALL.
//!
//! # Flat buffer layout
//!
//! `export_buffer` / `write_buffer` emit `FLOATS_PER_PARTICLE` (= 9) floats per
//! particle, tightly packed:
//!
//! ```text
//! [id, x, y, vx, vy, age, lifetime, energy, source_node] × N
//! ```
//!
//! `id` and `source_node` are stored as `f32` of their integer values (e.g.
//! `id as f32`) so a JS `Float32Array` can read them without bit-casts.
//!
//! # Integration
//!
//! Semi-implicit Euler: `v += a * dt`, then `x += v * dt`.
//!
//! # Field
//!
//! Built-in sampling (no Python callback):
//! `field(x,y,t) = curl_noise(x,y,t) * strength + lattice_attraction(nodes)
//!               + optional mouse attractor`.

use crate::rng::Rng;
use crate::seed_streams::{stream_seed, STREAM_FIELD, STREAM_PARTICLES};

/// Floats per particle in the exported buffer.
pub const FLOATS_PER_PARTICLE: usize = 9;

/// One simulation particle.
#[derive(Clone, Debug, PartialEq)]
pub struct Particle {
    pub id: u32,
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub age: f32,
    pub lifetime: f32,
    pub energy: f32,
    pub source_node: u32,
}

/// Tunable simulation parameters.
#[derive(Clone, Debug, PartialEq)]
pub struct ParticleParams {
    /// Curl-noise field strength.
    pub curl_strength: f32,
    /// Lattice node attraction strength.
    pub lattice_strength: f32,
    /// Soft falloff radius for lattice attraction (world units).
    pub lattice_radius: f32,
    /// Velocity damping factor applied each step (`v *= 1 - damping * dt`).
    pub damping: f32,
    /// Minimum particle lifetime (seconds).
    pub lifetime_min: f32,
    /// Maximum particle lifetime (seconds).
    pub lifetime_max: f32,
    /// Position jitter when spawning at a lattice node.
    pub spawn_jitter: f32,
    /// Initial energy on spawn / respawn.
    pub energy_initial: f32,
    /// Soft speed clamp.
    pub max_speed: f32,
    /// Spatial scale for curl noise.
    pub noise_scale: f32,
    /// Temporal scale for curl noise (`noise_xy *= t * noise_time_scale`).
    pub noise_time_scale: f32,
}

impl Default for ParticleParams {
    fn default() -> Self {
        Self {
            curl_strength: 0.8,
            lattice_strength: 0.35,
            lattice_radius: 0.35,
            damping: 0.15,
            lifetime_min: 2.0,
            lifetime_max: 6.0,
            spawn_jitter: 0.04,
            energy_initial: 1.0,
            max_speed: 2.5,
            noise_scale: 2.5,
            noise_time_scale: 0.15,
        }
    }
}

impl ParticleParams {
    /// Parse a flat `f32` slice (missing / short → defaults for remaining).
    ///
    /// Layout:
    /// `[curl_strength, lattice_strength, lattice_radius, damping,
    ///   lifetime_min, lifetime_max, spawn_jitter, energy_initial,
    ///   max_speed, noise_scale, noise_time_scale]`
    pub fn from_slice(params: &[f32]) -> Self {
        let mut p = Self::default();
        if let Some(&v) = params.first() {
            p.curl_strength = v;
        }
        if let Some(&v) = params.get(1) {
            p.lattice_strength = v;
        }
        if let Some(&v) = params.get(2) {
            p.lattice_radius = v;
        }
        if let Some(&v) = params.get(3) {
            p.damping = v;
        }
        if let Some(&v) = params.get(4) {
            p.lifetime_min = v;
        }
        if let Some(&v) = params.get(5) {
            p.lifetime_max = v;
        }
        if let Some(&v) = params.get(6) {
            p.spawn_jitter = v;
        }
        if let Some(&v) = params.get(7) {
            p.energy_initial = v;
        }
        if let Some(&v) = params.get(8) {
            p.max_speed = v;
        }
        if let Some(&v) = params.get(9) {
            p.noise_scale = v;
        }
        if let Some(&v) = params.get(10) {
            p.noise_time_scale = v;
        }
        p
    }
}

/// Deterministic particle swarm driven by curl noise + lattice attraction.
#[derive(Clone, Debug)]
pub struct ParticleSystem {
    particles: Vec<Particle>,
    nodes: Vec<(f32, f32)>,
    rng: Rng,
    field_seed: u32,
    params: ParticleParams,
    next_id: u32,
}

impl ParticleSystem {
    /// Create `count` particles seeded from named particle / field streams.
    ///
    /// `lattice_nodes` may be empty; particles then spawn near the origin.
    pub fn new(
        seed: u32,
        count: u32,
        lattice_nodes: &[(f32, f32)],
        params: ParticleParams,
    ) -> Self {
        let particle_seed = stream_seed(seed, STREAM_PARTICLES);
        let field_seed = stream_seed(seed, STREAM_FIELD);
        let mut rng = Rng::new(particle_seed);
        let nodes = lattice_nodes.to_vec();
        let mut next_id = 0u32;
        let mut particles = Vec::with_capacity(count as usize);
        for _ in 0..count {
            particles.push(spawn_particle(&mut rng, &nodes, &params, &mut next_id));
        }
        Self {
            particles,
            nodes,
            rng,
            field_seed,
            params,
            next_id,
        }
    }

    /// Update live simulation parameters without resetting particle identities.
    pub fn set_params(&mut self, params: ParticleParams) {
        self.params = params;
    }

    /// Advance the simulation by `dt` at time `t`.
    ///
    /// `attractor` is optional `(x, y, strength)`. When `strength == 0` or
    /// `None`, the mouse term is omitted.
    pub fn step(&mut self, dt: f32, t: f32, attractor: Option<(f32, f32, f32)>) {
        let params = self.params.clone();
        let field_seed = self.field_seed;
        let nodes = self.nodes.clone();

        for p in &mut self.particles {
            p.age += dt;
            if p.age >= p.lifetime {
                *p = spawn_particle(&mut self.rng, &nodes, &params, &mut self.next_id);
                continue;
            }

            let (fx, fy) = sample_field(p.x, p.y, t, field_seed, &nodes, &params, attractor);

            // Semi-implicit Euler
            p.vx += fx * dt;
            p.vy += fy * dt;

            let damp = (1.0 - params.damping * dt).max(0.0);
            p.vx *= damp;
            p.vy *= damp;

            let speed = (p.vx * p.vx + p.vy * p.vy).sqrt();
            if speed > params.max_speed && speed > 0.0 {
                let s = params.max_speed / speed;
                p.vx *= s;
                p.vy *= s;
            }

            p.x += p.vx * dt;
            p.y += p.vy * dt;

            p.energy = (p.energy - 0.05 * dt).max(0.0);
        }
    }

    /// Number of particles.
    pub fn len(&self) -> usize {
        self.particles.len()
    }

    /// True if there are no particles.
    pub fn is_empty(&self) -> bool {
        self.particles.is_empty()
    }

    /// Borrow particles.
    pub fn particles(&self) -> &[Particle] {
        &self.particles
    }

    /// Export state as a flat `f32` buffer (see module docs).
    pub fn export_buffer(&self) -> Vec<f32> {
        let mut out = vec![0.0; self.particles.len() * FLOATS_PER_PARTICLE];
        self.write_buffer(&mut out);
        out
    }

    /// Write into a pre-sized buffer (`len >= N * FLOATS_PER_PARTICLE`).
    pub fn write_buffer(&self, out: &mut [f32]) {
        assert!(out.len() >= self.particles.len() * FLOATS_PER_PARTICLE);
        for (i, p) in self.particles.iter().enumerate() {
            let o = i * FLOATS_PER_PARTICLE;
            out[o] = p.id as f32;
            out[o + 1] = p.x;
            out[o + 2] = p.y;
            out[o + 3] = p.vx;
            out[o + 4] = p.vy;
            out[o + 5] = p.age;
            out[o + 6] = p.lifetime;
            out[o + 7] = p.energy;
            out[o + 8] = p.source_node as f32;
        }
    }

    /// Lightweight FNV-1a 64 digest of quantized particle state (hex string).
    ///
    /// Quantization: each float is rounded to 1e-4 then scaled to `i32`
    /// (`round(v * 10000)`). Integer fields use their `u32` values.
    pub fn digest(&self) -> String {
        format!("{:016x}", self.digest_u64())
    }

    /// Raw FNV-1a 64 digest of quantized state.
    pub fn digest_u64(&self) -> u64 {
        const OFFSET: u64 = 0xcbf29ce484222325;
        const PRIME: u64 = 0x100000001b3;
        let mut h = OFFSET;
        let mix_u32 = |h: &mut u64, v: u32| {
            for b in v.to_le_bytes() {
                *h ^= u64::from(b);
                *h = h.wrapping_mul(PRIME);
            }
        };
        let mix_i32 = |h: &mut u64, v: i32| {
            mix_u32(h, v as u32);
        };
        let quant = |v: f32| -> i32 { (v * 10_000.0).round() as i32 };

        for p in &self.particles {
            mix_u32(&mut h, p.id);
            mix_i32(&mut h, quant(p.x));
            mix_i32(&mut h, quant(p.y));
            mix_i32(&mut h, quant(p.vx));
            mix_i32(&mut h, quant(p.vy));
            mix_i32(&mut h, quant(p.age));
            mix_i32(&mut h, quant(p.lifetime));
            mix_i32(&mut h, quant(p.energy));
            mix_u32(&mut h, p.source_node);
        }
        h
    }
}

fn spawn_particle(
    rng: &mut Rng,
    nodes: &[(f32, f32)],
    params: &ParticleParams,
    next_id: &mut u32,
) -> Particle {
    let id = *next_id;
    *next_id = next_id.wrapping_add(1);

    let (source_node, bx, by) = if nodes.is_empty() {
        (0u32, 0.0f32, 0.0f32)
    } else {
        let idx = (rng.random_u32() as usize) % nodes.len();
        let (nx, ny) = nodes[idx];
        (idx as u32, nx, ny)
    };

    let jx = (rng.random_f64() as f32 * 2.0 - 1.0) * params.spawn_jitter;
    let jy = (rng.random_f64() as f32 * 2.0 - 1.0) * params.spawn_jitter;
    let life_span = params.lifetime_max - params.lifetime_min;
    let lifetime = params.lifetime_min + rng.random_f64() as f32 * life_span.max(0.0);
    let angle = rng.random_f64() as f32 * std::f32::consts::TAU;
    let speed = rng.random_f64() as f32 * 0.15;

    Particle {
        id,
        x: bx + jx,
        y: by + jy,
        vx: angle.cos() * speed,
        vy: angle.sin() * speed,
        age: 0.0,
        lifetime: lifetime.max(0.01),
        energy: params.energy_initial,
        source_node,
    }
}

/// Built-in field: curl noise + lattice attraction + optional attractor.
pub fn sample_field(
    x: f32,
    y: f32,
    t: f32,
    field_seed: u32,
    nodes: &[(f32, f32)],
    params: &ParticleParams,
    attractor: Option<(f32, f32, f32)>,
) -> (f32, f32) {
    let (cx, cy) = curl_noise(
        x,
        y,
        t,
        field_seed,
        params.noise_scale,
        params.noise_time_scale,
    );
    let mut fx = cx * params.curl_strength;
    let mut fy = cy * params.curl_strength;

    let (lx, ly) = lattice_attraction(x, y, nodes, params.lattice_radius);
    fx += lx * params.lattice_strength;
    fy += ly * params.lattice_strength;

    if let Some((ax, ay, strength)) = attractor {
        if strength != 0.0 {
            let dx = ax - x;
            let dy = ay - y;
            let d2 = dx * dx + dy * dy + 1e-4;
            let inv = strength / d2.sqrt();
            fx += dx * inv;
            fy += dy * inv;
        }
    }

    (fx, fy)
}

fn lattice_attraction(x: f32, y: f32, nodes: &[(f32, f32)], radius: f32) -> (f32, f32) {
    if nodes.is_empty() {
        return (0.0, 0.0);
    }
    let r = radius.max(1e-4);
    let r2 = r * r;
    let mut fx = 0.0f32;
    let mut fy = 0.0f32;
    for &(nx, ny) in nodes {
        let dx = nx - x;
        let dy = ny - y;
        let d2 = dx * dx + dy * dy;
        if d2 < r2 {
            // Soft spring toward node; stronger when closer to center of radius.
            let w = 1.0 - (d2 / r2).sqrt();
            fx += dx * w;
            fy += dy * w;
        }
    }
    (fx, fy)
}

/// Hash-based value noise → curl (divergence-free) vector field.
///
/// Uses integer lattice hashing + bilinear interpolation of a scalar potential,
/// then finite differences for curl: `vx = dP/dy`, `vy = -dP/dx`.
pub fn curl_noise(x: f32, y: f32, t: f32, seed: u32, scale: f32, time_scale: f32) -> (f32, f32) {
    let s = scale.max(1e-6);
    let px = x * s;
    let py = y * s;
    let pz = t * time_scale;
    let eps = 0.01;

    let dpy = value_noise3(px, py + eps, pz, seed) - value_noise3(px, py - eps, pz, seed);
    let dpx = value_noise3(px + eps, py, pz, seed) - value_noise3(px - eps, py, pz, seed);
    let inv = 1.0 / (2.0 * eps);
    (dpy * inv, -dpx * inv)
}

fn hash3(ix: i32, iy: i32, iz: i32, seed: u32) -> u32 {
    let mut h = seed
        .wrapping_mul(0x9E3779B9)
        .wrapping_add(ix as u32)
        .wrapping_mul(0x85EBCA6B);
    h ^= (iy as u32).wrapping_mul(0xC2B2AE35);
    h = h.wrapping_add((iz as u32).wrapping_mul(0x27D4EB2D));
    h ^= h >> 16;
    h = h.wrapping_mul(0x7FEB352D);
    h ^= h >> 15;
    h = h.wrapping_mul(0x846CA68B);
    h ^= h >> 16;
    h
}

fn fade(t: f32) -> f32 {
    // Smoothstep cubic
    t * t * (3.0 - 2.0 * t)
}

fn value_noise3(x: f32, y: f32, z: f32, seed: u32) -> f32 {
    let x0 = x.floor() as i32;
    let y0 = y.floor() as i32;
    let z0 = z.floor() as i32;
    let fx = fade(x - x0 as f32);
    let fy = fade(y - y0 as f32);
    let fz = fade(z - z0 as f32);

    let corner = |ix: i32, iy: i32, iz: i32| -> f32 {
        let h = hash3(ix, iy, iz, seed);
        // Map top bits to [-1, 1)
        (h >> 8) as f32 * (1.0 / 8_388_608.0) - 1.0
    };

    let c000 = corner(x0, y0, z0);
    let c100 = corner(x0 + 1, y0, z0);
    let c010 = corner(x0, y0 + 1, z0);
    let c110 = corner(x0 + 1, y0 + 1, z0);
    let c001 = corner(x0, y0, z0 + 1);
    let c101 = corner(x0 + 1, y0, z0 + 1);
    let c011 = corner(x0, y0 + 1, z0 + 1);
    let c111 = corner(x0 + 1, y0 + 1, z0 + 1);

    let x00 = c000 + (c100 - c000) * fx;
    let x10 = c010 + (c110 - c010) * fx;
    let x01 = c001 + (c101 - c001) * fx;
    let x11 = c011 + (c111 - c011) * fx;
    let y0v = x00 + (x10 - x00) * fy;
    let y1v = x01 + (x11 - x01) * fy;
    y0v + (y1v - y0v) * fz
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tiny_nodes() -> Vec<(f32, f32)> {
        vec![(0.0, 0.0), (0.5, 0.0), (0.25, 0.433)]
    }

    #[test]
    fn step_determinism_same_seed() {
        let nodes = tiny_nodes();
        let params = ParticleParams::default();
        let mut a = ParticleSystem::new(42, 32, &nodes, params.clone());
        let mut b = ParticleSystem::new(42, 32, &nodes, params);
        for i in 0..20 {
            let t = i as f32 * 1.0 / 60.0;
            a.step(1.0 / 60.0, t, Some((0.1, 0.2, 0.5)));
            b.step(1.0 / 60.0, t, Some((0.1, 0.2, 0.5)));
        }
        assert_eq!(a.export_buffer(), b.export_buffer());
        assert_eq!(a.digest(), b.digest());
    }

    #[test]
    fn digest_equality_after_n_steps() {
        let nodes = tiny_nodes();
        let params = ParticleParams::default();
        let mut a = ParticleSystem::new(7, 16, &nodes, params.clone());
        let mut b = ParticleSystem::new(7, 16, &nodes, params);
        for i in 0..50 {
            let t = i as f32 * 0.016;
            a.step(0.016, t, None);
            b.step(0.016, t, None);
        }
        let da = a.digest();
        let db = b.digest();
        assert_eq!(da, db);
        assert_eq!(da.len(), 16);
        // Different seed must diverge
        let mut c = ParticleSystem::new(8, 16, &nodes, ParticleParams::default());
        for i in 0..50 {
            c.step(0.016, i as f32 * 0.016, None);
        }
        assert_ne!(a.digest(), c.digest());
    }

    #[test]
    fn buffer_layout_length() {
        let sys = ParticleSystem::new(1, 5, &tiny_nodes(), ParticleParams::default());
        let buf = sys.export_buffer();
        assert_eq!(buf.len(), 5 * FLOATS_PER_PARTICLE);
        // id stored as f32 of integer
        assert_eq!(buf[0], 0.0);
        assert_eq!(buf[FLOATS_PER_PARTICLE], 1.0);
    }

    #[test]
    fn curl_noise_deterministic() {
        let a = curl_noise(0.3, 0.7, 1.2, 99, 2.0, 0.1);
        let b = curl_noise(0.3, 0.7, 1.2, 99, 2.0, 0.1);
        assert_eq!(a, b);
    }

    #[test]
    fn params_from_slice_partial() {
        let p = ParticleParams::from_slice(&[1.5, 0.2]);
        assert_eq!(p.curl_strength, 1.5);
        assert_eq!(p.lattice_strength, 0.2);
        assert_eq!(p.damping, ParticleParams::default().damping);
    }
}
