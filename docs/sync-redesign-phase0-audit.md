# Sync Conflict Flow Redesign - Phase 0: Schema Audit

## Scope Definition
**First delivery scope:** Fill-ups first, then extend to vehicles, maintenance, and trip estimates.

## Current Synced Entities Metadata Audit

### Vehicles
| Field | Status | Notes |
|-------|--------|-------|
| stable_key | ✓ EXISTS | Added via add_identity_sync_schema.sql, unique constraint on (user_id, stable_key) |
| updated_at | ✗ MISSING | Not present in schema |
| deleted_at | ✓ EXISTS | Added via add_identity_sync_schema.sql, TIMESTAMPTZ |
| version/timestamp | ✗ MISSING | No version field for conflict detection |

**Current schema:** id, user_id, name, make, model, year, fuel_type, tank_capacity, license_plate, created_at, stable_key, deleted_at

### Fill-ups
| Field | Status | Notes |
|-------|--------|-------|
| stable_key | ✓ EXISTS | Added via add_identity_sync_schema.sql, unique constraint on (user_id, stable_key) |
| updated_at | ✗ MISSING | Not present in schema |
| deleted_at | ✓ EXISTS | Added via add_identity_sync_schema.sql, TIMESTAMPTZ |
| version/timestamp | ✗ MISSING | No version field for conflict detection |

**Current schema:** id, user_id, vehicle_id, date, odometer, liters, price_per_liter, total_cost, station, notes, full_tank, created_at, stable_key, deleted_at

### Maintenance
| Field | Status | Notes |
|-------|--------|-------|
| stable_key | ✗ MISSING | Not added to maintenance table |
| updated_at | ✗ MISSING | Not present in schema |
| deleted_at | ✓ EXISTS | Added via add_identity_sync_schema.sql, TIMESTAMPTZ |
| version/timestamp | ✗ MISSING | No version field for conflict detection |

**Current schema:** id, user_id, vehicle_id, date, type, description, cost, odometer, next_due_date, next_due_odometer, created_at, deleted_at

### Trip Estimates
| Field | Status | Notes |
|-------|--------|-------|
| stable_key | ✗ MISSING | Not added to trip_estimates table |
| updated_at | ✗ MISSING | Not present in schema |
| deleted_at | ✓ EXISTS | Added via add_identity_sync_schema.sql, TIMESTAMPTZ |
| version/timestamp | ✗ MISSING | No version field for conflict detection |

**Current schema:** id, user_id, vehicle_id, name, distance, notes, created_at, deleted_at

## Schema Gaps and Required Migrations

### Critical Gaps (Blockers for robust sync)
1. **Missing updated_at on all entities** - Required for conflict detection and "last writer wins" logic
2. **Missing stable_key on maintenance, trip_estimates** - Required for identity matching across devices
3. **No version field** - Required for optimistic concurrency control

### Recommended Schema Migrations

#### Migration 1: Add updated_at to all sync entities
```sql
-- Add updated_at to vehicles
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add updated_at to fillups
ALTER TABLE fillups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE TRIGGER update_fillups_updated_at BEFORE UPDATE ON fillups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add updated_at to maintenance
ALTER TABLE maintenance ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE TRIGGER update_maintenance_updated_at BEFORE UPDATE ON maintenance
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add updated_at to trip_estimates
ALTER TABLE trip_estimates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
CREATE TRIGGER update_trip_estimates_updated_at BEFORE UPDATE ON trip_estimates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

#### Migration 2: Add stable_key to maintenance and trip_estimates
```sql
-- Add stable_key to maintenance
ALTER TABLE maintenance ADD COLUMN IF NOT EXISTS stable_key TEXT;
ALTER TABLE maintenance ADD CONSTRAINT maintenance_user_id_stable_key_unique UNIQUE (user_id, stable_key);
CREATE INDEX IF NOT EXISTS idx_maintenance_stable_key ON maintenance(stable_key);

-- Add stable_key to trip_estimates
ALTER TABLE trip_estimates ADD COLUMN IF NOT EXISTS stable_key TEXT;
ALTER TABLE trip_estimates ADD CONSTRAINT trip_estimates_user_id_stable_key_unique UNIQUE (user_id, stable_key);
CREATE INDEX IF NOT EXISTS idx_trip_estimates_stable_key ON trip_estimates(stable_key);
```

#### Migration 3: Add version field for optimistic concurrency (optional but recommended)
```sql
-- Add version to vehicles
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Add version to fillups
ALTER TABLE fillups ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Add version to maintenance
ALTER TABLE maintenance ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Add version to trip_estimates
ALTER TABLE trip_estimates ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
```

## Prerequisite Helper Function
```sql
-- Helper function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';
```

## Local Storage Schema Audit

### Local Storage Keys
- `fueltracker-vehicles-v2`: vehicles array
- `fueltracker-fillups-v2`: fillups array
- `fueltracker-maintenance-entries-v3`: maintenance entries array
- `fueltracker-trip-estimates-v2`: trip estimates array

### Local Record Structure (needs updated_at and stable_key)
Current local records have:
- Basic fields (name, date, odometer, etc.)
- `timestamp` or `createdAt` for creation time
- `deletedAt` for tombstone deletion
- `stableKey` for vehicles and fillups only

**Gaps:**
- No `updatedAt` field in local storage
- No `stableKey` for maintenance and trip estimates
- No `version` field in local storage

## Summary

**Critical blockers for robust sync:**
1. Add `updated_at` to all 4 entities (vehicles, fillups, maintenance, trip_estimates)
2. Add `stable_key` to maintenance and trip_estimates
3. Add `updated_at` to local storage records
4. Add `stableKey` to local storage for maintenance and trip estimates

**Recommended implementation order:**
1. Apply database migrations (updated_at, stable_key)
2. Update local storage schema to include updated_at and stableKey
3. Backfill stable_key for existing records
4. Implement diff/reconciliation logic
5. Update UI with conflict resolution
