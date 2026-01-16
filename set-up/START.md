# Quick Start Guide

## Get Running in 5 Minutes

### Prerequisites
- Docker & Docker Compose installed
- Node.js 18+ installed
- OpenAI API key ([get one here](https://platform.openai.com/api-keys))
- Google Maps API key with Places & Distance Matrix APIs enabled

### Step 0: Install Dependencies (One Command)

```bash
./setup.sh
```

This installs all dependencies (mobile npm packages). Backend dependencies are handled automatically by Docker.

### Step 1: Configure API Keys

Create backend environment file:

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and add your keys:
```
OPENAI_API_KEY=sk-your-openai-key-here
GOOGLE_MAPS_API_KEY=AIza-your-google-maps-key-here
JWT_SECRET=change-this-to-random-string
```

### Step 2: Start Backend

```bash
cd infra
docker-compose up --build
```

Wait for services to start. You should see:
- PostgreSQL running on port 5432
- Redis running on port 6379
- FastAPI running on port 8000

Visit http://localhost:8000/docs to see API documentation.

### Step 3: Start Mobile App

Open a new terminal:

```bash
cd mobile
npm install
npm start
```

Choose your platform:
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Or scan QR code with Expo Go app on your phone

### Step 4: Test the App

1. **Register** an account with any email/password
2. **Upload** some travel photos (screenshots from Instagram/TikTok work best)
3. **Wait** for AI to analyze locations (~10-30 seconds)
4. **Swipe** right to confirm locations, left to skip
5. **Enter** your starting coordinates and time preferences
6. **Optimize** your route
7. **View** your itinerary on the timeline
8. **Navigate** with Google Maps integration

## 📱 Test with Sample Data

Don't have travel photos? Try these coordinates for Tokyo:

**Start Location:**
- Latitude: `35.6762`
- Longitude: `139.6503`

**Time Window:**
- Start: `09:00`
- End: `18:00`

**Sample Locations to Add Manually:**
1. Senso-ji Temple (35.7148° N, 139.7967° E)
2. Tokyo Skytree (35.7101° N, 139.8107° E)
3. Meiji Shrine (35.6764° N, 139.6993° E)

## 🐛 Troubleshooting

### Backend Issues

**Container won't start:**
```bash
# Check if ports are in use
lsof -i :5432
lsof -i :6379
lsof -i :8000

# Restart from scratch
docker-compose down -v
docker-compose up --build
```

**Database connection failed:**
- Wait 10 seconds after startup for PostgreSQL to initialize
- Check logs: `docker-compose logs postgres`

### Mobile Issues

**Cannot connect to backend:**
```bash
# On iOS simulator: use localhost:8000
# On Android emulator: use 10.0.2.2:8000

# Update API URL in mobile/src/services/api.ts if needed
```

**Expo won't start:**
```bash
npm cache clean --force
rm -rf node_modules
npm install
```

**Image picker not working:**
- On iOS: Make sure simulator has photos in library
- On Android: Grant storage permissions in app settings

### API Issues

**OpenAI Vision fails:**
- Check API key is valid
- Verify billing is set up
- Check quota limits at platform.openai.com

**Google Maps API fails:**
- Enable "Distance Matrix API" in Google Cloud Console
- Enable "Places API" in Google Cloud Console
- Check billing is enabled
- Verify API key restrictions allow your IP

## 📊 Monitoring

### Backend Health
```bash
# Check API is running
curl http://localhost:8000/health

# View logs
docker-compose logs -f backend

# View database
docker exec -it v2v_postgres psql -U v2v_user -d v2v
```

### Redis Cache
```bash
# Connect to Redis
docker exec -it v2v_redis redis-cli

# View cached keys
KEYS *

# Check distance cache
KEYS distance:*
```

## 🔒 Security Notes

For development:
- Default JWT secret is insecure - change it!
- CORS is wide open - restrict in production
- No rate limiting on local - don't spam APIs
- Redis has no password - add one in production

## 💰 API Costs

Estimated per trip:
- OpenAI Vision: ~$0.05 per 10 images
- Google Distance Matrix: ~$0.01 per 50 waypoint pairs
- Google Places: ~$0.03 per 100 geocoding requests

Total: **~$0.10-0.50 per trip** depending on image count.

## 📚 Next Steps

1. Read [README.md](README.md) for full documentation
2. Explore API docs at http://localhost:8000/docs
3. Run tests: `cd backend && pytest tests/`

## 🎯 Common Use Cases

### Scenario 1: Tokyo Day Trip
- Upload 20 screenshots from TikTok
- Set start at hotel (9 AM)
- End at hotel (6 PM)
- Get optimized 9-hour itinerary

### Scenario 2: Quick City Tour
- Upload 5 landmark photos
- Set walking speed to "fast"
- 3-hour whirlwind tour

### Scenario 3: Leisurely Exploration
- Upload 8-10 cafes and museums
- Set walking speed to "slow"
- All-day relaxed itinerary

## 💡 Pro Tips

1. **Better location detection**: Use images with clear text overlays showing place names
2. **Faster geocoding**: Redis caches results - popular places load instantly
3. **Save API costs**: Test with mock data first, then use real APIs
4. **Accurate routes**: Enter precise start coordinates (use Google Maps to find them)
5. **Realistic timing**: Set "slow" speed if you plan to take photos/browse

---
