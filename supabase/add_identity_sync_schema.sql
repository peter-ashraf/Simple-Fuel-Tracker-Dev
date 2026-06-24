-- Add Stable Identity and Sync Schema for Fuel Tracker
-- This script adds stable_key for vehicle and fillup identity and deleted_at for tombstone deletion tracking

-- Add stable_key column to vehicles table
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS stable_key TEXT;

-- Add unique constraint on (user_id, stable_key) for vehicles
-- This allows upsert to match vehicles by stable identity instead of regenerated UUIDs
ALTER TABLE vehicles ADD CONSTRAINT vehicles_user_id_stable_key_unique UNIQUE (user_id, stable_key);

-- Create index on stable_key for faster lookups
CREATE INDEX IF NOT EXISTS idx_vehicles_stable_key ON vehicles(stable_key);

-- Add stable_key column to fillups table
ALTER TABLE fillups ADD COLUMN IF NOT EXISTS stable_key TEXT;

-- Add unique constraint on (user_id, stable_key) for fillups
-- This allows upsert to match fillups by stable identity instead of regenerated UUIDs
ALTER TABLE fillups ADD CONSTRAINT fillups_user_id_stable_key_unique UNIQUE (user_id, stable_key);

-- Create index on stable_key for faster lookups
CREATE INDEX IF NOT EXISTS idx_fillups_stable_key ON fillups(stable_key);

-- Add deleted_at tombstone column to all tables
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE fillups ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE maintenance ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE trip_estimates ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Create indexes on deleted_at for filtering out deleted records
CREATE INDEX IF NOT EXISTS idx_vehicles_deleted_at ON vehicles(deleted_at);
CREATE INDEX IF NOT EXISTS idx_fillups_deleted_at ON fillups(deleted_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_deleted_at ON maintenance(deleted_at);
CREATE INDEX IF NOT EXISTS idx_trip_estimates_deleted_at ON trip_estimates(deleted_at);

-- Update RLS policies to exclude deleted records from normal queries
-- Vehicles
DROP POLICY IF EXISTS "Users can view their own vehicles" ON vehicles;
CREATE POLICY "Users can view their own vehicles" ON vehicles
  FOR SELECT USING (auth.uid() = user_id AND deleted_at IS NULL);

-- Fillups
DROP POLICY IF EXISTS "Users can view their own fillups" ON fillups;
CREATE POLICY "Users can view their own fillups" ON fillups
  FOR SELECT USING (auth.uid() = user_id AND deleted_at IS NULL);

-- Maintenance
DROP POLICY IF EXISTS "Users can view their own maintenance" ON maintenance;
CREATE POLICY "Users can view their own maintenance" ON maintenance
  FOR SELECT USING (auth.uid() = user_id AND deleted_at IS NULL);

-- Trip estimates
DROP POLICY IF EXISTS "Users can view their own trip_estimates" ON trip_estimates;
CREATE POLICY "Users can view their own trip_estimates" ON trip_estimates
  FOR SELECT USING (auth.uid() = user_id AND deleted_at IS NULL);

-- Note: Update/Insert/Delete policies remain the same but should set deleted_at appropriately
