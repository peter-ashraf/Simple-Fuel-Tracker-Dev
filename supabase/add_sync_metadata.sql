-- Add Sync Metadata for Robust Conflict Detection
-- This script adds updated_at and stable_key to enable proper diff/reconciliation

-- Helper function to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

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

-- Add stable_key to maintenance
ALTER TABLE maintenance ADD COLUMN IF NOT EXISTS stable_key TEXT;
ALTER TABLE maintenance ADD CONSTRAINT maintenance_user_id_stable_key_unique UNIQUE (user_id, stable_key);
CREATE INDEX IF NOT EXISTS idx_maintenance_stable_key ON maintenance(stable_key);

-- Add stable_key to trip_estimates
ALTER TABLE trip_estimates ADD COLUMN IF NOT EXISTS stable_key TEXT;
ALTER TABLE trip_estimates ADD CONSTRAINT trip_estimates_user_id_stable_key_unique UNIQUE (user_id, stable_key);
CREATE INDEX IF NOT EXISTS idx_trip_estimates_stable_key ON trip_estimates(stable_key);

-- Add version field for optimistic concurrency (optional but recommended)
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE fillups ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE maintenance ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;
ALTER TABLE trip_estimates ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Create indexes on updated_at for sorting and conflict detection
CREATE INDEX IF NOT EXISTS idx_vehicles_updated_at ON vehicles(updated_at);
CREATE INDEX IF NOT EXISTS idx_fillups_updated_at ON fillups(updated_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_updated_at ON maintenance(updated_at);
CREATE INDEX IF NOT EXISTS idx_trip_estimates_updated_at ON trip_estimates(updated_at);
