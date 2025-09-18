-- ===========================================
-- DDP Test Database Setup Script
-- ===========================================
-- This script creates comprehensive test data for both dev and prod schemas
-- to test the gen and sync commands
-- ===========================================

-- Create schemas
CREATE SCHEMA IF NOT EXISTS dev;
CREATE SCHEMA IF NOT EXISTS prod;

-- Set search path for easier development
SET search_path TO dev, public;

-- ===========================================
-- DEV SCHEMA - Source Database (Complete)
-- ===========================================

-- Create users table
CREATE TABLE dev.users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create categories table
CREATE TABLE dev.categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    parent_id INTEGER REFERENCES dev.categories(id),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create products table
CREATE TABLE dev.products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    sku VARCHAR(50) UNIQUE NOT NULL,
    category_id INTEGER REFERENCES dev.categories(id),
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    cost DECIMAL(10,2) CHECK (cost >= 0),
    stock_quantity INTEGER DEFAULT 0 CHECK (stock_quantity >= 0),
    is_active BOOLEAN DEFAULT true,
    weight_kg DECIMAL(8,3),
    dimensions_cm JSONB,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create orders table
CREATE TABLE dev.orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES dev.users(id),
    order_number VARCHAR(20) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
    total_amount DECIMAL(12,2) NOT NULL CHECK (total_amount >= 0),
    tax_amount DECIMAL(12,2) DEFAULT 0 CHECK (tax_amount >= 0),
    shipping_amount DECIMAL(12,2) DEFAULT 0 CHECK (shipping_amount >= 0),
    discount_amount DECIMAL(12,2) DEFAULT 0 CHECK (discount_amount >= 0),
    shipping_address JSONB NOT NULL,
    billing_address JSONB,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    shipped_at TIMESTAMP,
    delivered_at TIMESTAMP
);

