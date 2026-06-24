-- Fix Fuel Tracker RLS Policies
-- This script ensures proper Row Level Security for Fuel Tracker tables
-- Users can only access their own data (user_id = auth.uid())

-- Enable RLS on all tables
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fillups ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (idempotent)
DROP POLICY IF EXISTS "Users can view own vehicles" ON vehicles;
DROP POLICY IF EXISTS "Users can insert own vehicles" ON vehicles;
DROP POLICY IF EXISTS "Users can update own vehicles" ON vehicles;
DROP POLICY IF EXISTS "Users can delete own vehicles" ON vehicles;

DROP POLICY IF EXISTS "Users can view own fillups" ON fillups;
DROP POLICY IF EXISTS "Users can insert own fillups" ON fillups;
DROP POLICY IF EXISTS "Users can update own fillups" ON fillups;
DROP POLICY IF EXISTS "Users can delete own fillups" ON fillups;

DROP POLICY IF EXISTS "Users can view own maintenance" ON maintenance;
DROP POLICY IF EXISTS "Users can insert own maintenance" ON maintenance;
DROP POLICY IF EXISTS "Users can update own maintenance" ON maintenance;
DROP POLICY IF EXISTS "Users can delete own maintenance" ON maintenance;

DROP POLICY IF EXISTS "Users can view own trip_estimates" ON trip_estimates;
DROP POLICY IF EXISTS "Users can insert own trip_estimates" ON trip_estimates;
DROP POLICY IF EXISTS "Users can update own trip_estimates" ON trip_estimates;
DROP POLICY IF EXISTS "Users can delete own trip_estimates" ON trip_estimates;

DROP POLICY IF EXISTS "Users can view own app_settings" ON app_settings;
DROP POLICY IF EXISTS "Users can insert own app_settings" ON app_settings;
DROP POLICY IF EXISTS "Users can update own app_settings" ON app_settings;
DROP POLICY IF EXISTS "Users can delete own app_settings" ON app_settings;

DROP POLICY IF EXISTS "Users can view own prices" ON prices;
DROP POLICY IF EXISTS "Users can insert own prices" ON prices;
DROP POLICY IF EXISTS "Users can update own prices" ON prices;
DROP POLICY IF EXISTS "Users can delete own prices" ON prices;

-- Create policies for vehicles table
CREATE POLICY "Users can view own vehicles"
ON vehicles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own vehicles"
ON vehicles FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own vehicles"
ON vehicles FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own vehicles"
ON vehicles FOR DELETE
USING (auth.uid() = user_id);

-- Create policies for fillups table
CREATE POLICY "Users can view own fillups"
ON fillups FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own fillups"
ON fillups FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own fillups"
ON fillups FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own fillups"
ON fillups FOR DELETE
USING (auth.uid() = user_id);

-- Create policies for maintenance table
CREATE POLICY "Users can view own maintenance"
ON maintenance FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own maintenance"
ON maintenance FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own maintenance"
ON maintenance FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own maintenance"
ON maintenance FOR DELETE
USING (auth.uid() = user_id);

-- Create policies for trip_estimates table
CREATE POLICY "Users can view own trip_estimates"
ON trip_estimates FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own trip_estimates"
ON trip_estimates FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own trip_estimates"
ON trip_estimates FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own trip_estimates"
ON trip_estimates FOR DELETE
USING (auth.uid() = user_id);

-- Create policies for app_settings table
CREATE POLICY "Users can view own app_settings"
ON app_settings FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own app_settings"
ON app_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own app_settings"
ON app_settings FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own app_settings"
ON app_settings FOR DELETE
USING (auth.uid() = user_id);

-- Create policies for prices table
CREATE POLICY "Users can view own prices"
ON prices FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own prices"
ON prices FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own prices"
ON prices FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own prices"
ON prices FOR DELETE
USING (auth.uid() = user_id);
