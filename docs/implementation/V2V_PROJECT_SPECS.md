# Project V2V (Visual-to-Voyage) - Technical Specifications

## Vision
Bridge the "Inspiration-to-Execution" gap by converting visual inspiration (TikTok saves, Instagram screenshots) into structured, mathematically optimized travel itineraries with turn-by-turn navigation.

## Core Value Proposition
1. **Ingest**: Extract location data from visual media (no manual entry)
2. **Optimize**: Solve TSP (Traveling Salesperson Problem) to minimize backtracking
3. **Execute**: Provide walking plans + Google Maps deep-linking

## Target Audience
- **The "Scroller"**: Gen Z/Millennials planning via TikTok/Instagram
- **The Efficiency Traveler**: Time-limited tourists maximizing sightseeing

---

## Technical Architecture

### Stack Decisions
**Mobile**: React Native (Expo)
**Backend**: Python 3.11+ FastAPI
**Database**: PostgreSQL with PostGIS extension
**AI/ML**: OpenAI API (Vision) or Fine-tuned LLaVA
**Mapping**: Google Places API, Google Distance Matrix API, Mapbox (static maps)
**Caching**: Redis (for distance matrices between popular locations)

### Repository Structure
```
/project-v2v
├── /docs                    # Architecture diagrams, API specs
├── /mobile                  # React Native (Expo)
│   ├── /src
│   │   ├── /assets
│   │   ├── /components      # Shared UI (PascalCase)
│   │   ├── /features        # Feature modules (UserAuth, ItineraryBuilder, MapView)
│   │   ├── /hooks           # Custom hooks (camelCase)
│   │   ├── /navigation      # Routing config
│   │   ├── /services        # API integration
│   │   └── /utils           # Helper functions
│   └── package.json
├── /backend                 # Python FastAPI
│   ├── /app
│   │   ├── /api             # Route controllers
│   │   ├── /core            # Config, Security, Logging
│   │   ├── /db              # SQLAlchemy models & Migrations
│   │   ├── /services        # OCR, Geocoding, Optimization
│   │   └── main.py
│   └── requirements.txt
└── /infra                   # Docker, Terraform, CI/CD
```

### Naming Conventions
- **Files (JS/TS)**: PascalCase.tsx (components), camelCase.ts (utilities)
- **Files (Python)**: snake_case.py
- **Variables**: camelCase (JS), snake_case (Python)
- **Constants**: UPPER_SNAKE_CASE
- **Booleans**: Prefix with `is`, `has`, `should`

---

## Database Schema

### Users Table
```sql
TABLE users {
  id: UUID PRIMARY KEY,
  email: VARCHAR,
  preferences: JSONB  -- { "walking_speed": "moderate" }
}
```

### Trips Table
```sql
TABLE trips {
  id: UUID PRIMARY KEY,
  user_id: UUID FOREIGN KEY,
  name: VARCHAR,
  date: DATE,
  status: ENUM('draft', 'optimized', 'archived')
}
```

### Waypoints Table
```sql
TABLE waypoints {
  id: UUID PRIMARY KEY,
  trip_id: UUID FOREIGN KEY,
  google_place_id: VARCHAR,
  name: VARCHAR,
  lat: DECIMAL,
  lng: DECIMAL,
  media_url: VARCHAR,  -- Link to original upload
  estimated_stay_duration: INTEGER  -- Minutes
}
```

---

## API Endpoints (Draft)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/v1/trip/upload` | Multipart image upload, returns job_id |
| GET | `/v1/trip/{job_id}/status` | Poll for analysis completion |
| GET | `/v1/trip/{job_id}/candidates` | Returns identified locations for confirmation |
| POST | `/v1/trip/optimize` | Input: Place IDs + Constraints. Output: Ordered itinerary |
| GET | `/v1/maps/link` | Generates Google Maps URL |

---

## Key Features & User Flow

### Step 1: Ingestion & Analysis
- User uploads screenshots/images
- OCR/Vision API extracts text + visual landmarks
- Entity resolution maps descriptions to places
- Output: Candidate waypoints with confidence scores

