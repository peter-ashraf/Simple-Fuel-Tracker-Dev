# Sync Redesign - Validation Checklist

## Database Validation (Supabase)

### Fill-ups Table Schema
- [ ] Confirm `fillups.stable_key` column exists
  - Run: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'fillups' AND column_name = 'stable_key';`
  - Expected: TEXT column exists

- [ ] Confirm `fillups.updated_at` column exists
  - Run: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'fillups' AND column_name = 'updated_at';`
  - Expected: TIMESTAMPTZ column exists
  - **BLOCKING:** This column does not exist until add_sync_metadata.sql is applied

- [ ] Confirm `fillups.deleted_at` column exists
  - Run: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'fillups' AND column_name = 'deleted_at';`
  - Expected: TIMESTAMPTZ column exists

- [ ] Confirm unique constraint on (user_id, stable_key)
  - Run: `SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'fillups' AND constraint_name = 'fillups_user_id_stable_key_unique';`
  - Expected: Constraint exists

- [ ] Confirm index on stable_key
  - Run: `SELECT indexname FROM pg_indexes WHERE tablename = 'fillups' AND indexname = 'idx_fillups_stable_key';`
  - Expected: Index exists

- [ ] Confirm index on deleted_at
  - Run: `SELECT indexname FROM pg_indexes WHERE tablename = 'fillups' AND indexname = 'idx_fillups_deleted_at';`
  - Expected: Index exists

- [ ] Confirm index on updated_at (after migration)
  - Run: `SELECT indexname FROM pg_indexes WHERE tablename = 'fillups' AND indexname = 'idx_fillups_updated_at';`
  - Expected: Index exists after migration

- [ ] Confirm trigger to auto-update updated_at (after migration)
  - Run: `SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'fillups' AND trigger_name = 'update_fillups_updated_at';`
  - Expected: Trigger exists after migration

### RLS Policies
- [ ] Confirm RLS policy excludes deleted records
  - Run: Check policy definition for "Users can view their own fillups"
  - Expected: `USING (auth.uid() = user_id AND deleted_at IS NULL)`

- [ ] Confirm RLS policy allows tombstone updates
  - Run: Check policy definition for "Users can update their own fillups"
  - Expected: Allows setting deleted_at

## Local Data Validation

### Local Storage Schema
- [ ] Confirm existing local fill-ups have stableKey
  - Check: `JSON.parse(localStorage.getItem('fueltracker-fillups-v2')).every(f => f.stableKey)`
  - Expected: All fill-ups have stableKey

- [ ] Confirm existing local fill-ups have deletedAt
  - Check: `JSON.parse(localStorage.getItem('fueltracker-fillups-v2')).every(f => f.deletedAt !== undefined)`
  - Expected: All fill-ups have deletedAt (may be null)

- [ ] Confirm existing local fill-ups have updatedAt
  - Check: `JSON.parse(localStorage.getItem('fueltracker-fillups-v2')).every(f => f.updatedAt !== undefined)`
  - Expected: **BLOCKING:** All fill-ups should have updatedAt after backfill

- [ ] Confirm new fill-ups include updatedAt
  - Check: Code that creates fill-ups sets updatedAt
  - Expected: New fill-ups have updatedAt set to current timestamp

### Data Integrity
- [ ] Confirm no duplicate stableKeys for same user
  - Check: `JSON.parse(localStorage.getItem('fueltracker-fillups-v2')).reduce((acc, f) => { acc[f.stableKey] = (acc[f.stableKey] || 0) + 1; return acc; }, {})`
  - Expected: No stableKey has count > 1

- [ ] Confirm stableKeys are properly formatted
  - Check: All stableKeys are non-empty strings
  - Expected: All stableKeys are valid

## Metadata Backfill Requirements

### Cloud Data Backfill
- [ ] Backfill updated_at for existing cloud fill-ups
  - SQL: `UPDATE fillups SET updated_at = created_at WHERE updated_at IS NULL;`
  - Expected: All cloud fill-ups have updated_at set

- [ ] Backfill stable_key for existing cloud fill-ups (if missing)
  - SQL: Generate stable_key from existing data if missing
  - Expected: All cloud fill-ups have stable_key set

### Local Data Backfill
- [ ] Backfill updatedAt for existing local fill-ups
  - Code: Migration script to add updatedAt based on timestamp
  - Expected: All local fill-ups have updatedAt set

- [ ] Backfill stableKey for existing local fill-ups (if missing)
  - Code: Migration script to generate stableKey
  - Expected: All local fill-ups have stableKey set

## Integration Validation

### Sync Service
- [ ] Confirm computeFillupDiff handles missing updatedAt gracefully
  - Test: Pass fill-ups without updatedAt
  - Expected: Falls back to timestamp, logs warning

- [ ] Confirm applyFillupDiff handles errors gracefully
  - Test: Simulate network error during upload
  - Expected: Error caught, returned in result.errors

- [ ] ConflictReviewModal renders correctly
  - Test: Open modal with conflicts
  - Expected: No console errors, UI displays correctly

### Modal Integration
- [ ] DataMigrationModal passes userId to ConflictReviewModal
  - Check: Props include userId
  - Expected: userId is passed correctly

- [ ] DataMigrationModal handles needsResolution response
  - Test: Trigger sync with conflicts
  - Expected: ConflictReviewModal opens

## Pre-Expansion Validation (Before Vehicles/Maintenance/Trips)

### Block Expansion Until:
- [ ] All database validation checks pass
- [ ] All local data validation checks pass
- [ ] Metadata backfill is complete for fill-ups
- [ ] End-to-end testing passes for all fill-up scenarios
- [ ] LWW limitations are documented and accepted
- [ ] Conflict policy is documented and implemented

### Fill-Up Scenarios to Validate
- [ ] Scenario A: Local-only create
- [ ] Scenario B: Local-only delete
- [ ] Scenario C: Cloud-only record
- [ ] Scenario D: Both edited same record
- [ ] Scenario E: Edit vs delete conflict
- [ ] Scenario F: Equal counts, different content

## Current Status

### Database Status
- **stable_key:** EXISTS (from add_identity_sync_schema.sql)
- **deleted_at:** EXISTS (from add_identity_sync_schema.sql)
- **updated_at:** MISSING (add_sync_metadata.sql NOT APPLIED)
- **Indexes:** Partial (missing updated_at index)
- **Triggers:** Missing (updated_at trigger not created)

### Local Data Status
- **stableKey:** EXISTS (for fill-ups)
- **deletedAt:** EXISTS (for fill-ups)
- **updatedAt:** MISSING (not backfilled)
- **Data integrity:** Unknown (needs validation)

### Migration Status
- **SQL migration written:** YES (add_sync_metadata.sql)
- **SQL migration applied:** NO
- **Local backfill script:** NOT WRITTEN
- **Local backfill applied:** NO

### Validation Status
- **Database validation:** NOT PERFORMED
- **Local data validation:** NOT PERFORMED
- **End-to-end testing:** NOT PERFORMED
- **Integration testing:** NOT PERFORMED

## Blocking Issues

1. **updated_at column missing in database** - SQL migration not applied
2. **updated_at field missing in local storage** - Backfill not performed
3. **No validation performed** - Database and local data not verified
4. **No end-to-end testing** - Sync scenarios not tested

## Next Steps

1. Apply SQL migration to Supabase
2. Backfill updated_at in cloud database
3. Backfill updatedAt in local storage
4. Perform database validation
5. Perform local data validation
6. Perform end-to-end testing for fill-up scenarios
7. Only then: extend to other entities
