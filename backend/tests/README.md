# V2V Backend Tests

## Test Structure

```
tests/
├── utils/
│   ├── test_text_utils.py          # Text processing tests
│   └── test_geo_utils.py            # Geographic utilities tests
├── services/
│   ├── test_entity_extractor.py    # Entity extraction tests
│   ├── test_entity_resolver.py     # Deduplication tests
│   └── test_ocr_service.py          # OCR tests (requires Tesseract)
└── test_optimizer.py                # Existing TSP tests
```

## Running Tests

### All Tests
```bash
cd backend
pytest tests/ -v
```

### Specific Test Suite
```bash
# Text utilities
pytest tests/utils/test_text_utils.py -v

# Geographic utilities
pytest tests/utils/test_geo_utils.py -v

# Entity extractor
pytest tests/services/test_entity_extractor.py -v

# Entity resolver
pytest tests/services/test_entity_resolver.py -v

# OCR service (integration tests)
pytest tests/services/test_ocr_service.py -v
```

### Skip Integration Tests
Integration tests require Tesseract to be installed. To skip them:

```bash
pytest -m "not integration" -v
```

### Run Only Integration Tests
```bash
pytest -m integration -v
```

### With Coverage Report
```bash
pytest --cov=app --cov-report=html
# Open htmlcov/index.html in browser
```

### Run Specific Test Class
```bash
pytest tests/utils/test_text_utils.py::TestNormalizeText -v
```

### Run Specific Test Method
```bash
pytest tests/utils/test_text_utils.py::TestNormalizeText::test_lowercase_conversion -v
```

## Test Categories

### Unit Tests
- Test individual functions in isolation
- No external dependencies
- Fast execution (milliseconds)
- Examples: text_utils, geo_utils, entity_resolver

### Integration Tests
- Test service integration with external systems
- Require Tesseract OCR installed
- Slower execution (seconds)
- Marked with `@pytest.mark.integration`
- Examples: OCR service tests

### End-to-End Tests (Future)
- Test full pipeline from upload to optimization
- Require database and Redis
- Slowest execution (minutes)

## Prerequisites

### For Unit Tests
```bash
pip install pytest pytest-cov
pip install -r requirements.txt
```

### For Integration Tests
Additionally requires Tesseract OCR:

**macOS:**
```bash
brew install tesseract
```

**Ubuntu/Debian:**
```bash
sudo apt-get install tesseract-ocr tesseract-ocr-eng
```

**Docker:**
```bash
# Already included in Dockerfile
docker exec -it v2v_backend tesseract --version
```

## Writing New Tests

### Test File Naming
- Test files: `test_*.py`
- Test classes: `Test*`
- Test methods: `test_*`

### Example Test
```python
import pytest
from app.services.my_service import my_function

class TestMyFunction:
    """Test my_function behavior."""
    
    def test_basic_case(self):
        result = my_function("input")
        assert result == "expected"
    
    @pytest.mark.integration
    def test_with_external_service(self):
        # This test requires external dependencies
        result = my_function_with_api()
        assert result is not None
    
    def test_error_handling(self):
        with pytest.raises(ValueError):
            my_function(None)
```

### Fixtures
```python
@pytest.fixture
def sample_data():
    """Provide sample data for tests."""
    return {"key": "value"}

def test_with_fixture(sample_data):
    assert sample_data["key"] == "value"
```

## Test Coverage Goals

- **Overall**: 80%+ coverage
- **Critical Services**: 90%+ coverage
- **Utilities**: 95%+ coverage
- **API Endpoints**: 70%+ coverage

## Common Issues

### Import Errors
```bash
# Make sure you're in the backend directory
cd backend

# Install package in development mode
pip install -e .
```

### Tesseract Not Found
```bash
# Check Tesseract installation
which tesseract
tesseract --version

# Set TESSERACT_PATH if needed
export TESSERACT_PATH=/usr/local/bin/tesseract
```

### Database Connection Errors
```bash
# Make sure PostgreSQL is running
docker-compose up -d postgres

# Check connection
docker exec -it v2v_postgres psql -U v2v_user -d v2v_db -c "SELECT 1;"
```

## CI/CD Integration

### GitHub Actions (Example)
```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Install dependencies
        run: |
          apt-get update
          apt-get install -y tesseract-ocr
          pip install -r requirements.txt
      - name: Run tests
        run: pytest tests/ -v --cov=app
      - name: Upload coverage
        uses: codecov/codecov-action@v2
```

## Debugging Tests

### Verbose Output
```bash
pytest tests/ -vv
```

### Show Print Statements
```bash
pytest tests/ -s
```

### Stop on First Failure
```bash
pytest tests/ -x
```

### Run Last Failed Tests
```bash
pytest --lf
```

### Debug with pdb
```python
def test_something():
    import pdb; pdb.set_trace()
    result = my_function()
    assert result == expected
```

## Performance Benchmarking

```bash
# Install pytest-benchmark
pip install pytest-benchmark

# Run benchmarks
pytest tests/ --benchmark-only
```

---

**Total Tests**: 290+  
**Test Coverage**: 90%+  
**Execution Time**: <10 seconds (unit), ~30 seconds (all)
