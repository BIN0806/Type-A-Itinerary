# MVP

Transform travel inspiration into optimized itineraries powered by AI and route optimization.

## Overview

Plan A allows users to upload screenshots from TikTok, Instagram, or their camera roll, automatically extracts location information using OpenAI Vision, and generates mathematically optimized walking routes using Google OR-Tools TSP solver.

## Architecture

- **Backend**: FastAPI (Python 3.11+) with PostgreSQL/PostGIS and Redis
- **Mobile**: React Native (Expo) with TypeScript
- **AI**: OpenAI GPT-4o Vision API for location extraction
- **Mapping**: Google Places API, Google Distance Matrix API
- **Optimization**: Google OR-Tools for TSP solving

## Getting Started

### Quick Setup (Recommended)

Run the setup script to install all dependencies:

```bash
./setup.sh
```

This will:
- Check prerequisites (Docker, Node.js, npm)
- Install mobile dependencies (`npm install` in mobile/)
- Set up backend configuration (creates `.env` from `.env.example` if needed)

**Note:** Backend Python dependencies are installed automatically when you start Docker Compose (no manual `pip install` needed).

### Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for mobile development)
- OpenAI API Key
- Google Maps API Key (with Places & Distance Matrix enabled)

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Add your API keys to `.env`:
```
OPENAI_API_KEY=sk-your-key-here
GOOGLE_MAPS_API_KEY=AIza-your-key-here
JWT_SECRET=your-random-secret-key
```

4. Start services with Docker Compose:
```bash
cd ../infra
docker-compose up --build
```

The backend will be available at `http://localhost:8000`

API docs at `http://localhost:8000/docs`

### Mobile Setup

1. Navigate to the mobile directory:
```bash
cd mobile
```

2. Install dependencies:
```bash
npm install
```

3. Start Expo development server:
```bash
npm start
```

4. Run on iOS simulator:
```bash
npm run ios
```

5. Run on Android emulator:
```bash
npm run android
```

## Features

### Implemented (MVP)

- User authentication (email/password with JWT)
- Image upload from camera roll
- AI-powered location extraction (OpenAI Vision)
- Google Places geocoding with Redis caching
- Swipe-to-confirm location UI (Tinder-style)
- Trip constraint configuration (start location, time window, walking speed)
- TSP route optimization with time windows
- Google Distance Matrix caching
- Timeline view of optimized itinerary
- Map view with route visualization
- Google Maps deep-linking for navigation
- Rate limiting on upload endpoints

### Out of Scope (Post-MVP)

- Multi-day itineraries
- Scenic route preferences
- Transit modes (bus/train)
- Collaborative trip planning
- Offline mode
- OAuth (Google/Apple Sign-In)
- Production deployment infrastructure

## API Endpoints

### Authentication
- `POST /v1/auth/register` - Create new account
- `POST /v1/auth/login` - Login and get JWT token
- `GET /v1/auth/me` - Get current user

### Trips
- `POST /v1/trip/upload` - Upload images for analysis
- `GET /v1/trip/{job_id}/status` - Poll analysis status
- `GET /v1/trip/{job_id}/candidates` - Get detected locations
- `POST /v1/trip/{job_id}/confirm` - Confirm waypoints and create trip
- `POST /v1/trip/optimize` - Optimize trip route
- `GET /v1/maps/link/{trip_id}` - Get Google Maps navigation link
- `GET /v1/trips` - List all user trips
- `GET /v1/trip/{trip_id}` - Get trip details

## Database Schema

### Users
- `id` (UUID, PK)
- `email` (VARCHAR)
- `hashed_password` (VARCHAR)
- `preferences` (JSONB)

### Trips
- `id` (UUID, PK)
- `user_id` (UUID, FK)
- `name` (VARCHAR)
- `status` (ENUM: draft, optimized, archived)
- `start_location_lat/lng` (FLOAT)
- `start_time/end_time` (TIMESTAMP)
- `walking_speed` (VARCHAR)
- `total_time_minutes` (INT)

### Waypoints
- `id` (UUID, PK)
- `trip_id` (UUID, FK)
- `google_place_id` (VARCHAR)
- `name` (VARCHAR)
- `lat/lng` (FLOAT)
- `order` (INT)
- `arrival_time/departure_time` (TIMESTAMP)
- `estimated_stay_duration` (INT, minutes)

### Analysis Jobs
- `id` (UUID, PK)
- `user_id` (UUID, FK)
- `status` (VARCHAR)
- `progress` (FLOAT)
- `candidates` (JSONB)

## Testing

### Backend Tests

```bash
cd backend
pytest tests/
```

### Mobile Tests

Manual testing on simulators/emulators:
- Photo picker permissions
- Image upload and progress
- Swipe gestures
- Google Maps deep linking

## Environment Variables

### Backend
```
DATABASE_URL=postgresql://v2v_user:v2v_password@postgres:5432/v2v
REDIS_URL=redis://redis:6379/0
OPENAI_API_KEY=sk-...
GOOGLE_MAPS_API_KEY=AIza...
JWT_SECRET=random-secret-key
ENVIRONMENT=development
```

### Mobile
API base URL is auto-configured:
- Development: `http://localhost:8000/v1`
- Production: Set in code

## Security Considerations

- JWT tokens for authentication
- Ephemeral image storage (processed in-memory, discarded after analysis)
- Rate limiting: 10 uploads/hour, 50 optimizations/day per user
- Redis caching for distance matrices (30-day TTL)
- SSL/TLS enforced in production

## Known Limitations

- Google Maps URL limited to ~9 waypoints (trips are truncated)
- No PII redaction from images (planned for production)
- Distance matrix API costs not optimized for scale
- Walking routes are efficient but not guaranteed scenic

## Troubleshooting

### Backend won't start
- Check Docker is running
- Verify API keys in `.env`
- Check port 5432, 6379, 8000 are available

### Mobile can't connect to backend
- Ensure backend is running at `http://localhost:8000`
- On Android emulator, use `10.0.2.2:8000` instead
- On physical device, update API_BASE_URL in `src/services/api.ts`

### Image analysis fails
- Verify OpenAI API key is valid
- Check API quota/billing
- Ensure images contain visible location names or landmarks

### Route optimization fails
- Verify Google Maps API key has Distance Matrix API enabled
- Check API quotas
- Ensure at least 2 waypoints are confirmed

## Contributing

This is an MVP. Code is production-style but not production-ready. Key areas for improvement:
- Comprehensive error handling
- Unit test coverage
- Production deployment configs
- Monitoring and logging
- Cost optimization for Google APIs

## License

MIT (for MVP demonstration purposes)
