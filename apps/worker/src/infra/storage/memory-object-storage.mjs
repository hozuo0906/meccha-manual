import { assertObjectStorage } from "../../domain/storage/object-storage.mjs";

function storageId(area, key) {
  return `${area}\u0000${key}`;
}

function cloneObject(object) {
  return {
    ...object,
    body: object.body.slice(),
    metadata: { ...object.metadata }
  };
}

export function createMemoryObjectStorage() {
  const objects = new Map();

  return assertObjectStorage({
    async put(object) {
      objects.set(storageId(object.area, object.key), cloneObject(object));
      return { status: "stored" };
    },
    async get({ area, key }) {
      const object = objects.get(storageId(area, key));
      return object ? cloneObject(object) : null;
    },
    async delete({ area, key }) {
      return { status: objects.delete(storageId(area, key)) ? "deleted" : "not_found" };
    }
  });
}
