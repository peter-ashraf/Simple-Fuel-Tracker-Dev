# Sync Conflict Flow Redesign - Phase 1: Research & Planning

## Current Sync Semantics Analysis

### Action: "Sync both sides" (merge decision)

**Current Implementation:**
```javascript
case 'merge':
  // CRITICAL: Do NOT call syncFromCloud after merge to preserve local data
  // Only process queue to upload any pending local changes
  console.log('[Sync][initialize] Processing queue only (merge decision)');
  if (this.isOnline()) {
    await this.processQueue(userId);
  }
  result.message = 'Sync continued after merge. Local data preserved.';
  break;
```

**Current Behavior:**
- Does NOT download from cloud
- Does NOT perform actual merging
- Only processes queue (uploads pending local changes)
- Preserves local data as-is
- No bidirectional synchronization

**Problem:** The label "Sync both sides" is misleading - it doesn't actually sync both sides. It only uploads local changes.

### Action: "Upload local changes" (upload decision)

**Current Implementation:**
```javascript
case 'upload':
  // CRITICAL: Do NOT call syncFromCloud after upload to preserve local data
  // Only process queue to upload any pending local changes
  console.log('[Sync][initialize] Processing queue only (upload decision)');
  if (this.isOnline()) {
    await this.processQueue(userId);
  }
  result.message = 'Sync continued after upload. Local data preserved.';
  break;
```

**Current Behavior:**
- Does NOT download from cloud
- Only processes queue (uploads pending local changes)
- Preserves local data as-is
- Same behavior as "merge" currently

**Problem:** No difference between "merge" and "upload" in current implementation.

### Action: "Replace local with cloud" (download decision)

**Current Implementation:**
```javascript
case 'download':
  // User explicitly chose to overwrite local with cloud
  // Safe to sync from cloud since user made this choice
  console.log('[Sync][initialize] Syncing from cloud (download decision)');
  if (this.isOnline()) {
    await this.syncFromCloud(userId);
    await this.processQueue(userId);
  }
  result.message = 'Sync continued after download.';
  break;
```

**Current Behavior:**
- Calls `syncFromCloud(userId)` - fetches ALL data from cloud
- Overwrites localStorage with cloud data completely
- Then processes queue (uploads pending local changes)
- Destructive: loses all local-only changes

**syncFromCloud Implementation:**
```javascript
async syncFromCloud(userId) {
  // Fetch vehicles
  const { data: vehicles } = await supabase.from('vehicles').select('*').eq('user_id', userId);
  localStorage.setItem('fueltracker-vehicles-v2', JSON.stringify(mappedVehicles));
  
  // Fetch fillups
  const { data: fillups } = await supabase.from('fillups').select('*').eq('user_id', userId);
  localStorage.setItem('fueltracker-fillups-v2', JSON.stringify(mappedFillups));
  
  // Fetch maintenance
  const { data: maintenance } = await supabase.from('maintenance').select('*').eq('user_id', userId);
  localStorage.setItem('fueltracker-maintenance-entries-v3', JSON.stringify(mappedMaintenance));
  
  // Fetch app settings
  const { data: settings } = await supabase.from('app_settings').select('*').eq('user_id', userId);
  // Update localStorage with settings
}
```

**Problem:** Complete overwrite, no diffing, no conflict resolution, no tombstone handling.

## Current Sync Semantics Summary

| Action | Downloads from Cloud? | Uploads to Cloud? | Local Data Handling | Cloud Data Handling |
|--------|----------------------|-------------------|---------------------|---------------------|
| Sync both sides (merge) | ❌ No | ✅ Yes (queue only) | Preserved | Ignored |
| Upload local changes | ❌ No | ✅ Yes (queue only) | Preserved | Ignored |
| Replace local with cloud | ✅ Yes (full overwrite) | ✅ Yes (queue after) | Overwritten | Preserved |

**Key Issues:**
1. "Merge" doesn't actually merge - it's identical to "upload"
2. No bidirectional synchronization
3. No diff/reconciliation logic
4. No conflict detection or resolution
5. "Replace local with cloud" is destructive (complete overwrite)
6. No use of stable_key, updated_at, or deleted_at for intelligent sync
7. No per-record conflict handling
8. Queue processing is simple upsert, no conflict awareness

## Revised Sync Semantics (Precise Terms)

### Action: "Sync both sides" (true bidirectional merge)

**Proposed Behavior:**
1. Fetch cloud data for all entities
2. Compute diff between local and cloud:
   - Local-only records → upload to cloud
   - Cloud-only records → download to local
   - Same record changed both sides → conflict resolution (last writer wins based on updated_at)
   - Deleted locally but active in cloud → propagate deletion to cloud
   - Deleted in cloud but active locally → propagate deletion to local
