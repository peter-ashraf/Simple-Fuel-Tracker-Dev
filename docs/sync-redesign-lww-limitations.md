# Last Writer Wins (LWW) - Limitations and Edge Cases

## Current Implementation
The current merge logic uses "last writer wins per field" for automatic conflict resolution:
- For each field, compare local.updatedAt vs cloud.updated_at
- Use the value from the record with the later timestamp
- Apply the merged result to both sides

## Limitations and Edge Cases

### 1. Device Clock Differences
**Problem:** Device clocks may not be synchronized with server time or each other.

**Impact:**
- If local device clock is ahead of server, local changes may incorrectly win conflicts
- If local device clock is behind, local changes may incorrectly lose conflicts
- Clock drift can cause unpredictable conflict resolution

**Current Mitigation:**
- None. The implementation relies on device clock accuracy.

**Recommended Mitigation:**
- Use server-generated timestamps for all updates
- When uploading to cloud, use server's NOW() as the authoritative timestamp
- When comparing, prefer cloud.updated_at (server time) over local.updatedAt (device time)
- Add clock drift detection and warning

**Status:** NOT IMPLEMENTED. This is a significant limitation.

### 2. Edit vs Delete Conflict
**Problem:** One side deletes a record while the other edits it.

**Current Behavior:**
- The `respect-delete` resolution action handles this explicitly
- If local.deletedAt exists, deletion is propagated to cloud
- If cloud.deleted_at exists, deletion is propagated to local
- In automatic LWW merge, this is NOT handled - could result in zombie records

**Impact:**
- If automatic merge is used on edit vs delete conflict, the edit may be preserved incorrectly
- The deletion may be lost, causing the record to reappear

**Current Mitigation:**
- Per-record resolution UI allows user to choose "Respect delete"
- Automatic LWW merge does NOT check for deletion conflicts

**Recommended Mitigation:**
- In automatic merge, check for deletion conflicts first
- If one side has deleted_at set, deletion wins (record is deleted on both sides)
- Only apply LWW to non-deletion conflicts
- Make edit vs delete conflicts explicit (require user resolution)

**Status:** PARTIALLY MITIGATED. User can choose, but automatic merge is risky.

### 3. Both Sides Edit Different Fields Offline
**Problem:** Both sides edit different fields of the same record while offline.

**Current Behavior:**
- LWW per field will correctly handle this
- Each field uses the timestamp of its own edit
- Result is a true merge of both changes

**Impact:**
- This is the ideal case for LWW per field
- Works correctly as implemented

**Limitation:**
- If timestamps are close (within same second), resolution may be unpredictable
- No semantic validation of field combinations (e.g., odometer decreasing)

**Status:** ACCEPTABLE. This is the intended use case for LWW per field.

### 4. Stale updated_at from Missing Migration/Backfill
**Problem:** Existing records may not have updated_at field until migration is applied.

**Current Behavior:**
- Code falls back to timestamp (created_at) if updatedAt is missing
- This treats creation time as update time
- Old records may appear "newer" than they actually are

**Impact:**
- Records without updated_at may incorrectly win conflicts
- Old edits may be incorrectly preserved over newer edits
- Conflict resolution becomes unreliable until data is backfilled

**Current Mitigation:**
- Fallback to timestamp (created_at) if updatedAt missing
- This is a poor fallback - treats creation as update

**Recommended Mitigation:**
- Block sync until updated_at migration is applied
- Backfill updated_at with created_at for existing records
- Add validation to ensure updated_at exists before sync
- Treat missing updated_at as a conflict requiring manual resolution

**Status:** HIGH RISK. This is a blocking issue for production use.

### 5. Both Sides Edit Same Field
**Problem:** Both sides edit the same field of the same record.

**Current Behavior:**
- LWW per field will use the value from the later timestamp
- One edit will be lost (the earlier one)

**Impact:**
- Data loss is inevitable in this scenario
- User may not realize their edit was lost
- No indication that a conflict occurred

**Current Mitigation:**
- None. This is silent data loss.

