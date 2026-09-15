/**
 * Browser-local Seed Artifact library (IndexedDB-backed, no server).
 */

export type StudioSeedRecord = {
  id: string;
  pieceId: string;
  seed: number;
  frame: number;
  artifactType: string;
  previewDataUrl?: string;
  /** Structured state payloads (Float32Arrays serialized as base64). */
  arrays?: Record<string, { dtype: string; shape: number[]; base64: string }>;
  jsonBlobs?: Record<string, unknown>;
  recipe?: Record<string, unknown>;
  createdAt: number;
};

const DB_NAME = "numbrane-studio-seeds";
const STORE = "seeds";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listSeeds(): Promise<StudioSeedRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const rows = (req.result as StudioSeedRecord[]) || [];
      rows.sort((a, b) => b.createdAt - a.createdAt);
      resolve(rows);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveSeed(rec: StudioSeedRecord): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(rec);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getSeed(id: string): Promise<StudioSeedRecord | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as StudioSeedRecord) || null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteSeed(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function float32ToBase64(arr: Float32Array): string {
  const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

export function base64ToFloat32(b64: string): Float32Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}

export function newSeedId(pieceId: string, seed: number): string {
  return `${pieceId.replace(/\//g, "-")}-s${seed}-${Date.now().toString(36)}`;
}