3. Apply changes bidirectionally
4. Return detailed summary of actions taken

**Result Summary:**
- X records uploaded to cloud
- Y records downloaded from local
- Z records deleted from cloud
- N records deleted from local
- M conflicts resolved (last writer wins)

### Action: "Upload local changes" (local-first, push to cloud)

**Proposed Behavior:**
1. Fetch cloud data for all entities
2. Compute diff:
   - Local-only records → upload to cloud
   - Same record changed both sides → local wins (overwrite cloud)
   - Deleted locally → propagate deletion to cloud
   - Cloud-only records → keep in cloud (do not delete)
3. Upload local changes to cloud
4. Do NOT download anything from cloud
5. Return detailed summary

**Result Summary:**
- X records uploaded to cloud
- Y records updated in cloud (local wins)
- Z records deleted from cloud
- Cloud-only records preserved

### Action: "Replace local with cloud" (cloud-first, pull to local)

**Proposed Behavior:**
1. Fetch cloud data for all entities
2. Compute diff:
   - Cloud-only records → download to local
   - Same record changed both sides → cloud wins (overwrite local)
   - Deleted in cloud → propagate deletion to local
   - Local-only records → delete from local (or preserve with warning)
3. Download cloud data to local
4. Return detailed summary

**Result Summary:**
- X records downloaded from cloud
- Y records updated in local (cloud wins)
- Z records deleted from local
- Local-only records removed (with warning)

## Implementation Plan

### Phase 2: Diff and Reconciliation Logic

**Tasks:**
1. Implement `computeDiff(localData, cloudData)` function
2. Classify records into categories:
   - localOnly
   - cloudOnly
   - bothChanged (with updated_at comparison)
   - localDeleted
   - cloudDeleted
   - identical
3. Add tombstone support for all entities
4. Use updated_at for conflict detection
5. Return structured diff object for UI consumption

**Diff Structure:**
```javascript
{
  vehicles: {
    localOnly: [...],
    cloudOnly: [...],
    bothChanged: [{ local, cloud, winner: 'local'|'cloud' }],
    localDeleted: [...],
    cloudDeleted: [...],
    identical: [...]
  },
  fillups: { ... },
  maintenance: { ... },
  tripEstimates: { ... }
}
```

### Phase 3: Sync Semantics Implementation

**Tasks:**
1. Implement `syncBothSides(diff)` - bidirectional merge
2. Implement `uploadLocalChanges(diff)` - local-first push
3. Implement `replaceLocalWithCloud(diff)` - cloud-first pull
4. Each function returns detailed result summary
5. Prevent routine mutation failures from escalating to full migration

### Phase 4: UI Enhancements

**Tasks:**
1. Show real diff summary in modal
2. Display example differing records
3. Add structured result summary after sync
4. Improve action descriptions

### Phase 5: Per-Record Resolution (Future)

**Tasks:**
1. Design per-record resolution UI
2. Add "Review differences" step
3. Support per-record actions (keep local, keep cloud, merge, etc.)

### Phase 6: Verification

**Test Scenarios:**
1. Local-only create
2. Local-only delete
3. Cloud-only record
4. Both-side edits
5. Delete vs edit conflict
6. Equal counts but different content
7. Duplicate/ambiguous matching
8. Background sync after redesign

## Prerequisites Before Implementation

1. **Apply schema migrations** (from Phase 0):
   - Add updated_at to all entities
   - Add stable_key to maintenance, trip_estimates
   - Add version field (optional)

2. **Update local storage schema**:
   - Add updatedAt to all local records
   - Add stableKey to maintenance, trip_estimates
   - Backfill stable_key for existing records

3. **Update sync service**:
   - Modify syncFromCloud to use diff/reconciliation
   - Modify uploadLocalDataToCloud to use diff/reconciliation
   - Add computeDiff function
   - Add applyDiff function

## Phased Rollout

**Phase 1 (Fill-ups only):**
- Implement diff/reconciliation for fill-ups
- Test with fill-ups scenarios
- Keep other entities using old sync logic

**Phase 2 (Vehicles):**
- Extend diff/reconciliation to vehicles
- Test vehicle scenarios

**Phase 3 (Maintenance & Trip Estimates):**
- Extend to remaining entities
- Full rollout

## Known Limitations

1. No per-record conflict resolution UI (Phase 5)
2. No automatic merge strategies beyond "last writer wins"
3. No conflict prevention (optimistic locking)
4. No offline conflict queue
5. No partial sync (all-or-nothing per entity)