**Recommended Mitigation:**
- Detect when both sides edited the same field
- Make this an explicit conflict requiring user resolution
- Do NOT auto-resolve same-field edits
- Show both values to user and let them choose

**Status:** NOT MITIGATED. This is a significant data loss risk.

### 6. Clock Skew Between Local and Cloud
**Problem:** Network latency can cause timestamp ordering issues.

**Current Behavior:**
- Uses direct timestamp comparison
- No accounting for network latency or clock skew

**Impact:**
- If local and cloud updates happen within network latency window, ordering may be incorrect
- May cause the wrong edit to win

**Recommended Mitigation:**
- Add a small grace period (e.g., 5 seconds) for timestamp comparison
- If timestamps are within grace period, treat as conflict
- Require user resolution for near-simultaneous edits

**Status:** NOT IMPLEMENTED.

## When to Prefer User Resolution Instead of Automatic LWW

### Require User Resolution For:
1. **Edit vs delete conflicts** - Deletion should win, but user should confirm
2. **Same-field edits** - Both sides edited the same field, data loss risk
3. **Near-simultaneous edits** - Timestamps within grace period (e.g., 5 seconds)
4. **Missing updated_at** - Metadata incomplete, cannot trust automatic resolution
5. **Semantic validation failures** - e.g., odometer decreasing, negative values
6. **Critical field conflicts** - e.g., vehicle_id changes, date changes

### Allow Automatic LWW For:
1. **Different-field edits** - Each side edited different fields (ideal case)
2. **Clear timestamp separation** - Timestamps differ by more than grace period
3. **Non-critical fields** - e.g., notes, station (data loss is acceptable)
4. **Metadata complete** - Both sides have updated_at, stable_key

## Recommended Changes to Narrow Automatic Merging

### 1. Add Deletion Conflict Check
```javascript
if (local.deletedAt || cloud.deleted_at) {
  // This is an edit vs delete conflict
  // Require user resolution, do NOT auto-merge
  return 'requires-resolution';
}
```

### 2. Add Same-Field Edit Detection
```javascript
const editedFields = getEditedFields(local, cloud);
const sameFieldEdits = editedFields.filter(f => 
  local[f] !== cloud[f] && 
  timestampsWithinGracePeriod(local.updatedAt, cloud.updated_at)
);

if (sameFieldEdits.length > 0) {
  // Same-field edits detected
  // Require user resolution
  return 'requires-resolution';
}
```

### 3. Add Timestamp Grace Period
```javascript
const GRACE_PERIOD_MS = 5000; // 5 seconds

function timestampsWithinGracePeriod(t1, t2) {
  const diff = Math.abs(new Date(t1).getTime() - new Date(t2).getTime());
  return diff < GRACE_PERIOD_MS;
}
```

### 4. Add Metadata Validation
```javascript
if (!local.updatedAt || !cloud.updated_at) {
  // Metadata incomplete
  // Require user resolution
  return 'requires-resolution';
}
```

### 5. Add Semantic Validation
```javascript
if (local.odometer < cloud.odometer && local.updatedAt > cloud.updated_at) {
  // Odometer decreased with later timestamp
  // This may be a data entry error
  // Require user resolution
  return 'requires-resolution';
}
```

## Current Risk Assessment

### High Risk (Blocking for Production)
- Stale updated_at from missing migration/backfill
- Edit vs delete conflicts in automatic merge
- Same-field edits causing silent data loss
- Device clock differences

### Medium Risk (Should Be Addressed)
- Near-simultaneous edits
- Semantic validation failures
- Missing metadata validation

### Low Risk (Acceptable)
- Different-field edits (works correctly)
- Non-critical field conflicts

## Conclusion

The current LWW per field implementation is **NOT production-ready** due to:
1. Missing updated_at metadata (blocking)
2. No handling of edit vs delete conflicts in automatic merge
3. Silent data loss on same-field edits
4. No clock skew mitigation
5. No metadata validation

**Recommendation:** Narrow automatic merging to only safe cases (different-field edits with clear timestamp separation). Make all other cases explicit conflicts requiring user resolution.
