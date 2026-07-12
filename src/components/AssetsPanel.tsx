import { Fragment, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, List, Map as MapIcon, MapPin, Upload } from 'lucide-react'
import { api } from '../api/client'
import { AssetsMap } from './AssetsMap'
import type { Asset, AssetDetail, InspectionImage } from '../types'

type AssetsPanelProps = {
  assets: Asset[]
  loading: boolean
  onSelectAsset: (id: string) => void
  onOpenImage: (imageId: string) => void
  onAssetsChanged: () => void | Promise<void>
}

type AssetsView = 'list' | 'map'

function formatDate(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function inspectionLabel(status?: string) {
  if (!status || status === 'none') return 'Not scheduled'
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function AssetsPanel({
  assets,
  loading,
  onSelectAsset,
  onOpenImage,
  onAssetsChanged,
}: AssetsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<AssetsView>('list')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null)
  const [detail, setDetail] = useState<AssetDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [defaultType, setDefaultType] = useState('Distribution pole')
  const [importMessage, setImportMessage] = useState<string | null>(null)

  const toggleExpand = async (assetId: string) => {
    if (expandedId === assetId) {
      setExpandedId(null)
      setDetail(null)
      return
    }

    setExpandedId(assetId)
    setDetailLoading(true)
    try {
      const next = await api.getAsset(assetId)
      setDetail(next)
    } finally {
      setDetailLoading(false)
    }
  }

  const handleImport = async (file: File) => {
    setImporting(true)
    setImportMessage(null)
    try {
      const result = await api.importAssetsShapefile(file, defaultType || undefined)
      setImportMessage(`Imported ${result.imported} asset${result.imported === 1 ? '' : 's'} from shapefile.`)
      await onAssetsChanged()
    } catch (err) {
      setImportMessage(err instanceof Error ? err.message : 'Shapefile import failed')
    } finally {
      setImporting(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  if (loading) {
    return (
      <section className="placeholder-panel">
        <p>Loading assets…</p>
      </section>
    )
  }

  return (
    <section className="assets-panel">
      <header className="panel-header assets-panel-header">
        <div>
          <h2>Assets</h2>
          <p>
            Transmission towers, distribution poles, and other field assets. Import from shapefile or
            associate inspection images to link photos to each asset.
          </p>
        </div>
        <div className="assets-header-actions">
          <div className="assets-view-toggle" role="tablist" aria-label="Assets view">
            <button
              type="button"
              className={view === 'list' ? 'active' : undefined}
              onClick={() => setView('list')}
            >
              <List size={15} />
              List
            </button>
            <button
              type="button"
              className={view === 'map' ? 'active' : undefined}
              onClick={() => setView('map')}
            >
              <MapIcon size={15} />
              Map
            </button>
          </div>
          <div className="assets-import-actions">
            <label className="assets-import-type">
              <span>Default type</span>
              <input
                type="text"
                value={defaultType}
                onChange={(event) => setDefaultType(event.target.value)}
                placeholder="Distribution pole"
              />
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,.shp"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void handleImport(file)
              }}
            />
            <button
              type="button"
              className="card-btn primary"
              disabled={importing}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={16} />
              {importing ? 'Importing…' : 'Import shapefile'}
            </button>
          </div>
        </div>
      </header>

      {importMessage && <p className="assets-import-message">{importMessage}</p>}

      {view === 'map' ? (
        <div className="assets-map-layout">
          <AssetsMap assets={assets} selectedId={selectedMapId} onSelect={setSelectedMapId} />
          <aside className="assets-map-sidebar">
            <h3>Assets on map</h3>
            <ul className="assets-map-list">
              {assets.map((asset) => (
                <li key={asset.id}>
                  <button
                    type="button"
                    className={asset.id === selectedMapId ? 'active' : undefined}
                    onClick={() => setSelectedMapId(asset.id)}
                  >
                    <strong>{asset.name}</strong>
                    <span>{asset.type}</span>
                    <span>
                      {formatDate(asset.nextInspectionAt)} · {inspectionLabel(asset.inspectionStatus)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      ) : (
        <div className="assets-table-wrap">
          <table className="assets-table">
            <thead>
              <tr>
                <th />
                <th>Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Next inspection</th>
                <th>Images</th>
                <th>Location</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => {
                const expanded = expandedId === asset.id
                const images =
                  expanded && detail?.id === asset.id ? detail.images : ([] as InspectionImage[])

                return (
                  <Fragment key={asset.id}>
                    <tr className={expanded ? 'asset-row-expanded' : undefined}>
                      <td>
                        <button
                          type="button"
                          className="asset-expand-btn"
                          onClick={() => void toggleExpand(asset.id)}
                          aria-expanded={expanded}
                          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${asset.name}`}
                        >
                          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                      </td>
                      <td>
                        <strong>{asset.name}</strong>
                      </td>
                      <td>{asset.type}</td>
                      <td>
                        <span className="status-pill status-clear">{asset.status}</span>
                      </td>
                      <td>
                        <div className="asset-inspection-cell">
                          <span>{formatDate(asset.nextInspectionAt)}</span>
                          <span className={`schedule-pill status-${asset.inspectionStatus ?? 'none'}`}>
                            {inspectionLabel(asset.inspectionStatus)}
                          </span>
                        </div>
                      </td>
                      <td>{asset.imageCount}</td>
                      <td>
                        <span className="asset-location">
                          <MapPin size={13} />
                          {asset.lat.toFixed(4)}, {asset.lng.toFixed(4)}
                        </span>
                      </td>
                      <td>
                        <div className="asset-row-actions">
                          <button
                            type="button"
                            className="card-btn"
                            onClick={() => onSelectAsset(asset.id)}
                          >
                            Manage images
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="asset-detail-row">
                        <td colSpan={8}>
                          {detailLoading ? (
                            <p className="asset-detail-loading">Loading linked images…</p>
                          ) : images.length === 0 ? (
                            <div className="asset-detail-empty">
                              <p>No images linked to this asset.</p>
                              <button
                                type="button"
                                className="card-btn primary"
                                onClick={() => onSelectAsset(asset.id)}
                              >
                                Assign images
                              </button>
                            </div>
                          ) : (
                            <div className="asset-images-grid">
                              {images.map((image) => (
                                <article key={image.id} className="asset-image-card">
                                  <img src={image.src} alt={image.name} loading="lazy" />
                                  <div>
                                    <strong>{image.name}</strong>
                                    <span>{image.boxes.length} labels</span>
                                  </div>
                                  <button
                                    type="button"
                                    className="card-btn primary"
                                    onClick={() => onOpenImage(image.id)}
                                  >
                                    Open
                                  </button>
                                </article>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
