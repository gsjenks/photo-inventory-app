// Type definitions for CatalogPro

export interface Photo {
  id: string;
  lot_id: string;
  file_path: string;
  file_name: string;
  is_primary: boolean;
  created_at: string;
  ai_description?: string | null;
  ai_tags?: string[] | null;
  ai_colors?: string[] | null;
  ai_objects?: string[] | null;
  ai_enriched?: boolean;
  ai_enriched_at?: string | null;
}

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
  company_id?: string;
  sale_id?: string;
  prefix?: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  suffix?: string;
  business_name?: string;
  role?: string;
  contact_type?: string;
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
  company_id?: string;
  sale_id?: string;
  name?: string;
  file_path: string;
  file_name: string;
  file_type?: string;
  file_url?: string;
  file_size?: number;
  document_type?: string;
  description?: string;
  created_at: string;
  updated_at?: string;
}

export interface Company {
  id: string;
  name: string;
  address?: string;
  currency?: string;
  units?: 'metric' | 'imperial';
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  created_at: string;
}