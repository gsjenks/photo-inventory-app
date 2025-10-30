// Database Types
export interface Company {
  id: string;
  name: string;
  currency: string;
  units: 'metric' | 'imperial';
  address?: string;
  logo_url?: string;
  phone?: string;
  email?: string;
  website?: string;
  created_at: string;
  updated_at: string;
}

export interface UserCompany {
  id: string;
  user_id: string;
  company_id: string;
  role: 'owner' | 'admin' | 'staff';
  created_at: string;
}

export interface Sale {
  id: string;
  company_id: string;
  name: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  close_date?: string;
  close_time?: string;
  auction_number?: string;
  location?: string;
  status: 'upcoming' | 'active' | 'completed';
  map_link?: string;
  header_photo_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Lot {
  id: string;
  sale_id: string;
  lot_number: number;
  name: string;
  description?: string;
  category?: string;
  condition?: string;
  quantity?: number;
  
  // Pricing
  estimate_low?: number;
  estimate_high?: number;
  starting_bid?: number;
  reserve_price?: number;
  buy_now_price?: number;
  fair_market_value?: number;
  
  // Dimensions
  height?: number;
  width?: number;
  depth?: number;
  weight?: number;
  
  // Provenance
  style?: string;
  origin?: string;
  creator?: string;
  materials?: string;
  consignor?: string;
  
  // Status
  status: 'draft' | 'active' | 'sold' | 'unsold' | 'withdrawn';
  
  created_at: string;
  updated_at: string;
}

export interface Photo {
  id: string;
  lot_id: string;
  file_path: string;
  file_name: string;
  sequence: number;
  is_primary: boolean;
  created_at: string;
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
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  lock_codes?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  company_id?: string;
  sale_id?: string;
  name: string;
  file_path: string;
  file_type: string;
  category?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface LookupCategory {
  id: string;
  name: string;
  parent_id?: string;
  sort_order: number;
}

// UI State Types
export interface DashboardStats {
  totalSales: number;
  activeSales: number;
  totalLots: number;
  totalValue: number;
  recentActivity: Array<{
    id: string;
    type: 'sale' | 'lot' | 'contact';
    description: string;
    timestamp: string;
  }>;
}

// Form Types
export interface SaleFormData {
  name: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  close_date?: string;
  close_time?: string;
  auction_number?: string;
  location?: string;
  status: 'upcoming' | 'active' | 'completed';
  map_link?: string;
}

export interface LotFormData {
  lot_number: number;
  name: string;
  description?: string;
  category?: string;
  condition?: string;
  quantity?: number;
  estimate_low?: number;
  estimate_high?: number;
  starting_bid?: number;
  reserve_price?: number;
  buy_now_price?: number;
  fair_market_value?: number;
  height?: number;
  width?: number;
  depth?: number;
  weight?: number;
  style?: string;
  origin?: string;
  creator?: string;
  materials?: string;
  consignor?: string;
  status: 'draft' | 'active' | 'sold' | 'unsold' | 'withdrawn';
}

export interface ContactFormData {
  prefix?: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  suffix?: string;
  business_name?: string;
  role?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  lock_codes?: string;
  notes?: string;
}

// AI Response Types
export interface GeminiAnalysisResult {
  title?: string;
  description?: string;
  category?: string;
  style?: string;
  origin?: string;
  creator?: string;
  materials?: string;
  fair_market_value?: number;
  estimate_low?: number;
  estimate_high?: number;
  starting_bid?: number;
  height?: number;
  width?: number;
  depth?: number;
  weight?: number;
  condition?: string;
}