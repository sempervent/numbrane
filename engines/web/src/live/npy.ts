/**
 * Minimal NumPy .npy v1/v2 float32 loader (little-endian C-order).
 */

export async function fetchNpyFloat32(url: string): Promise<{
  data: Float32Array;
  shape: number[];
}> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`npy fetch failed: ${res.status}`);
  const buf = await res.arrayBuffer();
  return parseNpyFloat32(buf);
}

export function parseNpyFloat32(buf: ArrayBuffer): {
  data: Float32Array;
  shape: number[];
} {
  const u8 = new Uint8Array(buf);
  if (u8[0] !== 0x93 || String.fromCharCode(...u8.slice(1, 6)) !== "NUMPY") {
    throw new Error("not an npy file");
  }
  const major = u8[6];
  let headerLen: number;
  let headerOffset: number;
  if (major === 1) {
    headerLen = new DataView(buf, 8, 2).getUint16(0, true);
    headerOffset = 10;
  } else {
    headerLen = new DataView(buf, 8, 4).getUint32(0, true);
    headerOffset = 12;
  }
  const header = new TextDecoder().decode(u8.slice(headerOffset, headerOffset + headerLen));
  const descr = /'descr':\s*'([^']+)'/.exec(header)?.[1] ?? "";
  if (!descr.includes("f4") && !descr.includes("<f4")) {
    throw new Error(`unsupported npy dtype ${descr}`);
  }
  const shapeMatch = /'shape':\s*\(([^)]*)\)/.exec(header);
  const shape = (shapeMatch?.[1] ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s));
  const dataOffset = headerOffset + headerLen;
  const raw = new Uint8Array(buf, dataOffset);
  const aligned = new ArrayBuffer(raw.byteLength);
  new Uint8Array(aligned).set(raw);
  const data = new Float32Array(aligned);
  return { data, shape };
}
