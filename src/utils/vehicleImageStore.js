const DB_NAME = "simple-fuel-tracker-vehicle-images";
const DB_VERSION = 1;
const STORE_NAME = "vehicleImages";

const openVehicleImageDb = () =>
  new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available."));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () =>
      reject(request.error || new Error("Could not open vehicle image store."));

    request.onupgradeneeded = () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: "id" });

      if (!store.indexNames.contains("vehicleId")) {
        store.createIndex("vehicleId", "vehicleId", { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
  });

const runStoreRequest = async (mode, callback) => {
  const db = await openVehicleImageDb();

  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const request = callback(store);

      request.onerror = () =>
        reject(request.error || new Error("Vehicle image store request failed."));
      request.onsuccess = () => resolve(request.result);
      transaction.onerror = () =>
        reject(transaction.error || new Error("Vehicle image transaction failed."));
    });
  } finally {
    db.close();
  }
};

export const saveVehicleImageRecord = (record) =>
  runStoreRequest("readwrite", (store) => store.put(record));

export const updateVehicleImageRecord = async (id, patch) => {
  const current = await getVehicleImageRecord(id);
  if (!current) return null;

  const next = { ...current, ...patch };
  await saveVehicleImageRecord(next);
  return next;
};

export const getVehicleImageRecord = (id) =>
  runStoreRequest("readonly", (store) => store.get(id));

export const getVehicleImageRecords = (vehicleId) =>
  runStoreRequest("readonly", (store) =>
    store.index("vehicleId").getAll(String(vehicleId)),
  ).then((records = []) =>
    records.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)),
  );

export const removeVehicleImageRecord = (id) =>
  runStoreRequest("readwrite", (store) => store.delete(id));
