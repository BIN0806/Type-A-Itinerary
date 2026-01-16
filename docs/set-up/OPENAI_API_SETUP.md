# OpenAI API Setup Guide

## Issue: API Quota Exceeded

If you see this error when uploading images:
```
API quota exceeded. Please check your OpenAI API credits
```

This means your OpenAI API account has run out of credits.

---

## Solution 1: Add API Credits (Recommended)

### Step 1: Check Your Usage

1. Go to: https://platform.openai.com/account/usage
2. Log in with your OpenAI account
3. View current usage and billing

### Step 2: Add Credits

1. Go to: https://platform.openai.com/account/billing
2. Click "Add payment method" or "Add credits"
3. Minimum: $5 recommended for testing

### Step 3: Verify API Key

1. Check your `.env` file has the correct API key:
   ```bash
   OPENAI_API_KEY=sk-...your-key-here
   ```

2. Restart backend:
   ```bash
   docker-compose restart backend
   ```

---

## Solution 2: Use Mock Mode (For Testing)

If you don't want to use real API calls during development, you can enable mock mode:

### Backend Mock Mode

Edit `backend/app/services/vision_service.py`:

```python
class VisionService:
    def __init__(self, use_enhanced_pipeline: bool = True, use_mock: bool = False):
        self.use_mock = use_mock
        if not use_mock:
            self.client = OpenAI(api_key=settings.OPENAI_API_KEY)
    
    def analyze_image(self, image_bytes: bytes):
        if self.use_mock:
            # Return mock data for testing
            return [
                CandidateLocation(
                    name="Test Restaurant",
                    confidence=0.90,
                    description="Mock location for testing"
                ),
                CandidateLocation(
                    name="Test Cafe",
                    confidence=0.85,
                    description="Another mock location"
                )
            ]
        # ... existing code
```

Then set environment variable:
```bash
# In .env
USE_MOCK_VISION=true
```

---

## Solution 3: Alternative - Use Free Tier

### Google Cloud Vision API (Free Tier)

Google offers 1,000 free Vision API calls per month:

1. Create Google Cloud account: https://cloud.google.com/
2. Enable Vision API
3. Get API key
4. Update backend configuration

**Note**: Requires code changes to switch from OpenAI to Google Vision.

---

## Cost Estimation

### OpenAI GPT-4o Vision Pricing

- **Input**: $2.50 per 1M tokens
- **Per image**: ~$0.01 - $0.05 depending on resolution
- **Typical trip**: 10 images = ~$0.10 - $0.50

### Recommended Credits

- **Testing**: $5 (enough for 100+ trips)
- **Production**: $20/month (200+ trips)

---

## Checking API Status

### Test Your API Key

```bash
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

**Expected**: List of available models  
**Error 401**: Invalid API key  
**Error 429**: Quota exceeded  

### Check Backend Logs

```bash
docker logs plana_backend --tail 50 | grep -i "openai\|quota\|error"
```

Look for:
- `Error code: 429` = Quota exceeded
- `Error code: 401` = Invalid API key
- `Error code: 500` = Server error

---

## Troubleshooting

### "Error code: 429"

**Problem**: Quota exceeded or rate limited

**Solutions**:
1. Add credits to OpenAI account
2. Wait a few minutes (rate limit resets)
3. Use mock mode for testing

### "Error code: 401"

**Problem**: Invalid or missing API key

**Solutions**:
1. Check `.env` file has `OPENAI_API_KEY=sk-...`
2. Verify key at: https://platform.openai.com/api-keys
3. Restart backend after updating key

### "Error code: 500"

**Problem**: Backend error (not API quota)

**Solutions**:
1. Check backend logs: `docker logs plana_backend`
2. Verify Tesseract is installed
3. Check database connection

### Images Analyze Forever

**Problem**: Backend processing stuck

**Solutions**:
1. Check Redis is running: `docker ps | grep redis`
2. Check backend logs for errors
3. Restart backend: `docker-compose restart backend`

---

## Environment Variables Reference

```bash
# Required
OPENAI_API_KEY=sk-proj-...your-key-here

# Optional
USE_MOCK_VISION=false           # Enable mock mode
OPENAI_API_TIMEOUT=30           # API timeout (seconds)
MAX_CONCURRENT_IMAGES=5         # Parallel processing limit
```

---

## Testing Without API Calls

### Option 1: Use Cached Results

Backend caches geocoding results in Redis. Once locations are geocoded once, they're cached.

### Option 2: Mock Service

Create a mock vision service for tests:

```python
# tests/conftest.py
@pytest.fixture
def mock_vision_service():
    return VisionService(use_mock=True)
```

### Option 3: Pre-seed Database

Insert test locations directly into database:

```sql
INSERT INTO waypoints (name, lat, lng, confidence_score)
VALUES 
  ('Test Restaurant', 48.8584, 2.2945, 0.90),
  ('Test Cafe', 48.8606, 2.3376, 0.85);
```

---

## Production Recommendations

1. **Set up billing alerts** in OpenAI dashboard
2. **Monitor API usage** weekly
3. **Cache aggressively** (Redis TTL: 30 days)
4. **Rate limit uploads** (10/hour per user)
5. **Use batch processing** for cost efficiency

---

## Next Steps

1. ✅ Add credits to OpenAI account
2. ✅ Restart backend
3. ✅ Test image upload again
4. ✅ Monitor usage at platform.openai.com

**Need help?** Check backend logs:
```bash
docker logs -f plana_backend
```
