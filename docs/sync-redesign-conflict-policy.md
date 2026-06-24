# Sync Conflict Policy

## Conflict Categories

### 1. Local-Only Record
**Definition:** Record exists in localStorage but not in cloud database.

**Sync both sides:**
- Upload record to cloud (upsert by stable_key)
- Result: 1 record uploaded

**Upload local changes:**
- Upload record to cloud (upsert by stable_key)
- Result: 1 record uploaded

**Replace local with cloud:**
- Remove record from localStorage (it doesn't exist in cloud)
- Result: 1 record removed from local

**Review differences / per-record resolution:**
- Not applicable (no conflict, record only exists locally)

---

### 2. Cloud-Only Record
**Definition:** Record exists in cloud database but not in localStorage.

**Sync both sides:**
- Download record to localStorage (upsert by stable_key)
- Result: 1 record downloaded

**Upload local changes:**
- Preserve cloud record (do nothing)
- Result: 0 changes (cloud-only record preserved)

**Replace local with cloud:**
- Download record to localStorage (upsert by stable_key)
- Result: 1 record downloaded

**Review differences / per-record resolution:**
- Not applicable (no conflict, record only exists in cloud)

---

### 3. Locally Deleted, Still Active in Cloud
**Definition:** Record has deletedAt set in localStorage but deleted_at is NULL in cloud.

**Sync both sides:**
- Propagate deletion to cloud (set deleted_at = NOW())
- Result: 1 record deleted from cloud

**Upload local changes:**
- Propagate deletion to cloud (set deleted_at = NOW())
- Result: 1 record deleted from cloud

**Replace local with cloud:**
- Restore record from cloud to localStorage (remove deletedAt)
- Result: 1 record restored to local

**Review differences / per-record resolution:**
- Show as "delete vs active" conflict
- Options: Keep local (delete from cloud), Keep cloud (restore to local), Skip for now

---

### 4. Deleted in Cloud, Still Active Locally
**Definition:** Record has deleted_at set in cloud but deletedAt is NULL in localStorage.

**Sync both sides:**
- Propagate deletion to local (set deletedAt = NOW() or remove from localStorage)
- Result: 1 record deleted from local

**Upload local changes:**
- Keep local record (do not delete)
- Result: 0 changes (local record preserved despite cloud deletion)

**Replace local with cloud:**
- Delete record from localStorage (respect cloud deletion)
- Result: 1 record deleted from local

**Review differences / per-record resolution:**
- Show as "active vs delete" conflict
- Options: Keep local (preserve despite cloud deletion), Keep cloud (delete from local), Skip for now

---

### 5. Same Record Changed on Both Sides
**Definition:** Record exists in both local and cloud with different content (same stable_key, different field values).

**Sync both sides:**
- Detect conflict and require user resolution
- Do NOT auto-merge
- Show per-record resolution UI
- Result: 1 conflict requires review

**Upload local changes:**
- Local wins: upload local version to cloud (overwrite cloud)
- Result: 1 record uploaded (local wins)

**Replace local with cloud:**
- Cloud wins: download cloud version to local (overwrite local)
- Result: 1 record downloaded (cloud wins)

**Review differences / per-record resolution:**
- Show side-by-side comparison
- Options: Keep local, Keep cloud, Merge automatically, Skip for now
- If Merge automatically: last writer wins per field (based on updated_at)

---

### 6. Both Changed Different Fields
**Definition:** Record exists in both local and cloud, but different fields were edited.

**Sync both sides:**
- Detect conflict and require user resolution
- Do NOT auto-merge
- Show per-record resolution UI with field-level diff
- Result: 1 conflict requires review

**Upload local changes:**
- Local wins: upload local version to cloud (overwrite all fields)
- Result: 1 record uploaded (local wins, cloud changes lost)

**Replace local with cloud:**
- Cloud wins: download cloud version to local (overwrite all fields)
- Result: 1 record downloaded (cloud wins, local changes lost)

**Review differences / per-record resolution:**
- Show field-by-field diff table
- Options: Keep local, Keep cloud, Merge automatically (last writer wins per field), Skip for now
- Merge automatically is safe for this case (different fields)

---

### 7. Both Changed Same Field
**Definition:** Record exists in both local and cloud, and the same field was edited to different values.

**Sync both sides:**
- Detect conflict and require user resolution
- Do NOT auto-merge
- Show per-record resolution UI
- Highlight the conflicting field
- Result: 1 conflict requires review

**Upload local changes:**
- Local wins: upload local version to cloud (overwrite field)
- Result: 1 record uploaded (local wins, cloud change lost)

**Replace local with cloud:**
- Cloud wins: download cloud version to local (overwrite field)
- Result: 1 record downloaded (cloud wins, local change lost)

**Review differences / per-record resolution:**
- Show field-by-field diff with conflicting field highlighted
- Options: Keep local, Keep cloud, Merge automatically (NOT RECOMMENDED - data loss risk), Skip for now
- Merge automatically should be discouraged for same-field conflicts

---

### 8. Edit vs Delete Conflict
**Definition:** One side deleted the record (deletedAt/deleted_at set), the other edited it.

**Sync both sides:**
- Detect conflict and require user resolution
- Do NOT auto-merge
- Show per-record resolution UI
- Result: 1 conflict requires review

**Upload local changes:**
- If local deleted: propagate deletion to cloud
- If local edited: upload local version to cloud (overwrite cloud deletion)
- Result: 1 record deleted OR 1 record uploaded

**Replace local with cloud:**
- If cloud deleted: propagate deletion to local
- If cloud edited: download cloud version to local (overwrite local deletion)
- Result: 1 record deleted OR 1 record downloaded

**Review differences / per-record resolution:**
- Show as "edit vs delete" conflict
- Options: Keep local (respect local action), Keep cloud (respect cloud action), Respect delete (delete on both), Skip for now
- Respect delete is recommended for edit vs delete conflicts

---

### 9. Ambiguous / Duplicate Match
**Definition:** Multiple records could match (e.g., same date/odometer but different stable_key).

**Sync both sides:**
- Detect ambiguity and require user resolution
- Do NOT auto-merge
- Show per-record resolution UI with both potential matches
- Result: 1 conflict requires review

**Upload local changes:**
- Use stable_key for matching (if available)
- If no stable_key, skip record with warning
- Result: 1 record skipped OR 1 record uploaded

**Replace local with cloud:**
- Use stable_key for matching (if available)
- If no stable_key, skip record with warning
- Result: 1 record skipped OR 1 record downloaded

**Review differences / per-record resolution:**
- Show both potential matches
- Options: Choose match A, Choose match B, Merge both, Skip for now
- User must explicitly resolve ambiguity

---

## Resolution Action Summary

### Keep Local
- **Behavior:** Overwrite cloud with local data
- **Use case:** User knows local changes are correct
- **Data loss:** Cloud changes are lost
- **Tombstone:** If local has deletedAt, cloud gets deleted_at

### Keep Cloud
- **Behavior:** Overwrite local with cloud data
- **Use case:** User knows cloud changes are correct
- **Data loss:** Local changes are lost
- **Tombstone:** If cloud has deleted_at, local gets deletedAt

### Merge Automatically
- **Behavior:** Last writer wins per field
- **Use case:** Both sides have valid changes, want to combine
- **Data loss:** Earlier edits per field are lost
- **Tombstone:** NOT applicable (requires both sides active)
- **Limitations:** 
  - Risky for same-field edits
  - Risky for edit vs delete conflicts
  - Requires updated_at metadata
  - Sensitive to clock skew

### Respect Delete
- **Behavior:** Honor deletion, propagate to other side
- **Use case:** One side intentionally deleted the record
- **Data loss:** Edit on other side is lost
- **Tombstone:** Both sides get deleted_at set

### Skip for Now
- **Behavior:** Leave conflict unresolved, defer decision
- **Use case:** User needs more information or time
- **Data loss:** None (deferred)
- **Tombstone:** None (deferred)
- **Persistence:** Stored in localStorage for later resolution

## Automatic vs Manual Resolution

### Require Manual Resolution For:
- Edit vs delete conflicts
- Same-field edits
- Ambiguous/duplicate matches
- Missing updated_at metadata
- Near-simultaneous edits (within grace period)
- Semantic validation failures (e.g., odometer decreasing)

### Allow Automatic Resolution For:
- Local-only records (upload)
- Cloud-only records (download, except in "upload local changes")
- Different-field edits (merge-auto only)
- Clear timestamp separation (> grace period)
- Non-critical field conflicts

## Result Summary Format

### Successful Sync
```
1 local-only fill-up uploaded
2 cloud-only fill-ups downloaded
1 cloud record deleted to match local tombstone
8 records unchanged
```

### With Conflicts
```
1 local-only fill-up uploaded
2 cloud-only fill-ups downloaded
1 conflict requires review
8 records unchanged
```

### After Conflict Resolution
```
1 local-only fill-up uploaded
2 cloud-only fill-ups downloaded
1 conflict resolved (keep local)
1 conflict skipped (unresolved)
8 records unchanged
```

### Errors
```
1 local-only fill-up uploaded
1 upload failed (network error)
1 conflict requires review
```

## Policy Enforcement

### Code-Level Enforcement
- `computeFillupDiff()` classifies conflicts correctly
- `applyFillupDiff()` respects sync action semantics
- `resolveSingleConflict()` enforces per-record resolution actions
- `mergeFillupRecords()` implements LWW per field with limitations documented

### UI-Level Enforcement
- ConflictReviewModal shows appropriate options per conflict type
- Edit vs delete conflicts highlight "Respect delete" option
- Same-field conflicts discourage "Merge automatically"
- Ambiguous matches require explicit user choice

### Data-Level Enforcement
- stable_key used for identity matching
- deleted_at used for tombstone detection
- updated_at used for conflict resolution (when available)
- RLS policies exclude deleted records from normal queries
