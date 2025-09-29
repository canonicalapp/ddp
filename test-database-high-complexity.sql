-- ===========================================
-- DDP Test Database Setup Script - HIGH COMPLEXITY (Simplified)
-- ===========================================

-- Create schemas
CREATE SCHEMA IF NOT EXISTS dev_high;
CREATE SCHEMA IF NOT EXISTS prod_high;

-- Set search path
SET search_path TO dev_high, public;

-- ===========================================
-- DEV_HIGH SCHEMA - Complex Database
-- ===========================================

-- Base reference tables
CREATE TABLE dev_high.organizations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL,
    parent_org_id INTEGER REFERENCES dev_high.organizations(id),
    tax_id VARCHAR(50) UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dev_high.countries (
    id SERIAL PRIMARY KEY,
    code VARCHAR(3) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    currency_code VARCHAR(3) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dev_high.regions (
    id SERIAL PRIMARY KEY,
    country_id INTEGER REFERENCES dev_high.countries(id),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(10) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dev_high.cities (
    id SERIAL PRIMARY KEY,
    region_id INTEGER REFERENCES dev_high.regions(id),
    name VARCHAR(100) NOT NULL,
    postal_code VARCHAR(20),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User management
CREATE TABLE dev_high.departments (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES dev_high.organizations(id),
    name VARCHAR(100) NOT NULL,
    parent_dept_id INTEGER REFERENCES dev_high.departments(id),
    manager_id INTEGER, -- Will reference users
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dev_high.user_roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    permissions JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dev_high.users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    role_id INTEGER REFERENCES dev_high.user_roles(id),
    department_id INTEGER REFERENCES dev_high.departments(id),
    manager_id INTEGER REFERENCES dev_high.users(id),
    city_id INTEGER REFERENCES dev_high.cities(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key for department manager
ALTER TABLE dev_high.departments ADD CONSTRAINT fk_departments_manager 
    FOREIGN KEY (manager_id) REFERENCES dev_high.users(id);

-- Product catalog
CREATE TABLE dev_high.categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    parent_id INTEGER REFERENCES dev_high.categories(id),
    slug VARCHAR(100) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dev_high.brands (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    organization_id INTEGER REFERENCES dev_high.organizations(id),
    country_id INTEGER REFERENCES dev_high.countries(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dev_high.suppliers (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES dev_high.organizations(id),
    name VARCHAR(200) NOT NULL,
    city_id INTEGER REFERENCES dev_high.cities(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dev_high.products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    sku VARCHAR(50) UNIQUE NOT NULL,
    category_id INTEGER REFERENCES dev_high.categories(id),
    brand_id INTEGER REFERENCES dev_high.brands(id),
    supplier_id INTEGER REFERENCES dev_high.suppliers(id),
    price DECIMAL(12,2) NOT NULL,
    cost DECIMAL(12,2),
    stock_quantity INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Order management
CREATE TABLE dev_high.order_statuses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    is_final BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dev_high.payment_methods (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dev_high.orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES dev_high.users(id),
    order_number VARCHAR(20) UNIQUE NOT NULL,
    status_id INTEGER REFERENCES dev_high.order_statuses(id),
    payment_method_id INTEGER REFERENCES dev_high.payment_methods(id),
    total_amount DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dev_high.order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES dev_high.orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES dev_high.products(id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    total_price DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Inventory management
CREATE TABLE dev_high.warehouses (
    id SERIAL PRIMARY KEY,
    organization_id INTEGER REFERENCES dev_high.organizations(id),
    name VARCHAR(100) NOT NULL,
    city_id INTEGER REFERENCES dev_high.cities(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dev_high.inventory (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES dev_high.products(id),
    warehouse_id INTEGER REFERENCES dev_high.warehouses(id),
    quantity INTEGER NOT NULL DEFAULT 0,
    reserved_quantity INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(product_id, warehouse_id)
);

CREATE TABLE dev_high.inventory_transactions (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES dev_high.products(id),
    warehouse_id INTEGER REFERENCES dev_high.warehouses(id),
    transaction_type VARCHAR(20) NOT NULL,
    quantity_change INTEGER NOT NULL,
    reason VARCHAR(200),
    created_by INTEGER REFERENCES dev_high.users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_organizations_parent ON dev_high.organizations(parent_org_id);
CREATE INDEX idx_regions_country ON dev_high.regions(country_id);
CREATE INDEX idx_cities_region ON dev_high.cities(region_id);
CREATE INDEX idx_departments_org ON dev_high.departments(organization_id);
CREATE INDEX idx_departments_parent ON dev_high.departments(parent_dept_id);
CREATE INDEX idx_users_role ON dev_high.users(role_id);
CREATE INDEX idx_users_department ON dev_high.users(department_id);
CREATE INDEX idx_users_manager ON dev_high.users(manager_id);
CREATE INDEX idx_users_city ON dev_high.users(city_id);
CREATE INDEX idx_categories_parent ON dev_high.categories(parent_id);
CREATE INDEX idx_brands_org ON dev_high.brands(organization_id);
CREATE INDEX idx_products_category ON dev_high.products(category_id);
CREATE INDEX idx_products_brand ON dev_high.products(brand_id);
CREATE INDEX idx_products_supplier ON dev_high.products(supplier_id);
CREATE INDEX idx_orders_user ON dev_high.orders(user_id);
CREATE INDEX idx_orders_status ON dev_high.orders(status_id);
CREATE INDEX idx_order_items_order ON dev_high.order_items(order_id);
CREATE INDEX idx_order_items_product ON dev_high.order_items(product_id);
CREATE INDEX idx_inventory_product ON dev_high.inventory(product_id);
CREATE INDEX idx_inventory_warehouse ON dev_high.inventory(warehouse_id);

-- Create constraints
ALTER TABLE dev_high.order_items ADD CONSTRAINT chk_order_item_total CHECK (total_price = quantity * unit_price);
ALTER TABLE dev_high.inventory ADD CONSTRAINT chk_inventory_available CHECK (quantity >= reserved_quantity);

-- ===========================================
-- FUNCTIONS AND PROCEDURES
-- ===========================================

CREATE OR REPLACE FUNCTION dev_high.calculate_order_total(order_id INTEGER)
RETURNS DECIMAL(12,2) AS $$
DECLARE
    total DECIMAL(12,2);
BEGIN
    SELECT COALESCE(SUM(total_price), 0)
    INTO total
    FROM dev_high.order_items
    WHERE order_id = $1;
    
    RETURN total;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION dev_high.update_inventory(
    p_product_id INTEGER,
    p_warehouse_id INTEGER,
    p_quantity_change INTEGER,
    p_reason VARCHAR(200),
    p_created_by INTEGER
) RETURNS INTEGER AS $$
DECLARE
    current_quantity INTEGER;
    new_quantity INTEGER;
BEGIN
    SELECT COALESCE(quantity, 0) INTO current_quantity
    FROM dev_high.inventory
    WHERE product_id = p_product_id AND warehouse_id = p_warehouse_id;
    
    new_quantity := current_quantity + p_quantity_change;
    
    INSERT INTO dev_high.inventory (product_id, warehouse_id, quantity)
    VALUES (p_product_id, p_warehouse_id, new_quantity)
    ON CONFLICT (product_id, warehouse_id)
    DO UPDATE SET 
        quantity = new_quantity,
        updated_at = CURRENT_TIMESTAMP;
    
    INSERT INTO dev_high.inventory_transactions (
        product_id, warehouse_id, transaction_type, quantity_change,
        reason, created_by
    ) VALUES (
        p_product_id, p_warehouse_id, 'adjustment', p_quantity_change,
        p_reason, p_created_by
    );
    
    RETURN new_quantity;
END;
$$ LANGUAGE plpgsql;

-- ===========================================
-- TRIGGERS
-- ===========================================

CREATE OR REPLACE FUNCTION dev_high.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_organizations_updated_at
    BEFORE UPDATE ON dev_high.organizations
    FOR EACH ROW EXECUTE FUNCTION dev_high.update_updated_at_column();

CREATE TRIGGER tr_users_updated_at
    BEFORE UPDATE ON dev_high.users
    FOR EACH ROW EXECUTE FUNCTION dev_high.update_updated_at_column();

CREATE TRIGGER tr_products_updated_at
    BEFORE UPDATE ON dev_high.products
    FOR EACH ROW EXECUTE FUNCTION dev_high.update_updated_at_column();

CREATE TRIGGER tr_orders_updated_at
    BEFORE UPDATE ON dev_high.orders
    FOR EACH ROW EXECUTE FUNCTION dev_high.update_updated_at_column();

CREATE TRIGGER tr_inventory_updated_at
    BEFORE UPDATE ON dev_high.inventory
    FOR EACH ROW EXECUTE FUNCTION dev_high.update_updated_at_column();

-- ===========================================
-- SAMPLE DATA
-- ===========================================

-- Insert organizations
INSERT INTO dev_high.organizations (name, type, tax_id) VALUES
('Acme Corporation', 'company', '12-3456789'),
('Global Tech Inc', 'company', '98-7654321');

-- Insert countries
INSERT INTO dev_high.countries (code, name, currency_code) VALUES
('USA', 'United States', 'USD'),
('CAN', 'Canada', 'CAD');

-- Insert regions
INSERT INTO dev_high.regions (country_id, name, code) VALUES
(1, 'California', 'CA'),
(1, 'Texas', 'TX'),
(2, 'Ontario', 'ON');

-- Insert cities
INSERT INTO dev_high.cities (region_id, name, postal_code) VALUES
(1, 'Los Angeles', '90210'),
(1, 'San Francisco', '94102'),
(2, 'Houston', '77001'),
(3, 'Toronto', 'M5H 2N2');

-- Insert departments
INSERT INTO dev_high.departments (organization_id, name) VALUES
(1, 'Engineering'),
(1, 'Sales'),
(2, 'Research & Development');

-- Insert user roles
INSERT INTO dev_high.user_roles (name, permissions) VALUES
('super_admin', '{"all": true}'),
('admin', '{"users": true, "products": true, "orders": true}'),
('manager', '{"team": true, "orders": true, "inventory": true}'),
('employee', '{"orders": true, "inventory": true}'),
('customer', '{"profile": true, "orders": true}');

-- Insert users
INSERT INTO dev_high.users (username, email, password_hash, first_name, last_name, role_id, department_id, city_id) VALUES
('superadmin', 'superadmin@acme.com', 'hashed_password_1', 'Super', 'Admin', 1, 1, 1),
('admin1', 'admin@acme.com', 'hashed_password_2', 'John', 'Admin', 2, 1, 2),
('manager1', 'manager@acme.com', 'hashed_password_3', 'Jane', 'Manager', 3, 2, 3),
('customer1', 'customer1@example.com', 'hashed_password_5', 'Alice', 'Customer', 5, NULL, 4);

-- Update department managers
UPDATE dev_high.departments SET manager_id = 1 WHERE id = 1;
UPDATE dev_high.departments SET manager_id = 3 WHERE id = 2;

-- Insert categories
INSERT INTO dev_high.categories (name, slug) VALUES
('Electronics', 'electronics'),
('Clothing', 'clothing'),
('Books', 'books');

-- Insert subcategories
INSERT INTO dev_high.categories (name, parent_id, slug) VALUES
('Smartphones', 1, 'smartphones'),
('Laptops', 1, 'laptops'),
('Men''s Clothing', 2, 'mens-clothing');

-- Insert brands
INSERT INTO dev_high.brands (name, organization_id, country_id) VALUES
('Apple', 1, 1),
('Samsung', 2, 1),
('Nike', 1, 1);

-- Insert suppliers
INSERT INTO dev_high.suppliers (organization_id, name, city_id) VALUES
(1, 'Tech Supplier Inc', 1),
(1, 'Electronics Plus', 2);

-- Insert products
INSERT INTO dev_high.products (name, sku, category_id, brand_id, supplier_id, price, cost, stock_quantity) VALUES
('iPhone 15 Pro', 'IPH15PRO-128', 4, 1, 1, 999.99, 750.00, 50),
('MacBook Air M2', 'MBA-M2-256', 5, 1, 1, 1199.99, 900.00, 25),
('Galaxy S24', 'GAL-S24-256', 4, 2, 2, 899.99, 650.00, 30),
('Nike Air Max', 'NIKE-AM-10', 6, 3, 1, 129.99, 80.00, 100);

-- Insert order statuses
INSERT INTO dev_high.order_statuses (name, is_final) VALUES
('pending', false),
('processing', false),
('shipped', false),
('delivered', true),
('cancelled', true);

-- Insert payment methods
INSERT INTO dev_high.payment_methods (name) VALUES
('Credit Card'),
('PayPal'),
('Bank Transfer');

-- Insert warehouses
INSERT INTO dev_high.warehouses (organization_id, name, city_id) VALUES
(1, 'Main Warehouse', 1),
(1, 'East Coast Warehouse', 2);

-- Insert inventory
INSERT INTO dev_high.inventory (product_id, warehouse_id, quantity, reserved_quantity) VALUES
(1, 1, 30, 0),
(1, 2, 20, 0),
(2, 1, 15, 0),
(3, 1, 20, 0),
(4, 1, 50, 0);

-- Insert orders
INSERT INTO dev_high.orders (user_id, order_number, status_id, payment_method_id, total_amount) VALUES
(4, 'ORD-HIGH-001', 4, 1, 1049.98),
(4, 'ORD-HIGH-002', 3, 2, 1029.98);

-- Insert order items
INSERT INTO dev_high.order_items (order_id, product_id, quantity, unit_price, total_price) VALUES
(1, 1, 1, 999.99, 999.99),
(1, 2, 1, 49.99, 49.99),
(2, 2, 1, 1199.99, 1199.99),
(2, 3, 1, 899.99, 899.99);

-- ===========================================
-- PROD_HIGH SCHEMA - Incomplete Target
-- ===========================================

SET search_path TO prod_high, public;

-- Simplified tables
CREATE TABLE prod_high.organizations (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    type VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prod_high.users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prod_high.products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    sku VARCHAR(50) UNIQUE NOT NULL,
    price DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE prod_high.orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES prod_high.users(id),
    order_number VARCHAR(20) UNIQUE NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Basic indexes
CREATE INDEX idx_prod_high_users_email ON prod_high.users(email);
CREATE INDEX idx_prod_high_products_sku ON prod_high.products(sku);
CREATE INDEX idx_prod_high_orders_user ON prod_high.orders(user_id);

-- Sample data
INSERT INTO prod_high.organizations (name, type) VALUES
('Old Company', 'company'),
('Legacy Corp', 'company');

INSERT INTO prod_high.users (username, email, password_hash, first_name, last_name) VALUES
('oldadmin', 'admin@oldcompany.com', 'old_hashed_password', 'Old', 'Admin'),
('legacyuser', 'user@legacy.com', 'old_hashed_password', 'Legacy', 'User');

INSERT INTO prod_high.products (name, sku, price) VALUES
('Legacy Product', 'LEGACY-001', 99.99),
('Old Product', 'OLD-002', 29.99);

INSERT INTO prod_high.orders (user_id, order_number, total_amount) VALUES
(1, 'LEGACY-001', 99.99),
(2, 'OLD-002', 29.99);

-- Simple function
CREATE OR REPLACE FUNCTION prod_high.get_organization_count()
RETURNS INTEGER AS $$
BEGIN
    RETURN (SELECT COUNT(*) FROM prod_high.organizations);
END;
$$ LANGUAGE plpgsql;

-- Summary
SELECT 'DEV_HIGH Schema Summary' as info;
SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'dev_high' ORDER BY tablename;

SELECT 'PROD_HIGH Schema Summary' as info;
SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'prod_high' ORDER BY tablename;

SET search_path TO public;


