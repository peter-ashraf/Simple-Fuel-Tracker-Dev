-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Vehicles table
CREATE TABLE vehicles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  make TEXT,
  model TEXT,
  year INTEGER,
  fuel_type TEXT,
  tank_capacity NUMERIC,
  license_plate TEXT,
  tyre_width INTEGER,
  tyre_ratio INTEGER,
  tyre_rim INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fillups table
CREATE TABLE fillups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  odometer NUMERIC NOT NULL,
  liters NUMERIC NOT NULL,
  price_per_liter NUMERIC NOT NULL,
  total_cost NUMERIC NOT NULL,
  station TEXT,
  notes TEXT,
  full_tank BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Maintenance table
CREATE TABLE maintenance (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT,
  description TEXT,
  cost NUMERIC,
  odometer NUMERIC,
  next_due_date DATE,
  next_due_odometer NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prices table
CREATE TABLE prices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  station TEXT,
  fuel_type TEXT,
  price NUMERIC NOT NULL,
  location TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trip estimates table
CREATE TABLE trip_estimates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  name TEXT,
  distance NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- App settings table
CREATE TABLE app_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  settings_json JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE fillups ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for vehicles
CREATE POLICY "Users can view their own vehicles" ON vehicles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own vehicles" ON vehicles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own vehicles" ON vehicles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own vehicles" ON vehicles
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for fillups
CREATE POLICY "Users can view their own fillups" ON fillups
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own fillups" ON fillups
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own fillups" ON fillups
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own fillups" ON fillups
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for maintenance
CREATE POLICY "Users can view their own maintenance" ON maintenance
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own maintenance" ON maintenance
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own maintenance" ON maintenance
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own maintenance" ON maintenance
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for prices
CREATE POLICY "Users can view their own prices" ON prices
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own prices" ON prices
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own prices" ON prices
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own prices" ON prices
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for trip_estimates
CREATE POLICY "Users can view their own trip_estimates" ON trip_estimates
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trip_estimates" ON trip_estimates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trip_estimates" ON trip_estimates
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trip_estimates" ON trip_estimates
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for app_settings
CREATE POLICY "Users can view their own app_settings" ON app_settings
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own app_settings" ON app_settings
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own app_settings" ON app_settings
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own app_settings" ON app_settings
  FOR DELETE USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_vehicles_user_id ON vehicles(user_id);
CREATE INDEX idx_fillups_user_id ON fillups(user_id);
CREATE INDEX idx_fillups_vehicle_id ON fillups(vehicle_id);
CREATE INDEX idx_fillups_date ON fillups(date);
CREATE INDEX idx_maintenance_user_id ON maintenance(user_id);
CREATE INDEX idx_maintenance_vehicle_id ON maintenance(vehicle_id);
CREATE INDEX idx_prices_user_id ON prices(user_id);
CREATE INDEX idx_trip_estimates_user_id ON trip_estimates(user_id);
CREATE INDEX idx_app_settings_user_id ON app_settings(user_id);
