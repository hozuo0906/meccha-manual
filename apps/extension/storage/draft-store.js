const DB_NAME = "meccha-manual-guest";
const DB_VERSION = 1;
const STORE = "drafts";

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
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
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export const draftStore = {
  get: (id) => transact("readonly", (store) => store.get(id)),
  put: (draft) => transact("readwrite", (store) => store.put(structuredClone(draft))),
  list: () => transact("readonly", (store) => store.getAll())
};
