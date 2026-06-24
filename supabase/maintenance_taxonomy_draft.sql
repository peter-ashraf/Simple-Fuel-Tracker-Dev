-- Draft only: maintenance taxonomy cloud schema.
-- Do not apply until the app code is ready to migrate/sync taxonomy records.
-- Existing table note:
--   public.maintenance already exists and stores maintenance entries.
--   It already has id, user_id, vehicle_id, date, type, description, cost,
--   odometer, next_due_date, next_due_odometer, created_at, deleted_at,
--   updated_at, stable_key, and version.
--   This draft does NOT recreate public.maintenance.
--
-- Intended taxonomy scope:
--   Vehicle-scoped maintenance systems and subcategories.
--   The app now uploads taxonomy with the active vehicle UUID in vehicle_id.
--   Legacy/user-level rows with vehicle_id NULL can be converted by the app
--   when their stable_key is uploaded for the active vehicle.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.maintenance_systems (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id UUID NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,

  stable_key TEXT NOT NULL,
  type_key TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NULL,
  color TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,

  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,

  CONSTRAINT maintenance_systems_stable_key_not_blank CHECK (length(trim(stable_key)) > 0),
  CONSTRAINT maintenance_systems_type_key_not_blank CHECK (length(trim(type_key)) > 0)
);

CREATE TABLE IF NOT EXISTS public.maintenance_subcategories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id UUID NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,

  system_id UUID NULL REFERENCES public.maintenance_systems(id) ON DELETE SET NULL,
  system_stable_key TEXT NULL,

  stable_key TEXT NOT NULL,
  type_key TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NULL,
  color TEXT NULL,
  default_distance NUMERIC NULL,
  default_safety NUMERIC NULL,
  default_notes TEXT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,

  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,

  CONSTRAINT maintenance_subcategories_stable_key_not_blank CHECK (length(trim(stable_key)) > 0),
  CONSTRAINT maintenance_subcategories_type_key_not_blank CHECK (length(trim(type_key)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_systems_user_global_stable_unique
  ON public.maintenance_systems(user_id, stable_key)
  WHERE vehicle_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_systems_user_vehicle_stable_unique
  ON public.maintenance_systems(user_id, vehicle_id, stable_key)
  WHERE vehicle_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_systems_user_global_type_unique
  ON public.maintenance_systems(user_id, type_key)
  WHERE vehicle_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_systems_user_vehicle_type_unique
  ON public.maintenance_systems(user_id, vehicle_id, type_key)
  WHERE vehicle_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_subcategories_user_global_stable_unique
  ON public.maintenance_subcategories(user_id, stable_key)
  WHERE vehicle_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_subcategories_user_vehicle_stable_unique
  ON public.maintenance_subcategories(user_id, vehicle_id, stable_key)
  WHERE vehicle_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_subcategories_user_global_type_unique
  ON public.maintenance_subcategories(user_id, COALESCE(system_stable_key, ''), type_key)
  WHERE vehicle_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_subcategories_user_vehicle_type_unique
  ON public.maintenance_subcategories(user_id, vehicle_id, COALESCE(system_stable_key, ''), type_key)
  WHERE vehicle_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_systems_user_vehicle
  ON public.maintenance_systems(user_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_systems_stable_key
  ON public.maintenance_systems(stable_key);
CREATE INDEX IF NOT EXISTS idx_maintenance_systems_type_key
  ON public.maintenance_systems(type_key);
CREATE INDEX IF NOT EXISTS idx_maintenance_systems_deleted_at
  ON public.maintenance_systems(deleted_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_systems_updated_at
  ON public.maintenance_systems(updated_at);

CREATE INDEX IF NOT EXISTS idx_maintenance_subcategories_user_vehicle
  ON public.maintenance_subcategories(user_id, vehicle_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_subcategories_system_stable_key
  ON public.maintenance_subcategories(system_stable_key);
CREATE INDEX IF NOT EXISTS idx_maintenance_subcategories_stable_key
  ON public.maintenance_subcategories(stable_key);
CREATE INDEX IF NOT EXISTS idx_maintenance_subcategories_type_key
  ON public.maintenance_subcategories(type_key);
CREATE INDEX IF NOT EXISTS idx_maintenance_subcategories_deleted_at
  ON public.maintenance_subcategories(deleted_at);
CREATE INDEX IF NOT EXISTS idx_maintenance_subcategories_updated_at
  ON public.maintenance_subcategories(updated_at);

CREATE OR REPLACE FUNCTION public.update_maintenance_taxonomy_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.version = COALESCE(OLD.version, 0) + 1;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_maintenance_systems_updated_at ON public.maintenance_systems;
CREATE TRIGGER update_maintenance_systems_updated_at
  BEFORE UPDATE ON public.maintenance_systems
  FOR EACH ROW EXECUTE FUNCTION public.update_maintenance_taxonomy_updated_at();

DROP TRIGGER IF EXISTS update_maintenance_subcategories_updated_at ON public.maintenance_subcategories;
CREATE TRIGGER update_maintenance_subcategories_updated_at
  BEFORE UPDATE ON public.maintenance_subcategories
  FOR EACH ROW EXECUTE FUNCTION public.update_maintenance_taxonomy_updated_at();

ALTER TABLE public.maintenance_systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_subcategories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own maintenance systems" ON public.maintenance_systems;
CREATE POLICY "Users can view their own maintenance systems" ON public.maintenance_systems
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own maintenance systems" ON public.maintenance_systems;
CREATE POLICY "Users can insert their own maintenance systems" ON public.maintenance_systems
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own maintenance systems" ON public.maintenance_systems;
CREATE POLICY "Users can update their own maintenance systems" ON public.maintenance_systems
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own maintenance systems" ON public.maintenance_systems;
CREATE POLICY "Users can delete their own maintenance systems" ON public.maintenance_systems
  FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view their own maintenance subcategories" ON public.maintenance_subcategories;
CREATE POLICY "Users can view their own maintenance subcategories" ON public.maintenance_subcategories
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own maintenance subcategories" ON public.maintenance_subcategories;
CREATE POLICY "Users can insert their own maintenance subcategories" ON public.maintenance_subcategories
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own maintenance subcategories" ON public.maintenance_subcategories;
CREATE POLICY "Users can update their own maintenance subcategories" ON public.maintenance_subcategories
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own maintenance subcategories" ON public.maintenance_subcategories;
CREATE POLICY "Users can delete their own maintenance subcategories" ON public.maintenance_subcategories
  FOR DELETE USING (auth.uid() = user_id);

-- Optional entry-link columns for the existing public.maintenance table.
-- Apply only with matching app code after taxonomy rows are synced.
-- These columns are not required for the first taxonomy-table migration if
-- maintenance.type continues to carry the readable subcategory type key.
ALTER TABLE public.maintenance ADD COLUMN IF NOT EXISTS subcategory_stable_key TEXT NULL;
ALTER TABLE public.maintenance ADD COLUMN IF NOT EXISTS subcategory_type_key TEXT NULL;
ALTER TABLE public.maintenance ADD COLUMN IF NOT EXISTS system_stable_key TEXT NULL;
ALTER TABLE public.maintenance ADD COLUMN IF NOT EXISTS subcategory_name_snapshot TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_subcategory_stable_key
  ON public.maintenance(subcategory_stable_key);
CREATE INDEX IF NOT EXISTS idx_maintenance_subcategory_type_key
  ON public.maintenance(subcategory_type_key);
CREATE INDEX IF NOT EXISTS idx_maintenance_system_stable_key
  ON public.maintenance(system_stable_key);
