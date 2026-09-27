const DB_NAME = "meccha-manual-capture-live";
const DB_VERSION = 1;
const STORE = "step-images";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact(mode, action) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = action(transaction.objectStore(STORE));
      let result;
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

async function countReady(sessionId) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, "readonly");
      const range = IDBKeyRange.bound(`${sessionId}:`, `${sessionId}:\uffff`);
      const request = transaction.objectStore(STORE).openKeyCursor(range);
      let count = 0;
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        count += 1;
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => resolve(count);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export const captureLiveStore = {
  available: true,
  put: (entry) => {
    if (entry?.status !== "ready" || !entry.dataUrl) return Promise.reject(new Error("capture live entry must be ready"));
    return transact("readwrite", (store) => store.put(structuredClone({
      ...entry,
      key: `${entry.sessionId}:${entry.eventId}`
    })));
  },
  list: async (sessionId) => (await transact("readonly", (store) => store.getAll()))
    .filter((entry) => entry.sessionId === sessionId)
    .sort((left, right) => String(left.eventId).localeCompare(String(right.eventId))),
  count: (sessionId) => countReady(sessionId),
  clear: async (sessionId) => {
    const entries = await captureLiveStore.list(sessionId);
    if (!entries.length) return;
    await transact("readwrite", (store) => {
      for (const entry of entries) store.delete(entry.key);
      return store.get(entries[0].key);
    });
  }
};
