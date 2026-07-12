import { MapContainer, Marker, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useEffect } from 'react'
import { mapCenter, structurePins } from '../data/mockData'

const pinIcon = L.divIcon({
  className: 'map-pin',
  html: '<span></span>',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
})

type MapPanelProps = {
  activeLat: number
  activeLng: number
}

function FlyToActive({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap()

  useEffect(() => {
    map.flyTo([lat, lng], map.getZoom(), { duration: 0.6 })
  }, [lat, lng, map])

  return null
}

export function MapPanel({ activeLat, activeLng }: MapPanelProps) {
  return (
    <div className="map-panel">
      <MapContainer
        center={[mapCenter.lat, mapCenter.lng]}
        zoom={11}
        zoomControl
        className="leaflet-map"
      >
        <TileLayer
          attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
        {structurePins.map((pin) => (
          <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={pinIcon} />
        ))}
        <Marker position={[activeLat, activeLng]} icon={pinIcon} />
        <FlyToActive lat={activeLat} lng={activeLng} />
      </MapContainer>
      <div className="map-attribution">Powered by Esri</div>
    </div>
  )
}
