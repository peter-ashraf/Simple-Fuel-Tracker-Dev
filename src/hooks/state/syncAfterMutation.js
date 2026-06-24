export function syncLocalChangesInBackground() {
  if (!navigator.onLine) return;

  import('../../services/cloudSyncService')
    .then(({ cloudSyncService }) =>
      cloudSyncService.getUserId().then((userId) => {
        if (userId) {
          cloudSyncService.syncAfterMutation(userId).catch(() => {});
        }
      }),
    )
    .catch(() => {});
}