### Step 2: Constraint Setting
- User sets: Start time, end time, starting location
- System filters by opening hours

### Step 3: Route Optimization (TSP with Time Windows)
- Fetch distance matrix (walking times)
- Cluster points geographically
- Sequence to minimize travel time: min(Σ T_travel)
- Output: Ordered stops [A → B → C → D]

### Step 4: Visualization & Export
- Display optimized route
- Generate Google Maps deep link:
  ```
  https://www.google.com/maps/dir/?api=1&origin=A&destination=D&waypoints=B|C&travelmode=walking
  ```
- Show internal walking plan with scenic notes

---

## UI Design Philosophy

**"Content is King, Map is Queen"**
- Clean, whitespace-heavy design
- User photos as primary visual elements
- Map as primary workspace

### Key Screens

1. **"Dump" Zone (Ingestion)**
   - Drop zone / camera roll picker
   - Loading spinners on individual images

2. **"Tinder" Sort (Refinement)**
   - Swipe interface: "We think this is Fushimi Inari. Correct?"
   - User confirms/edits

3. **Timeline View**
   - Vertical axis showing time slots
   - Dotted lines for walking segments
   - Solid blocks for activity segments

4. **Navigation Mode**
   - Current step + next step
   - Large "Open in Google Maps" FAB

---

## Constraints & Limitations

### Technical Constraints
1. **Google API Quotas**: Distance Matrix API is expensive ($10/1000 elements)
   - **Mitigation**: Redis caching for popular tourist spots
2. **Walking Route Granularity**: Cannot guarantee "scenic" routes, only efficient
3. **Deep Link Limits**: Google Maps max ~9-10 waypoints
   - Trips >10 stops must split into "Part 1" and "Part 2"

### Platform Restrictions
- Requires Photo Library access (iOS/Android)
- Core ingestion fails if permission denied

---

## Security Requirements

### Authentication
- OAuth 2.0 / OIDC (Google, Apple Sign-In)
- JWT session management

### Data Privacy (CRITICAL)
- **Ephemeral Media Storage**: Process images in-memory or temp storage
- Delete after analysis (AWS S3 Lifecycle Policies)
- Store metadata (Place ID) only, not photos permanently
- **PII Redaction**: Vision API must ignore/redact faces and sensitive text

### Infrastructure Security
- Rate limiting (token-bucket)
- SSL/TLS enforced
- Prevent Google API bill abuse

---

## Optimization Algorithm Details

### TSP with Time Windows
- Input: List of waypoints with opening/closing hours
- Constraint: Start time, end time, walking speed
- Objective: Minimize total travel time
- Algorithm: Clustering + greedy sequencing or OR-Tools solver

### Distance Matrix Caching Strategy
```python
# Redis key pattern
cache_key = f"distance:{place_id_1}:{place_id_2}:walking"
# TTL: 30 days (walking times rarely change)
```

---

## MVP Scope Considerations

### Phase 1 (MVP)
- [ ] Backend: Image upload + OCR/Vision analysis
- [ ] Backend: TSP optimization with walking mode
- [ ] Backend: Google Maps link generation
- [ ] Mobile: Camera roll upload
- [ ] Mobile: Swipe confirmation UI
- [ ] Mobile: Timeline view
- [ ] Auth: Basic email/password (defer OAuth)

### Phase 2 (Post-MVP)
- [ ] Scenic route preferences
- [ ] Multi-day itineraries
- [ ] Collaborative trip planning
- [ ] Offline mode support
- [ ] Transit modes (not just walking)

---

## Key Questions for Implementation

1. **AI Provider**: OpenAI GPT-4o Vision or self-hosted LLaVA?
2. **TSP Solver**: Google OR-Tools or custom heuristic?
3. **Map Provider**: Mapbox or Google Maps for in-app display?
4. **Deployment**: Docker on AWS/GCP or serverless?
5. **Mobile Framework**: React Native (Expo managed) or bare workflow?
