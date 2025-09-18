#!/bin/bash

# DDP Test Runner Script
# This script helps you run the database setup and test commands

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="test-sync"
DB_USER="postgres"
DB_PASSWORD="root"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Commands:"
    echo "  setup     - Set up test database schemas"
    echo "  test-gen  - Test gen command"
    echo "  test-sync - Test sync command"
    echo "  clean     - Clean up test data and files"
    echo "  help      - Show this help message"
    echo ""
    echo "Documentation:"
    echo "  See docs/TESTING_GUIDE.md for detailed manual testing instructions"
    echo "  See docs/README_TESTING.md for quick reference"
    echo ""
    echo "Options:"
    echo "  --host HOST       Database host (default: localhost)"
    echo "  --port PORT       Database port (default: 5432)"
    echo "  --database NAME   Database name (required)"
    echo "  --username USER   Database username (required)"
    echo "  --password PASS   Database password (required)"
    echo ""
    echo "Examples:"
    echo "  $0 setup --database mydb --username myuser --password mypass"
    echo "  $0 test-gen --database mydb --username myuser --password mypass"
    echo "  $0 test-sync --database mydb --username myuser --password mypass"
}

# Function to parse arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            --host)
                DB_HOST="$2"
                shift 2
                ;;
            --port)
                DB_PORT="$2"
                shift 2
                ;;
            --database)
                DB_NAME="$2"
                shift 2
                ;;
            --username)
                DB_USER="$2"
                shift 2
                ;;
            --password)
                DB_PASSWORD="$2"
                shift 2
                ;;
            *)
                COMMAND="$1"
                shift
                ;;
        esac
    done
}

# Function to validate required parameters
validate_params() {
    if [[ -z "$DB_NAME" || -z "$DB_USER" || -z "$DB_PASSWORD" ]]; then
        print_error "Missing required parameters: --database, --username, --password"
        echo ""
        show_usage
        exit 1
    fi
}

# Function to check if PostgreSQL is accessible
check_postgres() {
    print_status "Checking PostgreSQL connection..."
    if ! PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
        print_error "Cannot connect to PostgreSQL database"
        print_error "Please check your connection parameters and ensure PostgreSQL is running"
        print_error "Tried: psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"
        exit 1
    fi
    print_success "PostgreSQL connection successful"
}

# Function to setup test database
setup_database() {
    print_status "Setting up test database schemas..."
    
    if [[ ! -f "test-database-setup.sql" ]]; then
        print_error "test-database-setup.sql not found in current directory"
        exit 1
    fi
    
    # Check if schemas already exist and ask user what to do
    SCHEMA_EXISTS=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name IN ('dev', 'prod');" 2>/dev/null | tr -d ' ')
    
    if [[ "$SCHEMA_EXISTS" -gt 0 ]]; then
        print_warning "Schemas 'dev' and/or 'prod' already exist in the database."
        read -p "Do you want to drop and recreate them? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            print_status "Dropping existing schemas..."
            PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "DROP SCHEMA IF EXISTS dev CASCADE; DROP SCHEMA IF EXISTS prod CASCADE;" > /dev/null 2>&1
            print_success "Existing schemas dropped"
        else
            print_warning "Keeping existing schemas. Some errors may occur during setup."
        fi
    fi
    
    print_status "Running database setup script..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f test-database-setup.sql
    
    print_success "Test database setup completed"
    print_status "Created schemas: dev (complete) and prod (incomplete)"
}

