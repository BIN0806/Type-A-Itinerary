#!/bin/bash
# Unified test runner for TypeA-Itinerary
# Runs all tests with categorization by section

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║         TypeA-Itinerary Test Suite - All Tests            ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

FAILED=0
PASSED=0

# Function to print section header
print_section() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
}

# Function to run tests and capture result
run_test_suite() {
    local name=$1
    local command=$2
    local dir=$3
    
    if [ -n "$dir" ]; then
        cd "$dir" || exit 1
    fi
    
    if eval "$command"; then
        echo -e "${GREEN}✓${NC} $name: PASSED"
        ((PASSED++))
        if [ -n "$dir" ]; then
            cd - > /dev/null || exit 1
        fi
        return 0
    else
        echo -e "${RED}✗${NC} $name: FAILED"
        ((FAILED++))
        if [ -n "$dir" ]; then
            cd - > /dev/null || exit 1
        fi
        return 1
    fi
}

# Get root directory
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

# ============================================================================
# SECTION 1: MOBILE TESTS
# ============================================================================
print_section "SECTION 1: MOBILE APP TESTS (Jest/React Native)"

# Check if mobile node_modules exists
if [ ! -d "mobile/node_modules" ]; then
    echo -e "${YELLOW}⚠${NC}  Mobile dependencies not installed. Installing..."
    cd mobile && npm install && cd ..
fi

# 1.1 API Service Tests
run_test_suite "API Service Tests" "npm test -- api.test.ts" "mobile" || true

# 1.2 Auth Tests
run_test_suite "Auth/Registration Tests" "npm test -- RegisterScreen.test.tsx" "mobile" || true

# 1.3 ItineraryBuilder Tests
run_test_suite "ItineraryBuilder/Upload Tests" "npm test -- UploadScreen.test.tsx" "mobile" || true
run_test_suite "ItineraryBuilder/Confirmation Tests" "npm test -- ConfirmationScreen.test.tsx" "mobile" || true

# ============================================================================
# SECTION 2: BACKEND TESTS
# ============================================================================
print_section "SECTION 2: BACKEND TESTS (Pytest/Python)"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}✗${NC} Docker is not running. Skipping backend tests."
    echo -e "${YELLOW}⚠${NC}  Start Docker to run backend tests."
    ((FAILED++))
else
    # Check if backend container exists
    if ! docker ps -a --format '{{.Names}}' | grep -q "plana_backend"; then
        echo -e "${YELLOW}⚠${NC}  Backend container not found. Skipping backend tests."
        echo -e "${YELLOW}⚠${NC}  Start backend with 'docker compose up' to run tests."
        ((FAILED++))
    else
        # 2.1 Core Tests
        echo -e "\n${YELLOW}Category: Core Configuration & Database${NC}"
        run_test_suite "Config Tests" "docker exec plana_backend python -m pytest tests/core/ -v" "" || true
        
        # 2.2 Service Tests
        echo -e "\n${YELLOW}Category: Business Logic Services${NC}"
        run_test_suite "OCR Service Tests" "docker exec plana_backend python -m pytest tests/services/test_ocr_service.py -v" "" || true
        run_test_suite "Entity Extractor Tests" "docker exec plana_backend python -m pytest tests/services/test_entity_extractor.py -v" "" || true
        run_test_suite "Entity Resolver Tests" "docker exec plana_backend python -m pytest tests/services/test_entity_resolver.py -v" "" || true
        
        # 2.3 Utility Tests
        echo -e "\n${YELLOW}Category: Utility Functions${NC}"
        run_test_suite "Text Utils Tests" "docker exec plana_backend python -m pytest tests/utils/test_text_utils.py -v" "" || true
        run_test_suite "Geo Utils Tests" "docker exec plana_backend python -m pytest tests/utils/test_geo_utils.py -v" "" || true
        
        # 2.4 Integration Tests
        echo -e "\n${YELLOW}Category: Integration & Optimization${NC}"
        run_test_suite "Optimizer Tests" "docker exec plana_backend python -m pytest tests/test_optimizer.py -v" "" || true
    fi
fi

# ============================================================================
# SUMMARY
# ============================================================================
print_section "TEST SUMMARY"

TOTAL=$((PASSED + FAILED))

echo -e "Total Test Suites: ${TOTAL}"
echo -e "${GREEN}Passed: ${PASSED}${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Failed: ${FAILED}${NC}"
else
    echo -e "${GREEN}Failed: 0${NC}"
fi
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║              All Tests Passed! ✓                           ║${NC}"
    echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 0
else
    echo -e "${RED}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║         Some Tests Failed. See output above. ✗            ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════════════════════════╝${NC}"
    exit 1
fi
