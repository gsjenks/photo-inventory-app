-- PhotoInventory Database Schema for Supabase
-- Run this SQL in your Supabase SQL editor to set up the database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Companies table
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    address TEXT,
    currency TEXT DEFAULT 'USD',
    units TEXT DEFAULT 'imperial' CHECK (units IN ('metric', 'imperial')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User-Company relationship (many-to-many)
CREATE TABLE user_companies (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, company_id)
);

-- Sales table
CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    date DATE,
    location TEXT,
    status TEXT DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lots (Items) table
CREATE TABLE lots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sale_id UUID REFERENCES sales(id) ON DELETE CASCADE NOT NULL,
    lot_number TEXT,
    name TEXT NOT NULL,
    description TEXT,
    quantity INTEGER DEFAULT 1,
    condition TEXT,
    category TEXT,
    style TEXT,
    origin TEXT,
    creator TEXT,
    materials TEXT,
    
    -- Pricing
    estimate_low DECIMAL(10, 2),
    estimate_high DECIMAL(10, 2),
    starting_bid DECIMAL(10, 2),
    reserve_price DECIMAL(10, 2),
    buy_now_price DECIMAL(10, 2),
    
    -- Dimensions
    height DECIMAL(10, 2),
    width DECIMAL(10, 2),
    depth DECIMAL(10, 2),
    weight DECIMAL(10, 2),
    dimension_unit TEXT,
    
    -- Provenance
    consignor TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Photos table
CREATE TABLE photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lot_id UUID REFERENCES lots(id) ON DELETE CASCADE NOT NULL,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Contacts table
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    role TEXT,
    address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Contact must belong to either company or sale, but not both
    CHECK (
        (company_id IS NOT NULL AND sale_id IS NULL) OR
        (company_id IS NULL AND sale_id IS NOT NULL)
    )
);

-- Documents table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_name TEXT NOT NULL,
    type TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Document must belong to either company or sale, but not both
    CHECK (
        (company_id IS NOT NULL AND sale_id IS NULL) OR
        (company_id IS NULL AND sale_id IS NOT NULL)
    )
);

-- Lookup categories table (for categories, styles, origins, creators, materials)
CREATE TABLE lookup_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('category', 'style', 'origin', 'creator', 'material')),
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Ensure unique values per company and type
    UNIQUE (company_id, type, value)
);

-- Indexes for performance
CREATE INDEX idx_sales_company ON sales(company_id);
CREATE INDEX idx_lots_sale ON lots(sale_id);
CREATE INDEX idx_photos_lot ON photos(lot_id);
CREATE INDEX idx_contacts_company ON contacts(company_id);
CREATE INDEX idx_contacts_sale ON contacts(sale_id);
CREATE INDEX idx_documents_company ON documents(company_id);
CREATE INDEX idx_documents_sale ON documents(sale_id);
CREATE INDEX idx_lookup_company_type ON lookup_categories(company_id, type);
CREATE INDEX idx_user_companies_user ON user_companies(user_id);
CREATE INDEX idx_user_companies_company ON user_companies(company_id);

-- Row Level Security (RLS) Policies
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE lookup_categories ENABLE ROW LEVEL SECURITY;

-- Policies for companies
CREATE POLICY "Users can view companies they belong to"
    ON companies FOR SELECT
    USING (id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can update companies they own"
    ON companies FOR UPDATE
    USING (id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid() AND role = 'owner'
    ));

CREATE POLICY "Users can insert companies"
    ON companies FOR INSERT
    WITH CHECK (true);

-- Policies for user_companies
CREATE POLICY "Users can view their company associations"
    ON user_companies FOR SELECT
    USING (user_id = auth.uid());

CREATE POLICY "Users can insert company associations"
    ON user_companies FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Policies for sales