-- Create order_items table
CREATE TABLE dev.order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES dev.orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES dev.products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(10,2) NOT NULL CHECK (unit_price >= 0),
    total_price DECIMAL(12,2) NOT NULL CHECK (total_price >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create inventory_logs table
CREATE TABLE dev.inventory_logs (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES dev.products(id),
    change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('in', 'out', 'adjustment', 'return')),
    quantity_change INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    reason VARCHAR(200),
    reference_id VARCHAR(50),
    created_by INTEGER REFERENCES dev.users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for dev schema
CREATE INDEX idx_users_email ON dev.users(email);
CREATE INDEX idx_users_username ON dev.users(username);
CREATE INDEX idx_users_active ON dev.users(is_active);

CREATE INDEX idx_categories_parent ON dev.categories(parent_id);
CREATE INDEX idx_categories_active ON dev.categories(is_active);
CREATE INDEX idx_categories_sort ON dev.categories(sort_order);

CREATE INDEX idx_products_category ON dev.products(category_id);
CREATE INDEX idx_products_sku ON dev.products(sku);
CREATE INDEX idx_products_active ON dev.products(is_active);
CREATE INDEX idx_products_price ON dev.products(price);
CREATE INDEX idx_products_created ON dev.products(created_at);

CREATE INDEX idx_orders_user ON dev.orders(user_id);
CREATE INDEX idx_orders_status ON dev.orders(status);
CREATE INDEX idx_orders_created ON dev.orders(created_at);
CREATE INDEX idx_orders_number ON dev.orders(order_number);

CREATE INDEX idx_order_items_order ON dev.order_items(order_id);
CREATE INDEX idx_order_items_product ON dev.order_items(product_id);

CREATE INDEX idx_inventory_logs_product ON dev.inventory_logs(product_id);
CREATE INDEX idx_inventory_logs_created ON dev.inventory_logs(created_at);
CREATE INDEX idx_inventory_logs_type ON dev.inventory_logs(change_type);

-- Create constraints for dev schema
ALTER TABLE dev.orders ADD CONSTRAINT chk_order_total CHECK (total_amount = (SELECT COALESCE(SUM(total_price), 0) FROM dev.order_items WHERE order_id = orders.id));

-- ===========================================
-- FUNCTIONS AND PROCEDURES FOR DEV SCHEMA
-- ===========================================

-- Function to calculate order total
CREATE OR REPLACE FUNCTION dev.calculate_order_total(order_id INTEGER)
RETURNS DECIMAL(12,2) AS $$
DECLARE
    total DECIMAL(12,2);
BEGIN
    SELECT COALESCE(SUM(total_price), 0)
    INTO total
    FROM dev.order_items
    WHERE order_id = $1;
    
    RETURN total;
END;
$$ LANGUAGE plpgsql;

-- Function to update product stock
CREATE OR REPLACE FUNCTION dev.update_product_stock(
    p_product_id INTEGER,
    p_quantity_change INTEGER,
    p_reason VARCHAR(200),
    p_created_by INTEGER
) RETURNS INTEGER AS $$
DECLARE
    current_stock INTEGER;
    new_stock INTEGER;
BEGIN
    -- Get current stock
    SELECT stock_quantity INTO current_stock
    FROM dev.products
    WHERE id = p_product_id;
    
    -- Calculate new stock
    new_stock := current_stock + p_quantity_change;
    
    -- Update product stock
    UPDATE dev.products
    SET stock_quantity = new_stock,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_product_id;
    
    -- Log the change
    INSERT INTO dev.inventory_logs (
        product_id, change_type, quantity_change,
        previous_quantity, new_quantity, reason, created_by
    ) VALUES (
        p_product_id, 'adjustment', p_quantity_change,
        current_stock, new_stock, p_reason, p_created_by
    );
    
    RETURN new_stock;
END;
$$ LANGUAGE plpgsql;

-- Function to get user order history
CREATE OR REPLACE FUNCTION dev.get_user_orders(p_user_id INTEGER, p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
    order_id INTEGER,
    order_number VARCHAR(20),
    status VARCHAR(20),
    total_amount DECIMAL(12,2),
    created_at TIMESTAMP
) AS $$
BEGIN
    RETURN QUERY
    SELECT o.id, o.order_number, o.status, o.total_amount, o.created_at
    FROM dev.orders o
    WHERE o.user_id = p_user_id
    ORDER BY o.created_at DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Procedure to process order
CREATE OR REPLACE PROCEDURE dev.process_order(p_order_id INTEGER)
AS $$
DECLARE
    order_record RECORD;
    item_record RECORD;
BEGIN
    -- Get order details
    SELECT * INTO order_record FROM dev.orders WHERE id = p_order_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;
    
    -- Update order status
    UPDATE dev.orders
    SET status = 'processing',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_order_id;
    
    -- Update inventory for each item
    FOR item_record IN
        SELECT * FROM dev.order_items WHERE order_id = p_order_id
    LOOP
        PERFORM dev.update_product_stock(
            item_record.product_id,
            -item_record.quantity,
            'Order ' || order_record.order_number,
            1 -- System user
        );
    END LOOP;
    
    -- Update order status to shipped
    UPDATE dev.orders
    SET status = 'shipped',
        shipped_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_order_id;
    
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- TRIGGERS FOR DEV SCHEMA
-- ===========================================

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION dev.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to tables
CREATE TRIGGER tr_users_updated_at
    BEFORE UPDATE ON dev.users
    FOR EACH ROW
    EXECUTE FUNCTION dev.update_updated_at_column();

CREATE TRIGGER tr_products_updated_at
    BEFORE UPDATE ON dev.products
    FOR EACH ROW
    EXECUTE FUNCTION dev.update_updated_at_column();

CREATE TRIGGER tr_orders_updated_at
    BEFORE UPDATE ON dev.orders
    FOR EACH ROW
    EXECUTE FUNCTION dev.update_updated_at_column();

-- Trigger to validate order total
CREATE OR REPLACE FUNCTION dev.validate_order_total()
RETURNS TRIGGER AS $$
DECLARE
    calculated_total DECIMAL(12,2);
BEGIN
    SELECT COALESCE(SUM(total_price), 0)
    INTO calculated_total
    FROM dev.order_items
    WHERE order_id = NEW.id;
    
    IF NEW.total_amount != calculated_total THEN
        RAISE EXCEPTION 'Order total % does not match calculated total %', NEW.total_amount, calculated_total;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_orders_validate_total
    BEFORE INSERT OR UPDATE ON dev.orders
    FOR EACH ROW
    EXECUTE FUNCTION dev.validate_order_total();

-- ===========================================
-- SAMPLE DATA FOR DEV SCHEMA
-- ===========================================

-- Insert sample users
INSERT INTO dev.users (username, email, first_name, last_name) VALUES
('john_doe', 'john@example.com', 'John', 'Doe'),
('jane_smith', 'jane@example.com', 'Jane', 'Smith'),
('bob_wilson', 'bob@example.com', 'Bob', 'Wilson'),
('alice_brown', 'alice@example.com', 'Alice', 'Brown'),
('charlie_davis', 'charlie@example.com', 'Charlie', 'Davis');

-- Insert sample categories
INSERT INTO dev.categories (name, description, sort_order) VALUES
('Electronics', 'Electronic devices and accessories', 1),
('Clothing', 'Apparel and fashion items', 2),
('Books', 'Books and educational materials', 3),
('Home & Garden', 'Home improvement and garden supplies', 4),
('Sports', 'Sports equipment and accessories', 5);

-- Insert subcategories
INSERT INTO dev.categories (name, description, parent_id, sort_order) VALUES
('Smartphones', 'Mobile phones and accessories', 1, 1),
('Laptops', 'Portable computers', 1, 2),
('Headphones', 'Audio accessories', 1, 3),
('Men''s Clothing', 'Clothing for men', 2, 1),
('Women''s Clothing', 'Clothing for women', 2, 2),
('Fiction', 'Fiction books', 3, 1),
('Non-Fiction', 'Educational and reference books', 3, 2);

-- Insert sample products
INSERT INTO dev.products (name, description, sku, category_id, price, cost, stock_quantity, weight_kg, dimensions_cm, metadata) VALUES
('iPhone 15 Pro', 'Latest Apple smartphone', 'IPH15PRO-128', 6, 999.99, 750.00, 50, 0.187, '{"length": 14.67, "width": 7.15, "height": 0.83}', '{"color": "Natural Titanium", "storage": "128GB"}'),
('MacBook Air M2', 'Apple laptop with M2 chip', 'MBA-M2-256', 7, 1199.99, 900.00, 25, 1.24, '{"length": 30.41, "width": 21.5, "height": 1.13}', '{"color": "Space Gray", "storage": "256GB"}'),
('AirPods Pro', 'Wireless earbuds with noise cancellation', 'APP-2ND', 8, 249.99, 150.00, 100, 0.056, '{"length": 6.0, "width": 4.5, "height": 2.0}', '{"color": "White", "generation": "2nd"}'),
('Cotton T-Shirt', 'Comfortable cotton t-shirt', 'TSHIRT-COTTON-M', 9, 19.99, 8.00, 200, 0.2, '{"length": 71, "width": 51, "height": 1}', '{"size": "M", "color": "White", "material": "100% Cotton"}'),
('Programming Book', 'Learn JavaScript programming', 'BOOK-JS-2024', 11, 49.99, 25.00, 75, 0.8, '{"length": 23, "width": 18, "height": 3}', '{"author": "John Developer", "pages": 400, "language": "English"}');

-- Insert sample orders
INSERT INTO dev.orders (user_id, order_number, status, total_amount, tax_amount, shipping_amount, shipping_address, billing_address, notes) VALUES
(1, 'ORD-2024-001', 'delivered', 1049.98, 84.00, 15.99, '{"street": "123 Main St", "city": "New York", "state": "NY", "zip": "10001"}', '{"street": "123 Main St", "city": "New York", "state": "NY", "zip": "10001"}', 'Gift wrapping requested'),
(2, 'ORD-2024-002', 'shipped', 269.98, 21.60, 9.99, '{"street": "456 Oak Ave", "city": "Los Angeles", "state": "CA", "zip": "90210"}', '{"street": "456 Oak Ave", "city": "Los Angeles", "state": "CA", "zip": "90210"}', ''),
(3, 'ORD-2024-003', 'processing', 69.98, 5.60, 7.99, '{"street": "789 Pine St", "city": "Chicago", "state": "IL", "zip": "60601"}', '{"street": "789 Pine St", "city": "Chicago", "state": "IL", "zip": "60601"}', 'Rush delivery');

-- Insert sample order items
INSERT INTO dev.order_items (order_id, product_id, quantity, unit_price, total_price) VALUES
(1, 1, 1, 999.99, 999.99),
(1, 3, 1, 49.99, 49.99),
(2, 2, 1, 1199.99, 1199.99),
(2, 3, 1, 249.99, 249.99),
(3, 4, 2, 19.99, 39.98),
(3, 5, 1, 49.99, 49.99);

-- Insert sample inventory logs
INSERT INTO dev.inventory_logs (product_id, change_type, quantity_change, previous_quantity, new_quantity, reason, reference_id, created_by) VALUES
(1, 'in', 50, 0, 50, 'Initial stock', 'INIT-001', 1),
(2, 'in', 25, 0, 25, 'Initial stock', 'INIT-002', 1),
(3, 'in', 100, 0, 100, 'Initial stock', 'INIT-003', 1),
(4, 'in', 200, 0, 200, 'Initial stock', 'INIT-004', 1),
(5, 'in', 75, 0, 75, 'Initial stock', 'INIT-005', 1);

-- ===========================================
-- PROD SCHEMA - Target Database (Incomplete/Outdated)
-- ===========================================

-- Switch to prod schema
SET search_path TO prod, public;

-- Create users table (missing some columns)
CREATE TABLE prod.users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    -- Missing: is_active, created_at, updated_at
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create categories table (different structure)
CREATE TABLE prod.categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    -- Missing: parent_id, sort_order, is_active, created_at
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create products table (missing many columns)
CREATE TABLE prod.products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    sku VARCHAR(50) UNIQUE NOT NULL,
    category_id INTEGER REFERENCES prod.categories(id),
    price DECIMAL(10,2) NOT NULL,
    -- Missing: cost, stock_quantity, is_active, weight_kg, dimensions_cm, metadata, created_at, updated_at
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create orders table (simplified)
CREATE TABLE prod.orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES prod.users(id),
    order_number VARCHAR(20) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    total_amount DECIMAL(12,2) NOT NULL,
    -- Missing: tax_amount, shipping_amount, discount_amount, shipping_address, billing_address, notes, created_at, updated_at, shipped_at, delivered_at
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Missing tables: order_items, inventory_logs

-- Create some basic indexes for prod
CREATE INDEX idx_prod_users_email ON prod.users(email);
CREATE INDEX idx_prod_products_sku ON prod.products(sku);
CREATE INDEX idx_prod_orders_user ON prod.orders(user_id);

-- Insert some sample data for prod (different from dev)
INSERT INTO prod.users (username, email, first_name, last_name) VALUES
('admin', 'admin@company.com', 'Admin', 'User'),
('test_user', 'test@company.com', 'Test', 'User');

INSERT INTO prod.categories (name, description) VALUES
('Electronics', 'Electronic devices'),
('Books', 'Books and materials');

INSERT INTO prod.products (name, description, sku, category_id, price) VALUES
('Old Product', 'This is an old product', 'OLD-001', 1, 99.99),
('Another Product', 'Another old product', 'OLD-002', 2, 29.99);

INSERT INTO prod.orders (user_id, order_number, status, total_amount) VALUES
(1, 'OLD-001', 'delivered', 99.99),
(2, 'OLD-002', 'pending', 29.99);

-- ===========================================
-- FUNCTIONS FOR PROD SCHEMA (Different/Outdated)
-- ===========================================

-- Simple function in prod
CREATE OR REPLACE FUNCTION prod.get_user_count()
RETURNS INTEGER AS $$
BEGIN
    RETURN (SELECT COUNT(*) FROM prod.users);
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- GRANT PERMISSIONS
-- ===========================================

-- Grant read-only access to a test user (if you want to test with a specific user)
-- CREATE USER ddp_test_user WITH PASSWORD 'ddp_test_password';
-- GRANT USAGE ON SCHEMA dev, prod TO ddp_test_user;
-- GRANT SELECT ON ALL TABLES IN SCHEMA dev, prod TO ddp_test_user;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA dev, prod TO ddp_test_user;

-- ===========================================
-- SUMMARY
-- ===========================================

-- Display summary
SELECT 'DEV Schema Summary' as info;
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables 
WHERE schemaname = 'dev'
ORDER BY tablename;

SELECT 'PROD Schema Summary' as info;
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables 
WHERE schemaname = 'prod'
ORDER BY tablename;

SELECT 'Functions Summary' as info;
SELECT 
    n.nspname as schema_name,
    p.proname as function_name,
    pg_get_function_result(p.oid) as return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname IN ('dev', 'prod')
ORDER BY n.nspname, p.proname;

-- Reset search path
SET search_path TO public;
