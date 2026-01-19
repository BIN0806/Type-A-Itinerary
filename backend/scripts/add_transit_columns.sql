-- Add travel_mode and route_segments columns to trips table
-- Run this migration if you have an existing database

-- Add travel_mode column
ALTER TABLE trips ADD COLUMN IF NOT EXISTS travel_mode VARCHAR(20) DEFAULT 'walking';

-- Add route_segments column (JSONB for transit route info)
ALTER TABLE trips ADD COLUMN IF NOT EXISTS route_segments JSONB;

-- Verify columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'trips' 
AND column_name IN ('travel_mode', 'route_segments');
