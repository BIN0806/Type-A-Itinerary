#!/bin/bash
# Quick test runner for Plan_A backend

echo "Plan_A Backend Test Runner"
echo "=========================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "Error: Docker is not running. Please start Docker first."
    exit 1
fi

# Check if backend container exists
if ! docker ps -a --format '{{.Names}}' | grep -q "plana_backend"; then
    echo "Error: plana_backend container not found. Please start the backend with 'docker compose up' first."
    exit 1
fi

# Parse command line arguments
TEST_TYPE="${1:-all}"

case $TEST_TYPE in
    all)
        echo "Running all tests..."
        docker exec plana_backend python -m pytest tests/ -v
        ;;
    unit)
        echo "Running unit tests only (skipping integration)..."
        docker exec plana_backend python -m pytest -m "not integration" -v
        ;;
    integration)
        echo "Running integration tests only..."
        docker exec plana_backend python -m pytest -m integration -v
        ;;
    coverage)
        echo "Running tests with coverage report..."
        docker exec plana_backend python -m pytest --cov=app --cov-report=html --cov-report=term
        echo ""
        echo "Coverage report generated in htmlcov/index.html"
        ;;
    fast)
        echo "Running fast tests only..."
        docker exec plana_backend python -m pytest tests/utils/ -v
        ;;
    services)
        echo "Running service tests..."
        docker exec plana_backend python -m pytest tests/services/ -v
        ;;
    *)
        echo "Usage: ./run_tests.sh [all|unit|integration|coverage|fast|services]"
        echo ""
        echo "Options:"
        echo "  all          - Run all tests (default)"
        echo "  unit         - Run unit tests only (no Tesseract required)"
        echo "  integration  - Run integration tests only (requires Tesseract)"
        echo "  coverage     - Run with coverage report"
        echo "  fast         - Run fast utility tests only"
        echo "  services     - Run service tests only"
        exit 1
        ;;
esac

exit $?
