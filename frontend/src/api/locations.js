import api from './client.js'

const GEOCODING_URL = 'https://photon.komoot.io/api/'

export async function searchPlaces(query, signal) {
  const { data } = await api.get(GEOCODING_URL, {
    params: { q: query, limit: 5 },
    signal,
    timeout: 10000,
  })
  return (data.features || []).flatMap((feature) => {
    const [longitude, latitude] = feature.geometry?.coordinates || []
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return []
    const properties = feature.properties || {}
    const label = [properties.name, properties.street, properties.city || properties.town || properties.village, properties.state, properties.country]
      .filter(Boolean)
      .filter((part, index, values) => values.indexOf(part) === index)
      .join(', ')
    return [{ id: `${properties.osm_type || 'place'}-${properties.osm_id || label}`, label: label || query, latitude, longitude }]
  })
}