CREATE POLICY "Users can view sales in their companies"
    ON sales FOR SELECT
    USING (company_id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can insert sales in their companies"
    ON sales FOR INSERT
    WITH CHECK (company_id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can update sales in their companies"
    ON sales FOR UPDATE
    USING (company_id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can delete sales in their companies"
    ON sales FOR DELETE
    USING (company_id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    ));

-- Policies for lots
CREATE POLICY "Users can view lots in their companies"
    ON lots FOR SELECT
    USING (sale_id IN (
        SELECT s.id FROM sales s
        JOIN user_companies uc ON s.company_id = uc.company_id
        WHERE uc.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert lots in their companies"
    ON lots FOR INSERT
    WITH CHECK (sale_id IN (
        SELECT s.id FROM sales s
        JOIN user_companies uc ON s.company_id = uc.company_id
        WHERE uc.user_id = auth.uid()
    ));

CREATE POLICY "Users can update lots in their companies"
    ON lots FOR UPDATE
    USING (sale_id IN (
        SELECT s.id FROM sales s
        JOIN user_companies uc ON s.company_id = uc.company_id
        WHERE uc.user_id = auth.uid()
    ));

CREATE POLICY "Users can delete lots in their companies"
    ON lots FOR DELETE
    USING (sale_id IN (
        SELECT s.id FROM sales s
        JOIN user_companies uc ON s.company_id = uc.company_id
        WHERE uc.user_id = auth.uid()
    ));

-- Policies for photos
CREATE POLICY "Users can view photos in their companies"
    ON photos FOR SELECT
    USING (lot_id IN (
        SELECT l.id FROM lots l
        JOIN sales s ON l.sale_id = s.id
        JOIN user_companies uc ON s.company_id = uc.company_id
        WHERE uc.user_id = auth.uid()
    ));

CREATE POLICY "Users can insert photos in their companies"
    ON photos FOR INSERT
    WITH CHECK (lot_id IN (
        SELECT l.id FROM lots l
        JOIN sales s ON l.sale_id = s.id
        JOIN user_companies uc ON s.company_id = uc.company_id
        WHERE uc.user_id = auth.uid()
    ));

CREATE POLICY "Users can update photos in their companies"
    ON photos FOR UPDATE
    USING (lot_id IN (
        SELECT l.id FROM lots l
        JOIN sales s ON l.sale_id = s.id
        JOIN user_companies uc ON s.company_id = uc.company_id
        WHERE uc.user_id = auth.uid()
    ));

CREATE POLICY "Users can delete photos in their companies"
    ON photos FOR DELETE
    USING (lot_id IN (
        SELECT l.id FROM lots l
        JOIN sales s ON l.sale_id = s.id
        JOIN user_companies uc ON s.company_id = uc.company_id
        WHERE uc.user_id = auth.uid()
    ));

-- Policies for contacts
CREATE POLICY "Users can view contacts in their companies"
    ON contacts FOR SELECT
    USING (
        (company_id IN (
            SELECT company_id FROM user_companies WHERE user_id = auth.uid()
        )) OR
        (sale_id IN (
            SELECT s.id FROM sales s
            JOIN user_companies uc ON s.company_id = uc.company_id
            WHERE uc.user_id = auth.uid()
        ))
    );

CREATE POLICY "Users can insert contacts in their companies"
    ON contacts FOR INSERT
    WITH CHECK (
        (company_id IN (
            SELECT company_id FROM user_companies WHERE user_id = auth.uid()
        )) OR
        (sale_id IN (
            SELECT s.id FROM sales s
            JOIN user_companies uc ON s.company_id = uc.company_id
            WHERE uc.user_id = auth.uid()
        ))
    );

CREATE POLICY "Users can update contacts in their companies"
    ON contacts FOR UPDATE
    USING (
        (company_id IN (
            SELECT company_id FROM user_companies WHERE user_id = auth.uid()
        )) OR
        (sale_id IN (
            SELECT s.id FROM sales s
            JOIN user_companies uc ON s.company_id = uc.company_id
            WHERE uc.user_id = auth.uid()
        ))
    );

CREATE POLICY "Users can delete contacts in their companies"
    ON contacts FOR DELETE
    USING (
        (company_id IN (
            SELECT company_id FROM user_companies WHERE user_id = auth.uid()
        )) OR
        (sale_id IN (
            SELECT s.id FROM sales s
            JOIN user_companies uc ON s.company_id = uc.company_id
            WHERE uc.user_id = auth.uid()
        ))
    );

-- Policies for documents
CREATE POLICY "Users can view documents in their companies"
    ON documents FOR SELECT
    USING (
        (company_id IN (
            SELECT company_id FROM user_companies WHERE user_id = auth.uid()
        )) OR
        (sale_id IN (
            SELECT s.id FROM sales s
            JOIN user_companies uc ON s.company_id = uc.company_id
            WHERE uc.user_id = auth.uid()
        ))
    );

CREATE POLICY "Users can insert documents in their companies"
    ON documents FOR INSERT
    WITH CHECK (
        (company_id IN (
            SELECT company_id FROM user_companies WHERE user_id = auth.uid()
        )) OR
        (sale_id IN (
            SELECT s.id FROM sales s
            JOIN user_companies uc ON s.company_id = uc.company_id
            WHERE uc.user_id = auth.uid()
        ))
    );

CREATE POLICY "Users can update documents in their companies"
    ON documents FOR UPDATE
    USING (
        (company_id IN (
            SELECT company_id FROM user_companies WHERE user_id = auth.uid()
        )) OR
        (sale_id IN (
            SELECT s.id FROM sales s
            JOIN user_companies uc ON s.company_id = uc.company_id
            WHERE uc.user_id = auth.uid()
        ))
    );

CREATE POLICY "Users can delete documents in their companies"
    ON documents FOR DELETE
    USING (
        (company_id IN (
            SELECT company_id FROM user_companies WHERE user_id = auth.uid()
        )) OR
        (sale_id IN (
            SELECT s.id FROM sales s
            JOIN user_companies uc ON s.company_id = uc.company_id
            WHERE uc.user_id = auth.uid()
        ))
    );

-- Policies for lookup_categories
CREATE POLICY "Users can view lookup categories in their companies"
    ON lookup_categories FOR SELECT
    USING (company_id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can insert lookup categories in their companies"
    ON lookup_categories FOR INSERT
    WITH CHECK (company_id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can update lookup categories in their companies"
    ON lookup_categories FOR UPDATE
    USING (company_id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    ));

CREATE POLICY "Users can delete lookup categories in their companies"
    ON lookup_categories FOR DELETE
    USING (company_id IN (
        SELECT company_id FROM user_companies WHERE user_id = auth.uid()
    ));

-- Create storage bucket for photos
INSERT INTO storage.buckets (id, name, public) VALUES ('photos', 'photos', false);

-- Simplified storage policies (more permissive but functional)
-- These allow authenticated users to manage photos in their company's lots
-- For production, you may want to make these more restrictive

CREATE POLICY "Authenticated users can upload photos"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'photos');

CREATE POLICY "Authenticated users can view photos"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (bucket_id = 'photos');

CREATE POLICY "Authenticated users can update photos"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'photos');

CREATE POLICY "Authenticated users can delete photos"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'photos');
