import { STORAGE_PREFIX, storageKey } from './appConfig';

const PATCH_FLAG = '__SFT_DEV_STORAGE_ISOLATION_PATCHED__';

if (typeof window !== 'undefined' && !window[PATCH_FLAG]) {
  window[PATCH_FLAG] = true;

  const proto = Storage.prototype;
  const originalGetItem = proto.getItem;
  const originalSetItem = proto.setItem;
  const originalRemoveItem = proto.removeItem;
  const originalKey = proto.key;

  const mapKey = (key) => storageKey(String(key));

  proto.getItem = function getItem(key) {
    return originalGetItem.call(this, mapKey(key));
  };

  proto.setItem = function setItem(key, value) {
    return originalSetItem.call(this, mapKey(key), value);
  };

  proto.removeItem = function removeItem(key) {
    return originalRemoveItem.call(this, mapKey(key));
  };

  proto.key = function key(index) {
    const visibleKeys = [];
    for (let i = 0; i < this.length; i += 1) {
      const rawKey = originalKey.call(this, i);
      if (!rawKey || !rawKey.startsWith(`${STORAGE_PREFIX}-`)) continue;
      visibleKeys.push(rawKey.replace(`${STORAGE_PREFIX}-`, ''));
    }
    return visibleKeys[index] || null;
  };

  proto.clear = function clear() {
    const keysToRemove = [];
    for (let i = 0; i < this.length; i += 1) {
      const rawKey = originalKey.call(this, i);
      if (rawKey?.startsWith(`${STORAGE_PREFIX}-`)) keysToRemove.push(rawKey);
    }
    keysToRemove.forEach((key) => originalRemoveItem.call(this, key));
  };

  console.info(`[DevStorage] localStorage isolation enabled with prefix "${STORAGE_PREFIX}-"`);
}
