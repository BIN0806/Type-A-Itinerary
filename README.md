# TypeA-Itinerary

Transform travel inspiration into optimized itineraries powered by AI and route optimization.

## Quick Links

- **[Setup Guide](./set-up/START.md)** - Get started in 5 minutes
- **[Full Documentation](./set-up/README.md)** - All project documentation
- **[Run Tests](run_all_tests.sh)** - Execute all tests with categorization

## Architecture

- **Backend**: FastAPI (Python 3.11+) with PostgreSQL/PostGIS and Redis
- **Mobile**: React Native (Expo) with TypeScript
- **AI**: OpenAI GPT-4o Vision API for location extraction
- **Mapping**: Google Places API, Google Distance Matrix API
- **Optimization**: Google OR-Tools for TSP solving

## Running Tests

Run all tests (mobile + backend) with categorization:

```bash
./run_all_tests.sh
```

