import { useEffect } from 'react'
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Asset, InspectionScheduleStatus } from '../types'

const mapCenter = { lat: 37.7749, lng: -122.4194 }

function pinClass(status?: InspectionScheduleStatus) {
  switch (status) {
    case 'overdue':
      return 'map-pin-overdue'
    case 'scheduled':
      return 'map-pin-scheduled'
    case 'completed':
      return 'map-pin-completed'
    default:
      return 'map-pin-default'
  }
}

function createPinIcon(status?: InspectionScheduleStatus, selected?: boolean) {
  return L.divIcon({
    className: `map-pin ${pinClass(status)}${selected ? ' selected' : ''}`,
    html: '<span></span>',
    iconSize: selected ? [20, 20] : [16, 16],
    iconAnchor: selected ? [10, 10] : [8, 8],
  })
}

type AssetsMapProps = {
  assets: Asset[]
  selectedId?: string | null
  onSelect: (assetId: string) => void
  className?: string
}

function FitAssets({ assets, selectedId }: { assets: Asset[]; selectedId?: string | null }) {
  const map = useMap()

  useEffect(() => {
    if (!assets.length) return
    if (selectedId) {
      const selected = assets.find((asset) => asset.id === selectedId)
      if (selected) {
        map.flyTo([selected.lat, selected.lng], 13, { duration: 0.5 })
        return
      }
    }
    const bounds = L.latLngBounds(assets.map((asset) => [asset.lat, asset.lng]))
    map.fitBounds(bounds.pad(0.2), { animate: true })
  }, [assets, selectedId, map])

  return null
}

function formatDate(value?: string) {
  if (!value) return 'Not scheduled'
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function AssetsMap({ assets, selectedId, onSelect, className }: AssetsMapProps) {
  const center = selectedId
    ? assets.find((asset) => asset.id === selectedId) ?? assets[0] ?? mapCenter
    : assets[0] ?? mapCenter

  return (
    <div className={`assets-map-panel${className ? ` ${className}` : ''}`}>
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={11}
        zoomControl
        className="leaflet-map assets-leaflet-map"
      >
        <TileLayer
          attribution='Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics'
          url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        />
        {assets.map((asset) => (
          <Marker
            key={asset.id}
            position={[asset.lat, asset.lng]}
            icon={createPinIcon(asset.inspectionStatus, asset.id === selectedId)}
            eventHandlers={{ click: () => onSelect(asset.id) }}
          >
            <Popup>
              <div className="asset-map-popup">
                <strong>{asset.name}</strong>
                <span>{asset.type}</span>
                <span>Next inspection: {formatDate(asset.nextInspectionAt)}</span>
                <span className={`schedule-pill status-${asset.inspectionStatus ?? 'none'}`}>
                  {(asset.inspectionStatus ?? 'none').replace('_', ' ')}
                </span>
              </div>
            </Popup>
          </Marker>
        ))}
        <FitAssets assets={assets} selectedId={selectedId} />
      </MapContainer>
      <div className="assets-map-legend">
        <span><i className="legend-dot overdue" /> Overdue</span>
        <span><i className="legend-dot scheduled" /> Scheduled</span>
        <span><i className="legend-dot default" /> No schedule</span>
      </div>
      <div className="map-attribution">Powered by Esri</div>
    </div>
  )
}
