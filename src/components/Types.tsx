// types.ts - Add these fields to your Photo interface

export interface Photo {
  id: string;
  lot_id: string;
  file_path: string;
  file_name: string;
  is_primary: boolean;
  created_at: string;
  
  // AI Enrichment fields - add these to your database schema
  ai_description?: string | null;
  ai_tags?: string[] | null;
  ai_colors?: string[] | null;
  ai_objects?: string[] | null;
  ai_enriched?: boolean;
  ai_enriched_at?: string | null;
}

// You'll need to add these columns to your photos table in Supabase:
/*
SQL Migration:

ALTER TABLE photos 
ADD COLUMN ai_description TEXT,
ADD COLUMN ai_tags TEXT[], -- PostgreSQL array type
ADD COLUMN ai_colors TEXT[],
ADD COLUMN ai_objects TEXT[],
ADD COLUMN ai_enriched BOOLEAN DEFAULT FALSE,
ADD COLUMN ai_enriched_at TIMESTAMP WITH TIME ZONE;

-- Create an index for querying enriched photos
CREATE INDEX idx_photos_ai_enriched ON photos(ai_enriched);

-- Create an index for lot_id queries
CREATE INDEX idx_photos_lot_id ON photos(lot_id);
*/

// Your other types (Lot, Sale, etc.) remain unchanged
export interface Lot {
  id: string;
  sale_id: string;
  name: string;
  description?: string;
  lot_number?: number;
  category?: string;
  condition?: string;
  style?: string;
  origin?: string;
  creator?: string;
  materials?: string;
  quantity?: number;
  estimate_low?: number;
  estimate_high?: number;
  starting_bid?: number;
  reserve_price?: number;
  buy_now_price?: number;
  height?: number;
  width?: number;
  depth?: number;
  weight?: number;
  consignor?: string;
  created_at: string;
  updated_at: string;
}

export interface Sale {
  id: string;
  company_id: string;
  name: string;
  start_date?: string;
  location?: string;
  status: 'upcoming' | 'active' | 'completed';
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  sale_id: string;
  prefix?: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  suffix?: string;
  business_name?: string;
  role?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  sale_id: string;
  file_path: string;
  file_name: string;
  file_type?: string;
  document_type?: string;
  description?: string;
  created_at: string;
}