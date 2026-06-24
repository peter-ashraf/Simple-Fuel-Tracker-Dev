# Phase 5: Per-Record Resolution Design

## Per-Record Resolution Model

### Conflict Classification
Each conflict in the diff is classified with the following structure:

```javascript
{
  id: string,              // Record identifier
  type: 'fillup' | 'vehicle' | 'maintenance' | 'trip',
  conflictType: 'both-changed' | 'delete-vs-edit' | 'ambiguous-match',
  local: Object,           // Local record data
  cloud: Object,          // Cloud record data
  localUpdated: string,   // Local updated_at timestamp
  cloudUpdated: string,   // Cloud updated_at timestamp
  winner: 'local' | 'cloud' | 'unresolved',
  resolution: 'keep-local' | 'keep-cloud' | 'merge-auto' | 'respect-delete' | 'skip' | null,
  fieldDifferences: {
    // Map of field names that differ between local and cloud
    odometer: { local: 1000, cloud: 1005 },
    notes: { local: 'Old note', cloud: 'New note' }
  }
}
```

### Resolution Actions

#### Keep Local
- **Behavior:** Overwrite cloud with local data
- **Use case:** User knows local changes are correct
- **Implementation:** Upload local record to cloud (upsert)
- **Fields affected:** All fields from local record

#### Keep Cloud
- **Behavior:** Overwrite local with cloud data
- **Use case:** User knows cloud changes are correct
- **Implementation:** Download cloud record to local (update localStorage)
- **Fields affected:** All fields from cloud record

#### Merge Automatically
- **Behavior:** Merge fields intelligently, last writer wins per field
- **Use case:** Both sides have valid changes, want to combine
- **Implementation:** For each field, use the version with later updated_at
- **Fields affected:** Individual fields based on timestamps
- **Special handling:** For numeric fields, can calculate averages if appropriate
- **Special handling:** For text fields, concatenate with separator if both non-empty

#### Respect Delete / Tombstone
- **Behavior:** Honor the deletion, propagate to other side
- **Use case:** One side deleted the record intentionally
- **Implementation:** Set deleted_at on both sides
- **Special case:** If both deleted, already in sync
- **Special case:** If delete vs edit conflict, delete wins (edit is lost)

#### Skip for Now
- **Behavior:** Leave conflict unresolved, defer decision
- **Use case:** User needs more information or time to decide
- **Implementation:** Do nothing, record as unresolved
- **Persistence:** Store unresolved conflicts for later resolution
- **UI:** Show indicator that unresolved conflicts exist

## UI Flow Design

### Step 1: Initial Modal (Current)
Shows high-level diff summary:
- X records uploaded
- Y records downloaded
- Z conflicts detected

**New addition:** "Review conflicts" button if conflicts exist

### Step 2: Conflict Review Modal (New)
Shows per-record conflict resolution:

**Header:**
- Title: "Resolve Conflicts"
- Progress: "Conflict 1 of 5"
- Summary: "5 conflicts need resolution"

**Conflict Display:**
- Record type icon (fillup, vehicle, etc.)
- Record identifier (date, name, etc.)
- Side-by-side comparison:
  - Left: Local data
  - Right: Cloud data
  - Highlighted differences in red
- Timestamp comparison:
  - "Local: Updated 2 hours ago"
  - "Cloud: Updated 1 day ago"
  - "Local is newer" badge

**Field-by-field diff:**
- Table showing each differing field:
  - Field name | Local value | Cloud value
  - Color-coded: green for local winner, blue for cloud winner

**Resolution Actions (Buttons):**
1. **Keep local** (secondary button)
   - Label: "Use local version"
   - Description: "Overwrite cloud with this device's data"
   
2. **Keep cloud** (secondary button)
   - Label: "Use cloud version"
   - Description: "Replace local with cloud data"
   
3. **Merge automatically** (primary button - recommended)
   - Label: "Merge both versions"
   - Description: "Combine changes from both sides"
   
4. **Respect delete** (destructive button - if applicable)
   - Label: "Delete this record"
   - Description: "Remove from both local and cloud"
   - Warning: "This action cannot be undone"
   
