-- ===========================================
-- DDP Test Database Setup Script - MID COMPLEXITY
-- ===========================================
-- This script creates mid-level complex test data for both dev and prod schemas
-- with more tables, complex relationships, and dependencies
-- ===========================================

-- Create schemas
CREATE SCHEMA IF NOT EXISTS dev_mid;
CREATE SCHEMA IF NOT EXISTS prod_mid;

-- Set search path for easier development
SET search_path TO dev_mid, public;

-- ===========================================
-- DEV_MID SCHEMA - Source Database (Mid Complexity)
-- ===========================================

-- Create base reference tables first (no dependencies)
CREATE TABLE dev_mid.countries (
    id SERIAL PRIMARY KEY,
    code VARCHAR(3) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    currency_code VARCHAR(3) NOT NULL,
    timezone VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dev_mid.regions (
    id SERIAL PRIMARY KEY,
    country_id INTEGER REFERENCES dev_mid.countries(id),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(10) NOT NULL,
    population INTEGER,
    area_km2 DECIMAL(12,2),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dev_mid.cities (
    id SERIAL PRIMARY KEY,
    region_id INTEGER REFERENCES dev_mid.regions(id),
    name VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20),
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    is_capital BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create user management tables
CREATE TABLE dev_mid.user_roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    permissions JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dev_mid.users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    role_id INTEGER REFERENCES dev_mid.user_roles(id),
    city_id INTEGER REFERENCES dev_mid.cities(id),
    phone VARCHAR(20),
    date_of_birth DATE,
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create business domain tables
CREATE TABLE dev_mid.categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_id INTEGER REFERENCES dev_mid.categories(id),
    slug VARCHAR(100) UNIQUE NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dev_mid.brands (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    website VARCHAR(255),
    logo_url VARCHAR(500),
    country_id INTEGER REFERENCES dev_mid.countries(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dev_mid.products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    sku VARCHAR(50) UNIQUE NOT NULL,
    category_id INTEGER REFERENCES dev_mid.categories(id),
    brand_id INTEGER REFERENCES dev_mid.brands(id),
    price DECIMAL(12,2) NOT NULL CHECK (price >= 0),
    cost DECIMAL(12,2) CHECK (cost >= 0),
    stock_quantity INTEGER DEFAULT 0 CHECK (stock_quantity >= 0),
    min_stock_level INTEGER DEFAULT 0,
    max_stock_level INTEGER,
    weight_kg DECIMAL(8,3),
    dimensions_cm JSONB,
    attributes JSONB,
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create order management tables
CREATE TABLE dev_mid.order_statuses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    is_final BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dev_mid.payment_methods (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    processing_fee_percent DECIMAL(5,4) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dev_mid.orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES dev_mid.users(id),
    order_number VARCHAR(20) UNIQUE NOT NULL,
    status_id INTEGER REFERENCES dev_mid.order_statuses(id),
    payment_method_id INTEGER REFERENCES dev_mid.payment_methods(id),
    subtotal DECIMAL(12,2) NOT NULL CHECK (subtotal >= 0),
    tax_amount DECIMAL(12,2) DEFAULT 0 CHECK (tax_amount >= 0),
    shipping_amount DECIMAL(12,2) DEFAULT 0 CHECK (shipping_amount >= 0),
    discount_amount DECIMAL(12,2) DEFAULT 0 CHECK (discount_amount >= 0),
    total_amount DECIMAL(12,2) NOT NULL CHECK (total_amount >= 0),
    shipping_address JSONB NOT NULL,
    billing_address JSONB,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP
);

CREATE TABLE dev_mid.order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES dev_mid.orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES dev_mid.products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
    total_price DECIMAL(12,2) NOT NULL CHECK (total_price >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create inventory management tables
CREATE TABLE dev_mid.warehouses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    city_id INTEGER REFERENCES dev_mid.cities(id),
    address TEXT NOT NULL,
    contact_person VARCHAR(100),
    contact_phone VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dev_mid.inventory (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES dev_mid.products(id),
    warehouse_id INTEGER REFERENCES dev_mid.warehouses(id),
    quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    reserved_quantity INTEGER DEFAULT 0 CHECK (reserved_quantity >= 0),
    reorder_level INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, warehouse_id)
);

CREATE TABLE dev_mid.inventory_transactions (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES dev_mid.products(id),
    warehouse_id INTEGER REFERENCES dev_mid.warehouses(id),
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('in', 'out', 'transfer', 'adjustment', 'return')),
    quantity_change INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    reference_type VARCHAR(50),
    reference_id VARCHAR(50),
    reason VARCHAR(200),
    created_by INTEGER REFERENCES dev_mid.users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for dev_mid schema
CREATE INDEX idx_countries_code ON dev_mid.countries(code);
CREATE INDEX idx_countries_active ON dev_mid.countries(is_active);

CREATE INDEX idx_regions_country ON dev_mid.regions(country_id);
CREATE INDEX idx_regions_active ON dev_mid.regions(is_active);

CREATE INDEX idx_cities_region ON dev_mid.cities(region_id);
CREATE INDEX idx_cities_active ON dev_mid.cities(is_active);

CREATE INDEX idx_users_role ON dev_mid.users(role_id);
CREATE INDEX idx_users_city ON dev_mid.users(city_id);
CREATE INDEX idx_users_email ON dev_mid.users(email);
CREATE INDEX idx_users_username ON dev_mid.users(username);
CREATE INDEX idx_users_active ON dev_mid.users(is_active);

CREATE INDEX idx_categories_parent ON dev_mid.categories(parent_id);
CREATE INDEX idx_categories_slug ON dev_mid.categories(slug);
CREATE INDEX idx_categories_active ON dev_mid.categories(is_active);

CREATE INDEX idx_brands_country ON dev_mid.brands(country_id);
CREATE INDEX idx_brands_active ON dev_mid.brands(is_active);

CREATE INDEX idx_products_category ON dev_mid.products(category_id);
CREATE INDEX idx_products_brand ON dev_mid.products(brand_id);
CREATE INDEX idx_products_sku ON dev_mid.products(sku);
CREATE INDEX idx_products_active ON dev_mid.products(is_active);
CREATE INDEX idx_products_featured ON dev_mid.products(is_featured);

CREATE INDEX idx_orders_user ON dev_mid.orders(user_id);
CREATE INDEX idx_orders_status ON dev_mid.orders(status_id);
CREATE INDEX idx_orders_payment ON dev_mid.orders(payment_method_id);
CREATE INDEX idx_orders_created ON dev_mid.orders(created_at);
CREATE INDEX idx_orders_number ON dev_mid.orders(order_number);

CREATE INDEX idx_order_items_order ON dev_mid.order_items(order_id);
CREATE INDEX idx_order_items_product ON dev_mid.order_items(product_id);

CREATE INDEX idx_warehouses_city ON dev_mid.warehouses(city_id);
CREATE INDEX idx_warehouses_active ON dev_mid.warehouses(is_active);

CREATE INDEX idx_inventory_product ON dev_mid.inventory(product_id);
CREATE INDEX idx_inventory_warehouse ON dev_mid.inventory(warehouse_id);

CREATE INDEX idx_inventory_transactions_product ON dev_mid.inventory_transactions(product_id);
CREATE INDEX idx_inventory_transactions_warehouse ON dev_mid.inventory_transactions(warehouse_id);
CREATE INDEX idx_inventory_transactions_created ON dev_mid.inventory_transactions(created_at);
CREATE INDEX idx_inventory_transactions_type ON dev_mid.inventory_transactions(transaction_type);

-- Create constraints for dev_mid schema
ALTER TABLE dev_mid.orders ADD CONSTRAINT chk_order_total CHECK (total_amount = subtotal + tax_amount + shipping_amount - discount_amount);
ALTER TABLE dev_mid.order_items ADD CONSTRAINT chk_order_item_total CHECK (total_price = quantity * unit_price);
ALTER TABLE dev_mid.inventory ADD CONSTRAINT chk_inventory_available CHECK (quantity >= reserved_quantity);

-- ===========================================
-- FUNCTIONS AND PROCEDURES FOR DEV_MID SCHEMA
-- ===========================================

-- Function to calculate order total
CREATE OR REPLACE FUNCTION dev_mid.calculate_order_total(order_id INTEGER)
RETURNS DECIMAL(12,2) AS $$
DECLARE
    total DECIMAL(12,2);
BEGIN
    SELECT COALESCE(SUM(total_price), 0)
    INTO total
    FROM dev_mid.order_items
    WHERE order_id = $1;
    
    RETURN total;
END;
$$ LANGUAGE plpgsql;

-- Function to update inventory
CREATE OR REPLACE FUNCTION dev_mid.update_inventory(
    p_product_id INTEGER,
    p_warehouse_id INTEGER,
    p_quantity_change INTEGER,
    p_transaction_type VARCHAR(20),
    p_reason VARCHAR(200),
    p_created_by INTEGER,
    p_reference_type VARCHAR(50) DEFAULT NULL,
    p_reference_id VARCHAR(50) DEFAULT NULL
) RETURNS INTEGER AS $$
DECLARE
    current_quantity INTEGER;
    new_quantity INTEGER;
    inventory_id INTEGER;
BEGIN
    -- Get or create inventory record
    SELECT id, quantity INTO inventory_id, current_quantity
    FROM dev_mid.inventory
    WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;
    
    IF inventory_id IS NULL THEN
        -- Create new inventory record
        INSERT INTO dev_mid.inventory (product_id, warehouse_id, quantity)
        VALUES (p_product_id, p_warehouse_id, 0)
        RETURNING id INTO inventory_id;
        current_quantity := 0;
    END IF;
    
    -- Calculate new quantity
    new_quantity := current_quantity + p_quantity_change;
    
    -- Update inventory
    UPDATE dev_mid.inventory
    SET quantity = new_quantity,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = inventory_id;
    
    -- Log the transaction
    INSERT INTO dev_mid.inventory_transactions (
        product_id, warehouse_id, transaction_type, quantity_change,
        previous_quantity, new_quantity, reference_type, reference_id,
        reason, created_by
    ) VALUES (
        p_product_id, p_warehouse_id, p_transaction_type, p_quantity_change,
        current_quantity, new_quantity, p_reference_type, p_reference_id,
        p_reason, p_created_by
    );
    
    RETURN new_quantity;
END;
$$ LANGUAGE plpgsql;

-- Function to get user order history
CREATE OR REPLACE FUNCTION dev_mid.get_user_orders(
    p_user_id INTEGER, 
    p_limit INTEGER DEFAULT 10,
    p_status_filter VARCHAR(50) DEFAULT NULL
)
RETURNS TABLE (
    order_id INTEGER,
    order_number VARCHAR(20),
    status_name VARCHAR(50),
    total_amount DECIMAL(12,2),
    created_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT o.id, o.order_number, os.name, o.total_amount, o.created_at
    FROM dev_mid.orders o
    JOIN dev_mid.order_statuses os ON o.status_id = os.id
    WHERE o.user_id = p_user_id
    AND (p_status_filter IS NULL OR os.name = p_status_filter)
    ORDER BY o.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to check low stock products
CREATE OR REPLACE FUNCTION dev_mid.get_low_stock_products(p_warehouse_id INTEGER DEFAULT NULL)
RETURNS TABLE (
    product_id INTEGER,
    product_name VARCHAR(200),
    sku VARCHAR(50),
    current_quantity INTEGER,
    reorder_level INTEGER,
    warehouse_name VARCHAR(100)
) AS $$
BEGIN
    RETURN QUERY
    SELECT p.id, p.name, p.sku, i.quantity, i.reorder_level, w.name
    FROM dev_mid.products p
    JOIN dev_mid.inventory i ON p.id = i.product_id
    JOIN dev_mid.warehouses w ON i.warehouse_id = w.id
    WHERE (p_warehouse_id IS NULL OR i.warehouse_id = p_warehouse_id)
    AND i.quantity <= i.reorder_level
    AND p.is_active = true
    ORDER BY i.quantity ASC;
END;
$$ LANGUAGE plpgsql;

-- Procedure to process order
CREATE OR REPLACE PROCEDURE dev_mid.process_order(p_order_id INTEGER)
AS $$
DECLARE
    order_record RECORD;
    item_record RECORD;
    inventory_record RECORD;
BEGIN
    -- Get order details
    SELECT * INTO order_record FROM dev_mid.orders WHERE id = p_order_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;
    
    -- Update order status to processing
    UPDATE dev_mid.orders
    SET status_id = (SELECT id FROM dev_mid.order_statuses WHERE name = 'processing'),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_order_id;
    
    -- Process each order item
    FOR item_record IN
        SELECT * FROM dev_mid.order_items WHERE order_id = p_order_id
    LOOP
        -- Check inventory availability
        SELECT * INTO inventory_record
        FROM dev_mid.inventory
        WHERE product_id = item_record.product_id
        AND warehouse_id = 1 -- Default warehouse
        LIMIT 1;
        
        IF inventory_record IS NULL OR inventory_record.quantity < item_record.quantity THEN
            RAISE EXCEPTION 'Insufficient inventory for product %', item_record.product_id;
        END IF;
        
        -- Update inventory
        PERFORM dev_mid.update_inventory(
            item_record.product_id,
            1, -- Default warehouse
            -item_record.quantity,
            'out',
            'Order ' || order_record.order_number,
            1, -- System user
            'order',
            order_record.order_number
        );
    END LOOP;
    
    -- Update order status to shipped
    UPDATE dev_mid.orders
    SET status_id = (SELECT id FROM dev_mid.order_statuses WHERE name = 'shipped'),
        shipped_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_order_id;
    
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- TRIGGERS FOR DEV_MID SCHEMA
-- ===========================================

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION dev_mid.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to tables
CREATE TRIGGER tr_users_updated_at
    BEFORE UPDATE ON dev_mid.users
    FOR EACH ROW
    EXECUTE FUNCTION dev_mid.update_updated_at_column();

CREATE TRIGGER tr_products_updated_at
    BEFORE UPDATE ON dev_mid.products
    FOR EACH ROW
    EXECUTE FUNCTION dev_mid.update_updated_at_column();

CREATE TRIGGER tr_orders_updated_at
    BEFORE UPDATE ON dev_mid.orders
    FOR EACH ROW
    EXECUTE FUNCTION dev_mid.update_updated_at_column();

CREATE TRIGGER tr_inventory_updated_at
    BEFORE UPDATE ON dev_mid.inventory
    FOR EACH ROW
    EXECUTE FUNCTION dev_mid.update_updated_at_column();

-- Trigger to validate order total
CREATE OR REPLACE FUNCTION dev_mid.validate_order_total()
RETURNS TRIGGER AS $$
DECLARE
    calculated_total DECIMAL(12,2);
BEGIN
    SELECT COALESCE(SUM(total_price), 0)
    INTO calculated_total
    FROM dev_mid.order_items
    WHERE order_id = NEW.id;
    
    IF NEW.total_amount != calculated_total THEN
        RAISE EXCEPTION 'Order total % does not match calculated total %', NEW.total_amount, calculated_total;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_orders_validate_total
    BEFORE INSERT OR UPDATE ON dev_mid.orders
    FOR EACH ROW
    EXECUTE FUNCTION dev_mid.validate_order_total();

-- ===========================================
-- SAMPLE DATA FOR DEV_MID SCHEMA
-- ===========================================

-- Insert countries
INSERT INTO dev_mid.countries (code, name, currency_code, timezone) VALUES
('USA', 'United States', 'USD', 'America/New_York'),
('CAN', 'Canada', 'CAD', 'America/Toronto'),
('GBR', 'United Kingdom', 'GBP', 'Europe/London'),
('DEU', 'Germany', 'EUR', 'Europe/Berlin'),
('FRA', 'France', 'EUR', 'Europe/Paris');

-- Insert regions
INSERT INTO dev_mid.regions (country_id, name, code, population, area_km2) VALUES
(1, 'California', 'CA', 39538223, 423967),
(1, 'Texas', 'TX', 29145505, 695662),
(1, 'New York', 'NY', 20201249, 141297),
(2, 'Ontario', 'ON', 14733119, 1076395),
(3, 'England', 'ENG', 55980000, 130279);

-- Insert cities
INSERT INTO dev_mid.cities (region_id, name, postal_code, latitude, longitude, is_capital) VALUES
(1, 'Los Angeles', '90210', 34.0522, -118.2437, false),
(1, 'San Francisco', '94102', 37.7749, -122.4194, false),
(2, 'Houston', '77001', 29.7604, -95.3698, false),
(2, 'Dallas', '75201', 32.7767, -96.7970, false),
(3, 'New York City', '10001', 40.7128, -74.0060, false),
(4, 'Toronto', 'M5H 2N2', 43.6532, -79.3832, true),
(5, 'London', 'SW1A 1AA', 51.5074, -0.1278, true);

-- Insert user roles
INSERT INTO dev_mid.user_roles (name, description, permissions) VALUES
('admin', 'System Administrator', '{"all": true}'),
('manager', 'Store Manager', '{"orders": true, "inventory": true, "products": true}'),
('employee', 'Store Employee', '{"orders": true, "inventory": true}'),
('customer', 'Regular Customer', '{"orders": true, "profile": true}');

-- Insert users
INSERT INTO dev_mid.users (username, email, password_hash, first_name, last_name, role_id, city_id, phone, date_of_birth) VALUES
('admin', 'admin@company.com', 'hashed_password_1', 'Admin', 'User', 1, 1, '+1-555-0001', '1980-01-01'),
('manager1', 'manager@company.com', 'hashed_password_2', 'John', 'Manager', 2, 2, '+1-555-0002', '1985-05-15'),
('employee1', 'employee@company.com', 'hashed_password_3', 'Jane', 'Employee', 3, 3, '+1-555-0003', '1990-08-20'),
('customer1', 'customer1@example.com', 'hashed_password_4', 'Alice', 'Customer', 4, 4, '+1-555-0004', '1992-12-10'),
('customer2', 'customer2@example.com', 'hashed_password_5', 'Bob', 'Customer', 4, 5, '+1-555-0005', '1988-03-25');

-- Insert categories
INSERT INTO dev_mid.categories (name, description, slug, sort_order) VALUES
('Electronics', 'Electronic devices and accessories', 'electronics', 1),
('Clothing', 'Apparel and fashion items', 'clothing', 2),
('Books', 'Books and educational materials', 'books', 3),
('Home & Garden', 'Home improvement and garden supplies', 'home-garden', 4);

-- Insert subcategories
INSERT INTO dev_mid.categories (name, description, parent_id, slug, sort_order) VALUES
('Smartphones', 'Mobile phones and accessories', 1, 'smartphones', 1),
('Laptops', 'Portable computers', 1, 'laptops', 2),
('Men''s Clothing', 'Clothing for men', 2, 'mens-clothing', 1),
('Women''s Clothing', 'Clothing for women', 2, 'womens-clothing', 2);

-- Insert brands
INSERT INTO dev_mid.brands (name, description, website, country_id) VALUES
('Apple', 'Technology company', 'https://apple.com', 1),
('Samsung', 'Electronics manufacturer', 'https://samsung.com', 1),
('Nike', 'Sports apparel', 'https://nike.com', 1),
('Adidas', 'Sports apparel', 'https://adidas.com', 4);

-- Insert products
INSERT INTO dev_mid.products (name, description, sku, category_id, brand_id, price, cost, stock_quantity, min_stock_level, weight_kg, attributes) VALUES
('iPhone 15 Pro', 'Latest Apple smartphone', 'IPH15PRO-128', 5, 1, 999.99, 750.00, 50, 10, 0.187, '{"color": "Natural Titanium", "storage": "128GB"}'),
('MacBook Air M2', 'Apple laptop with M2 chip', 'MBA-M2-256', 6, 1, 1199.99, 900.00, 25, 5, 1.24, '{"color": "Space Gray", "storage": "256GB"}'),
('Galaxy S24', 'Samsung flagship phone', 'GAL-S24-256', 5, 2, 899.99, 650.00, 30, 8, 0.168, '{"color": "Phantom Black", "storage": "256GB"}'),
('Nike Air Max', 'Comfortable running shoes', 'NIKE-AM-10', 7, 3, 129.99, 80.00, 100, 20, 0.8, '{"size": "10", "color": "White/Black"}'),
('Programming Book', 'Learn JavaScript programming', 'BOOK-JS-2024', 3, NULL, 49.99, 25.00, 75, 15, 0.8, '{"author": "John Developer", "pages": 400}');

-- Insert order statuses
INSERT INTO dev_mid.order_statuses (name, description, is_final, sort_order) VALUES
('pending', 'Order received, awaiting processing', false, 1),
('processing', 'Order is being prepared', false, 2),
('shipped', 'Order has been shipped', false, 3),
('delivered', 'Order has been delivered', true, 4),
('cancelled', 'Order has been cancelled', true, 5);

-- Insert payment methods
INSERT INTO dev_mid.payment_methods (name, description, processing_fee_percent) VALUES
('Credit Card', 'Credit card payment', 0.029),
('PayPal', 'PayPal payment', 0.034),
('Bank Transfer', 'Direct bank transfer', 0.01),
('Cash on Delivery', 'Pay when delivered', 0.0);

-- Insert warehouses
INSERT INTO dev_mid.warehouses (name, city_id, address, contact_person, contact_phone) VALUES
('Main Warehouse', 1, '123 Warehouse St, Los Angeles, CA 90210', 'John Smith', '+1-555-1001'),
('East Coast Warehouse', 5, '456 Storage Ave, New York, NY 10001', 'Jane Doe', '+1-555-1002'),
('International Warehouse', 6, '789 Global Blvd, Toronto, ON M5H 2N2', 'Mike Johnson', '+1-555-1003');

-- Insert inventory
INSERT INTO dev_mid.inventory (product_id, warehouse_id, quantity, reserved_quantity, reorder_level) VALUES
(1, 1, 30, 0, 10),
(1, 2, 20, 0, 8),
(2, 1, 15, 0, 5),
(2, 3, 10, 0, 3),
(3, 1, 20, 0, 8),
(3, 2, 10, 0, 5),
(4, 1, 50, 0, 20),
(4, 2, 30, 0, 15),
(5, 1, 40, 0, 15),
(5, 3, 35, 0, 10);

-- Insert orders
INSERT INTO dev_mid.orders (user_id, order_number, status_id, payment_method_id, subtotal, tax_amount, shipping_amount, total_amount, shipping_address, billing_address) VALUES
(4, 'ORD-MID-001', 4, 1, 1049.98, 84.00, 15.99, 1149.97, '{"street": "123 Main St", "city": "Houston", "state": "TX", "zip": "77001"}', '{"street": "123 Main St", "city": "Houston", "state": "TX", "zip": "77001"}'),
(5, 'ORD-MID-002', 3, 2, 129.99, 10.40, 9.99, 150.38, '{"street": "456 Oak Ave", "city": "New York", "state": "NY", "zip": "10001"}', '{"street": "456 Oak Ave", "city": "New York", "state": "NY", "zip": "10001"}');

-- Insert order items
INSERT INTO dev_mid.order_items (order_id, product_id, quantity, unit_price, total_price) VALUES
(1, 1, 1, 999.99, 999.99),
(1, 5, 1, 49.99, 49.99),
(2, 4, 1, 129.99, 129.99);

-- Insert inventory transactions
INSERT INTO dev_mid.inventory_transactions (product_id, warehouse_id, transaction_type, quantity_change, previous_quantity, new_quantity, reason, created_by) VALUES
(1, 1, 'in', 50, 0, 50, 'Initial stock', 1),
(2, 1, 'in', 25, 0, 25, 'Initial stock', 1),
(3, 1, 'in', 30, 0, 30, 'Initial stock', 1),
(4, 1, 'in', 100, 0, 100, 'Initial stock', 1),
(5, 1, 'in', 75, 0, 75, 'Initial stock', 1);

-- ===========================================
-- PROD_MID SCHEMA - Target Database (Incomplete/Outdated)
-- ===========================================

-- Switch to prod_mid schema
SET search_path TO prod_mid, public;

-- Create simplified countries table
CREATE TABLE prod_mid.countries (
    id SERIAL PRIMARY KEY,
    code VARCHAR(3) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    -- Missing: currency_code, timezone, is_active, created_at
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create simplified users table
CREATE TABLE prod_mid.users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    -- Missing: role_id, city_id, phone, date_of_birth, is_active, is_verified, last_login, updated_at
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create simplified categories table
CREATE TABLE prod_mid.categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    -- Missing: parent_id, slug, sort_order, is_active, created_at
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create simplified products table
CREATE TABLE prod_mid.products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    sku VARCHAR(50) UNIQUE NOT NULL,
    category_id INTEGER REFERENCES prod_mid.categories(id),
    price DECIMAL(12,2) NOT NULL,
    -- Missing: brand_id, cost, stock_quantity, min_stock_level, max_stock_level, weight_kg, dimensions_cm, attributes, is_active, is_featured, updated_at
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create simplified orders table
CREATE TABLE prod_mid.orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES prod_mid.users(id),
    order_number VARCHAR(20) UNIQUE NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL,
    -- Missing: status_id, payment_method_id, subtotal, tax_amount, shipping_amount, discount_amount, shipping_address, billing_address, notes, updated_at, shipped_at, delivered_at
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Missing tables: regions, cities, user_roles, brands, order_statuses, payment_methods, order_items, warehouses, inventory, inventory_transactions

-- Create some basic indexes for prod_mid
CREATE INDEX idx_prod_mid_users_email ON prod_mid.users(email);
CREATE INDEX idx_prod_mid_products_sku ON prod_mid.products(sku);
CREATE INDEX idx_prod_mid_orders_user ON prod_mid.orders(user_id);

-- Insert some sample data for prod_mid (different from dev_mid)
INSERT INTO prod_mid.countries (code, name) VALUES
('USA', 'United States'),
('CAN', 'Canada');

INSERT INTO prod_mid.users (username, email, password_hash, first_name, last_name) VALUES
('admin', 'admin@company.com', 'old_hashed_password', 'Admin', 'User'),
('test_user', 'test@company.com', 'old_hashed_password', 'Test', 'User');

INSERT INTO prod_mid.categories (name, description) VALUES
('Electronics', 'Electronic devices'),
('Books', 'Books and materials');

INSERT INTO prod_mid.products (name, description, sku, category_id, price) VALUES
('Old Product', 'This is an old product', 'OLD-001', 1, 99.99),
('Another Product', 'Another old product', 'OLD-002', 2, 29.99);

INSERT INTO prod_mid.orders (user_id, order_number, total_amount) VALUES
(1, 'OLD-001', 99.99),
(2, 'OLD-002', 29.99);

-- ===========================================
-- FUNCTIONS FOR PROD_MID SCHEMA (Different/Outdated)
-- ===========================================

-- Simple function in prod_mid
CREATE OR REPLACE FUNCTION prod_mid.get_user_count()
RETURNS INTEGER AS $$
BEGIN
    RETURN (SELECT COUNT(*) FROM prod_mid.users);
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- SUMMARY
-- ===========================================

-- Display summary
SELECT 'DEV_MID Schema Summary' as info;
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables 
WHERE schemaname = 'dev_mid'
ORDER BY tablename;

SELECT 'PROD_MID Schema Summary' as info;
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables 
WHERE schemaname = 'prod_mid'
ORDER BY tablename;

-- Reset search path
SET search_path TO public;


