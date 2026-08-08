import type { PhotoProof } from "@/lib/bookings";

const DB_NAME = "travelyt-offline-custody";
const STORE_NAME = "proof-queue";
const DB_VERSION = 1;

export type QueuedOfflineProof = {
  id: string;
  bookingId: string;
  accessToken?: string | null;
  proof: PhotoProof;
  proofDigest: string;
  queuedAt: string;
};

function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  return database().then((db) => new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode); const request = work(tx.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close(); tx.onerror = () => reject(tx.error);
  }));
}
async function digest(value: string) {
  const bytes = new TextEncoder().encode(value);
  const result = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(result)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function queueOfflineProof(bookingId: string, proof: PhotoProof, accessToken?: string | null) {
  if (typeof window === "undefined" || !window.indexedDB || !crypto.subtle) throw new Error("Offline proof storage is unavailable on this device.");
  const item: QueuedOfflineProof = {
    id: crypto.randomUUID(), bookingId, accessToken, proof,
    proofDigest: await digest(JSON.stringify({ bookingId, proof })), queuedAt: new Date().toISOString(),
  };
  await transaction("readwrite", (store) => store.put(item));
  return item;
}
export async function listQueuedOfflineProofs() {
  if (typeof window === "undefined" || !window.indexedDB) return [] as QueuedOfflineProof[];
  return (await transaction("readonly", (store) => store.getAll())) as QueuedOfflineProof[];
}
export async function removeQueuedOfflineProof(id: string) {
  if (typeof window === "undefined" || !window.indexedDB) return;
  await transaction("readwrite", (store) => store.delete(id));
}