5. **Skip for now** (tertiary button)
   - Label: "Decide later"
   - Description: "Leave unresolved for now"

**Navigation:**
- "Previous" button (if not first conflict)
- "Next" button (if not last conflict)
- "Apply all as [selected action]" button (for batch resolution)
- "Cancel" button (return to main modal)

### Step 3: Resolution Summary Modal
Shows final sync result after per-record resolution:

**Summary:**
- X conflicts resolved
- Y conflicts skipped (unresolved)
- Z records uploaded
- N records downloaded

**Unresolved Conflicts Warning:**
- "Y conflicts remain unresolved"
- "You can resolve these later from Settings"

**Actions:**
- "Continue" button (proceed with resolved conflicts only)
- "Go back" button (return to conflict review)

## Implementation Plan

### Backend Functions

#### 1. `resolveSingleConflict(conflict, resolution, userId)`
```javascript
async resolveSingleConflict(conflict, resolution, userId) {
  switch (resolution) {
    case 'keep-local':
      await this.uploadSingleFillup(conflict.local, userId);
      break;
    case 'keep-cloud':
      this.downloadSingleFillup(conflict.cloud);
      break;
    case 'merge-auto':
      const merged = this.mergeRecords(conflict.local, conflict.cloud);
      await this.uploadSingleFillup(merged, userId);
      this.downloadSingleFillup(merged);
      break;
    case 'respect-delete':
      await this.deleteFillupFromCloud(conflict.local, userId);
      this.deleteFillupFromLocal(conflict.local);
      break;
    case 'skip':
      // Store unresolved conflict for later
      this.storeUnresolvedConflict(conflict);
      break;
  }
}
```

#### 2. `mergeRecords(local, cloud)`
```javascript
mergeRecords(local, cloud) {
  const merged = { ...local };
  const localTime = new Date(local.updatedAt || local.timestamp).getTime();
  const cloudTime = new Date(cloud.updated_at || cloud.created_at).getTime();
  
  // For each field, use the version with later timestamp
  const fields = ['odometer', 'liters', 'pricePerLiter', 'totalCost', 'station', 'notes', 'fullTank'];
  
  fields.forEach(field => {
    const localField = this.mapFieldToCloud(field, local[field]);
    const cloudField = cloud[this.mapFieldToCloudName(field)];
    
    if (localField !== cloudField) {
      merged[field] = localTime > cloudTime ? local[field] : this.mapFieldToLocal(field, cloudField);
    }
  });
  
  // Set updated_at to the later timestamp
  merged.updatedAt = localTime > cloudTime ? local.updatedAt : cloud.updated_at;
  
  return merged;
}
```

#### 3. `storeUnresolvedConflict(conflict)`
```javascript
storeUnresolvedConflict(conflict) {
  const unresolved = JSON.parse(localStorage.getItem('fueltracker-unresolved-conflicts') || '[]');
  unresolved.push({
    id: conflict.id,
    type: conflict.type,
    local: conflict.local,
    cloud: conflict.cloud,
    detectedAt: new Date().toISOString()
  });
  localStorage.setItem('fueltracker-unresolved-conflicts', JSON.stringify(unresolved));
}
```

#### 4. `getUnresolvedConflicts()`
```javascript
getUnresolvedConflicts() {
  return JSON.parse(localStorage.getItem('fueltracker-unresolved-conflicts') || '[]');
}
```

### UI Components

#### 1. ConflictReviewModal.jsx
New component for per-record conflict resolution.

**Props:**
- `conflicts`: Array of conflict objects
- `onResolve`: Function called when conflicts are resolved
- `onCancel`: Function called when user cancels

**State:**
- `currentIndex`: Current conflict being reviewed
- `resolutions`: Map of conflict ID to resolution action
- `batchResolution`: Selected batch resolution action

**Key Features:**
- Side-by-side comparison view
- Field-by-field diff table
- Resolution action buttons
- Navigation between conflicts
- Batch resolution option

#### 2. ConflictComparisonView.jsx
Sub-component for displaying side-by-side comparison.