# Function to test gen command
test_gen() {
    print_status "Testing gen command..."
    
    # Build the project first
    print_status "Building project..."
    npm run build
    
    # Create output directory
    mkdir -p test-output
    
    # Test dev schema generation
    print_status "Generating dev schema..."
    npm run dev gen -- \
        --host "$DB_HOST" \
        --port "$DB_PORT" \
        --database "$DB_NAME" \
        --username "$DB_USER" \
        --password "$DB_PASSWORD" \
        --schema dev \
        --output ./test-output/dev
    
    # Test prod schema generation
    print_status "Generating prod schema..."
    npm run dev gen -- \
        --host "$DB_HOST" \
        --port "$DB_PORT" \
        --database "$DB_NAME" \
        --username "$DB_USER" \
        --password "$DB_PASSWORD" \
        --schema prod \
        --output ./test-output/prod
    
    # Test individual components
    print_status "Testing individual components..."
    
    # Schema only
    npm run dev gen -- --schema-only \
        --host "$DB_HOST" \
        --port "$DB_PORT" \
        --database "$DB_NAME" \
        --username "$DB_USER" \
        --password "$DB_PASSWORD" \
        --schema dev \
        --output ./test-output/dev-schema-only
    
    # Procedures only
    npm run dev gen -- --procs-only \
        --host "$DB_HOST" \
        --port "$DB_PORT" \
        --database "$DB_NAME" \
        --username "$DB_USER" \
        --password "$DB_PASSWORD" \
        --schema dev \
        --output ./test-output/dev-procs-only
    
    # Triggers only
    npm run dev gen -- --triggers-only \
        --host "$DB_HOST" \
        --port "$DB_PORT" \
        --database "$DB_NAME" \
        --username "$DB_USER" \
        --password "$DB_PASSWORD" \
        --schema dev \
        --output ./test-output/dev-triggers-only
    
    print_success "Gen command tests completed"
    print_status "Generated files in test-output/ directory"
    
    # Show file summary
    print_status "Generated files:"
    ls -la test-output/
    echo ""
    print_status "File sizes:"
    wc -l test-output/dev/*.sql 2>/dev/null || true
    wc -l test-output/prod/*.sql 2>/dev/null || true
}

# Function to test sync command
test_sync() {
    print_status "Testing sync command..."
    
    # Test basic sync
    print_status "Running sync from dev to prod..."
    npm run dev sync -- \
        --source-host "$DB_HOST" \
        --source-port "$DB_PORT" \
        --source-database "$DB_NAME" \
        --source-username "$DB_USER" \
        --source-password "$DB_PASSWORD" \
        --source-schema dev \
        --target-host "$DB_HOST" \
        --target-port "$DB_PORT" \
        --target-database "$DB_NAME" \
        --target-username "$DB_USER" \
        --target-password "$DB_PASSWORD" \
        --target-schema prod \
        --output ./test-output/alter.sql
    
    # Test dry run
    print_status "Running dry run sync..."
    npm run dev sync -- --dry-run \
        --source-host "$DB_HOST" \
        --source-port "$DB_PORT" \
        --source-database "$DB_NAME" \
        --source-username "$DB_USER" \
        --source-password "$DB_PASSWORD" \
        --source-schema dev \
        --target-host "$DB_HOST" \
        --target-port "$DB_PORT" \
        --target-database "$DB_NAME" \
        --target-username "$DB_USER" \
        --target-password "$DB_PASSWORD" \
        --target-schema prod
    
    print_success "Sync command tests completed"
    print_status "Generated alter.sql file"
    
    # Show alter.sql summary
    if [[ -f "test-output/alter.sql" ]]; then
        print_status "Alter script summary:"
        wc -l test-output/alter.sql
        echo ""
        print_status "First 20 lines of alter.sql:"
        head -20 test-output/alter.sql
    fi
}

# Function to clean up
cleanup() {
    print_status "Cleaning up test data and files..."
    
    # Remove generated files
    if [[ -d "test-output" ]]; then
        rm -rf test-output/
        print_success "Removed test-output directory"
    fi
    
    # Ask if user wants to remove database schemas
    read -p "Do you want to remove the dev and prod schemas from the database? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Removing database schemas..."
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "DROP SCHEMA IF EXISTS dev CASCADE; DROP SCHEMA IF EXISTS prod CASCADE;"
        print_success "Database schemas removed"
    else
        print_warning "Database schemas kept (dev and prod)"
    fi
    
    print_success "Cleanup completed"
}

# Main script logic
main() {
    if [[ $# -eq 0 ]]; then
        show_usage
        exit 1
    fi
    
    COMMAND="$1"
    shift
    
    parse_args "$@"
    
    case "$COMMAND" in
        setup)
            validate_params
            check_postgres
            setup_database
            ;;
        test-gen)
            validate_params
            check_postgres
            test_gen
            ;;
        test-sync)
            validate_params
            check_postgres
            test_sync
            ;;
        clean)
            validate_params
            cleanup
            ;;
        help)
            show_usage
            ;;
        *)
            print_error "Unknown command: $COMMAND"
            echo ""
            show_usage
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@"
