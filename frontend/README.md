# Disaster Rescue System frontend

Responsive React and Vite emergency alert dashboard with an OpenStreetMap powered map.

## Start the app

```sh
npm install
npm run dev
```

The emergency dashboard opens without sign-in, as authentication is not required for this frontend phase. The existing sign-in flow remains available at `/?login=1`. Vite serves the app locally, where browser geolocation is available; deployed environments need HTTPS to request GPS location.

## API configuration

The app uses mock emergency responses by default. Mock submissions create an emergency ID and a `PENDING_ASSIGNMENT` status with no rescue team or ETA. This is labeled as development mock data in the dashboard.

The map opens on Esri World Street Map because the public OpenStreetMap tile service can return a branded 403 policy image that browsers treat as a successful tile response, preventing automatic error detection. The map also includes Esri, CARTO, and OSM source controls. If tile loading errors occur, it cycles through CARTO and OSM; if all sources are unavailable, a retry notice appears while location selection remains available. Search an address, city, or landmark and select a result to move the incident marker; results use the Photon geocoder backed by OpenStreetMap data.

To explicitly preview a mock rescue-team assignment, set `VITE_MOCK_TEAM_ASSIGNED=true`. The demo team is clearly labeled as mock data and is never returned by the API mode.

Create a `.env.local` file to configure the API:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_USE_MOCK_API=false
```

When mock mode is disabled, requests use `POST /api/v1/emergencies` and `GET /api/v1/emergencies/{emergencyId}`. The frontend sends latitude, longitude, emergency type, and description. It does not calculate H3 indexes or estimate arrival times.

## Available commands

```sh
npm run dev
npm run build
npm run lint
npm run preview
```
