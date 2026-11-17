import { useEffect, useState } from 'react'
import { CircleMarker, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const userIcon = L.divIcon({ className: 'leaflet-user-icon', html: '<span class="map-pin-user"><i></i></span>', iconSize: [34, 42], iconAnchor: [17, 38], popupAnchor: [0, -38] })
const teamIcon = L.divIcon({ className: 'leaflet-team-icon', html: '<span class="map-pin-team"><i>+</i></span>', iconSize: [38, 46], iconAnchor: [19, 42], popupAnchor: [0, -42] })
const DEFAULT_CENTER = [20.5937, 78.9629]

function MapController({ location }) {
  const map = useMap()
  const latitude = location?.latitude
  const longitude = location?.longitude
  useEffect(() => { if (latitude != null && longitude != null) map.flyTo([latitude, longitude], Math.max(map.getZoom(), 14), { duration: 0.8 }) }, [latitude, longitude, map])
  useEffect(() => { const timer = window.setTimeout(() => map.invalidateSize(), 120); return () => window.clearTimeout(timer) }, [map])
  return null
}

function ClickToSelect({ onSelect }) {
  useMapEvents({ click(event) { onSelect({ latitude: event.latlng.lat, longitude: event.latlng.lng, accuracy: null }) } })
  return null
}

export default function EmergencyMap({ location, onLocationChange, team }) {
  const [tileProvider, setTileProvider] = useState('esri')
  const [tilesUnavailable, setTilesUnavailable] = useState(false)
  const tileConfig = {
    osm: { label: 'OpenStreetMap', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' },
    carto: { label: 'CARTO', url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>' },
    esri: { label: 'Esri', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', attribution: 'Tiles &copy; Esri — Sources: Esri, HERE, Garmin, OpenStreetMap contributors, and the GIS user community' },
  }[tileProvider]
  const handleTileError = () => {
    if (tileProvider === 'esri') setTileProvider('carto')
    else if (tileProvider === 'carto') setTileProvider('osm')
    else setTilesUnavailable(true)
  }
  const chooseProvider = (provider) => { setTilesUnavailable(false); setTileProvider(provider) }
  return <div className="map-canvas"><MapContainer center={location ? [location.latitude, location.longitude] : DEFAULT_CENTER} zoom={location ? 14 : 5} scrollWheelZoom className="leaflet-map"><TileLayer key={tileProvider} attribution={tileConfig.attribution} url={tileConfig.url} eventHandlers={{ tileerror: handleTileError }} /><MapController location={location} /><ClickToSelect onSelect={onLocationChange} />
    {location && <Marker position={[location.latitude, location.longitude]} icon={userIcon} draggable eventHandlers={{ dragend(event) { const point = event.target.getLatLng(); onLocationChange({ latitude: point.lat, longitude: point.lng, accuracy: null }) } }}><Popup><strong>Emergency location</strong><br />Drag to adjust or tap elsewhere on the map.</Popup></Marker>}
    {team && Number.isFinite(Number(team.latitude)) && Number.isFinite(Number(team.longitude)) && <Marker position={[Number(team.latitude), Number(team.longitude)]} icon={teamIcon}><Popup><strong>{team.name || 'Rescue team'}</strong><br />Team ID: {team.team_id}<br />Status: {team.status}</Popup></Marker>}
    {!location && <CircleMarker center={DEFAULT_CENTER} radius={5} pathOptions={{ color: '#b9c6d5', fillColor: '#fff', fillOpacity: 1, weight: 2 }}><Popup>Tap the map to select an emergency location.</Popup></CircleMarker>}
  </MapContainer><div className="map-source-switcher" aria-label="Map tile provider">{Object.entries({ esri: 'ESRI', carto: 'CARTO', osm: 'OSM' }).map(([provider, label]) => <button type="button" key={provider} aria-pressed={tileProvider === provider} onClick={() => chooseProvider(provider)}>{label}</button>)}</div>{tilesUnavailable && <div className="map-tile-warning" role="status">All map tile sources are blocked. You can still tap the map to set your location.<button type="button" onClick={() => chooseProvider('esri')}>Retry map</button></div>}<div className="map-controls-label"><span className="map-live-dot" /> {tilesUnavailable ? 'MAP OFFLINE' : `${tileConfig.label.toUpperCase()} MAP`}</div></div>
}