**Props:**
- `local`: Local record data
- `cloud`: Cloud record data
- `fieldDifferences`: Map of differing fields

**Features:**
- Highlighted differences
- Timestamp comparison
- Winner indication

#### 3. FieldDiffTable.jsx
Sub-component for displaying field-by-field differences.

**Props:**
- `fieldDifferences`: Map of field differences
- `localUpdated`: Local timestamp
- `cloudUpdated`: Cloud timestamp

**Features:**
- Table format
- Color-coded winners
- Timestamp comparison per field

## Integration with Existing Flow

### Modified Flow

1. **Initial sync detection** → Shows DataMigrationModal with diff summary
2. **User clicks "Sync both sides"** → If conflicts exist, show "Review conflicts" button
3. **User clicks "Review conflicts"** → Open ConflictReviewModal
4. **User resolves conflicts** → Apply resolutions
5. **Apply remaining sync** → Continue with non-conflict records
6. **Show result summary** → Include resolved and unresolved counts

### Modified continueSyncAfterDecision

```javascript
async continueSyncAfterDecision(userId, decision) {
  // ... existing code ...
  
  switch (decision) {
    case 'merge':
      // Compute diff first
      const diff = this.computeFillupDiff(localFillups, cloudFillups);
      
      // Check if there are conflicts that need user resolution
      if (diff.bothChanged.length > 0) {
        // Return conflicts for UI to handle
        return {
          success: true,
          action: 'merge',
          needsResolution: true,
          conflicts: diff.bothChanged,
          nonConflicts: {
            localOnly: diff.localOnly,
            cloudOnly: diff.cloudOnly,
            localDeleted: diff.localDeleted,
            cloudDeleted: diff.cloudDeleted
          }
        };
      }
      
      // No conflicts, proceed with automatic sync
      const mergeResult = await this.syncBothSides(userId);
      // ... existing code ...
      break;
  }
}
```

### New Function: applyResolutions

```javascript
async applyResolutions(resolutions, nonConflicts, userId) {
  const result = {
    resolved: 0,
    skipped: 0,
    uploaded: 0,
    downloaded: 0,
    errors: []
  };
  
  try {
    // Apply per-record resolutions
    for (const [conflictId, resolution] of Object.entries(resolutions)) {
      const conflict = this.findConflictById(conflictId);
      if (resolution === 'skip') {
        result.skipped++;
        this.storeUnresolvedConflict(conflict);
      } else {
        await this.resolveSingleConflict(conflict, resolution, userId);
        result.resolved++;
      }
    }
    
    // Apply non-conflict changes automatically
    const autoDiff = {
      localOnly: nonConflicts.localOnly,
      cloudOnly: nonConflicts.cloudOnly,
      localDeleted: nonConflicts.localDeleted,
      cloudDeleted: nonConflicts.cloudDeleted,
      bothChanged: [] // Already handled
    };
    
    const applyResult = await this.applyFillupDiff(autoDiff, 'sync-both', userId);
    result.uploaded += applyResult.uploaded;
    result.downloaded += applyResult.downloaded;
    
  } catch (error) {
    result.errors.push(error.message);
  }
  
  return result;
}
```

## Conflict Policy

### Default Behavior (No User Intervention)
- **Last writer wins** based on updated_at
- **Deletions propagate** (delete wins over edit)
- **No per-field merging** (entire record wins)

### With User Intervention
- **User chooses per-record resolution**
- **Batch resolution available** (apply same action to all)
- **Skip for deferral** (store unresolved for later)
- **Merge option** (intelligent field-level merging)

### Unresolved Conflicts
- **Persisted in localStorage**
- **Can be resolved later from Settings**
- **Warning shown on startup if unresolved exist**
- **Background sync skips unresolved conflicts**

## Known Limitations

1. **Fill-ups only initially** - Extend to other entities later
2. **No automatic conflict prevention** - Only detection and resolution
3. **No offline conflict queue** - Must be online to resolve
4. **Merge is simple** - Last writer wins per field, no semantic merging
5. **No conflict history** - Only current state tracked
6. **No rollback** - Once applied, cannot undo resolution
