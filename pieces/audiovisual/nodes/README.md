# audiovisual/nodes

- **Engine:** web (Vite + WebGL2 + Tone.js)
- **Seed:** u32 NAP Rng (xoshiro128**)
- **Time:** logical `t = frame / fps` into shader `u_time`
- **Events:** NAP pointer / node / parameter / transport streams via `engines/web/src/events.ts`

Run: `cd engines/web && npm run dev` then open with `?seed=42`.
