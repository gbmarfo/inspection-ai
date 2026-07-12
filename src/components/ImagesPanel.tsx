import { useCallback, useEffect, useState, type DragEvent, type FormEvent } from 'react'
import { ChevronRight, Folder, FolderPlus, ImagePlus, MapPin, Trash2, Upload, X } from 'lucide-react'
import { api } from '../api/client'
import type { Asset, ImageFolder, InspectionImage, LabelStatus } from '../types'

type ImagesPanelProps = {
  activeId: string
  assets: Asset[]
  assetFilterId: string | null
  onAssetFilterChange: (id: string | null) => void
  onUpload: (
    files: FileList,
    options?: { folderId?: string | null; assetId?: string | null },
  ) => void | Promise<void>
  onSelect: (id: string) => void
  onOpenInProcessing: (id: string) => void
  onDeleteUploaded: (id: string) => void | Promise<void>
  onAssignAsset: (imageId: string, assetId: string | null) => void | Promise<void>
  onImagesChanged?: () => void | Promise<void>
}

const statusLabel: Record<LabelStatus, string> = {
  critical: 'Critical',
  clear: 'Clear',
  warning: 'Review',
  info: 'Uploaded',
}

const statusClass: Record<LabelStatus, string> = {
  critical: 'status-critical',
  clear: 'status-clear',
  warning: 'status-warning',
  info: 'status-info',
}

export function ImagesPanel({
  activeId,
  assets,
  assetFilterId,
  onAssetFilterChange,
  onUpload,
  onSelect,
  onOpenInProcessing,
  onDeleteUploaded,
  onAssignAsset,
  onImagesChanged,
}: ImagesPanelProps) {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([])
  const [folders, setFolders] = useState<ImageFolder[]>([])
  const [images, setImages] = useState<InspectionImage[]>([])
  const [loading, setLoading] = useState(true)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [showNewFolderForm, setShowNewFolderForm] = useState(false)
  const [assigningId, setAssigningId] = useState<string | null>(null)

  const assetById = useCallback(
    (id?: string | null) => assets.find((asset) => asset.id === id),
    [assets],
  )

  const activeAsset = assetById(assetFilterId)

  const loadFolderView = useCallback(async (folderId: string | null) => {
    setLoading(true)
    try {
      const [nextFolders, nextImages] = await Promise.all([
        api.getFolders(folderId),
        api.getImages({ folderId }),
      ])
      setFolders(nextFolders)
      setImages(nextImages)
      if (folderId) {
        const detail = await api.getFolder(folderId)
        setBreadcrumbs(detail.breadcrumbs)
      } else {
        setBreadcrumbs([])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  const loadAssetView = useCallback(async (assetId: string) => {
    setLoading(true)
    try {
      const detail = await api.getAsset(assetId)
      setFolders([])
      setBreadcrumbs([])
      setImages(detail.images)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (assetFilterId) {
      void loadAssetView(assetFilterId)
      return
    }
    void loadFolderView(currentFolderId)
  }, [assetFilterId, currentFolderId, loadFolderView, loadAssetView])

  const refresh = useCallback(async () => {
    if (assetFilterId) {
      await loadAssetView(assetFilterId)
    } else {
      await loadFolderView(currentFolderId)
    }
    await onImagesChanged?.()
  }, [assetFilterId, currentFolderId, loadFolderView, loadAssetView, onImagesChanged])

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    try {
      await onUpload(files, {
        folderId: assetFilterId ? undefined : currentFolderId,
        assetId: assetFilterId,
      })
      await refresh()
    } finally {
      setUploading(false)
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    void handleFiles(event.dataTransfer.files)
  }

  const openFolder = (folderId: string) => {
    onAssetFilterChange(null)
    setCurrentFolderId(folderId)
  }

  const goToRoot = () => {
    onAssetFilterChange(null)
    setCurrentFolderId(null)
  }

  const goToBreadcrumb = (folderId: string) => {
    onAssetFilterChange(null)
    setCurrentFolderId(folderId)
  }

  const handleCreateFolder = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = newFolderName.trim()
    if (!trimmed) return

    setCreatingFolder(true)
    try {
      await api.createFolder(trimmed, currentFolderId)
      setNewFolderName('')
      setShowNewFolderForm(false)
      await loadFolderView(currentFolderId)
    } finally {
      setCreatingFolder(false)
    }
  }

  const handleDeleteFolder = async (folder: ImageFolder) => {
    if (folder.imageCount > 0 || folder.childCount > 0) return
    await api.deleteFolder(folder.id)
    await loadFolderView(currentFolderId)
  }

  const handleDeleteImage = async (id: string) => {
    await onDeleteUploaded(id)
    await refresh()
  }

  const handleAssetChange = async (imageId: string, value: string) => {
    setAssigningId(imageId)
    try {
      const assetId = value || null
      await onAssignAsset(imageId, assetId)
      await refresh()
    } finally {
      setAssigningId(null)
    }
  }

  const uploadedCount = images.filter((image) => image.uploaded).length
  const folderLabel = assetFilterId
    ? activeAsset?.name ?? 'Asset'
    : breadcrumbs.length
      ? breadcrumbs[breadcrumbs.length - 1].name
      : 'All Folders'

  return (
    <section className="images-panel">
      <header className="images-panel-header">
        <div>
          <h2>Images</h2>
          <p>
            {assetFilterId ? (
              <>
                <MapPin size={14} style={{ display: 'inline', verticalAlign: '-2px' }} />{' '}
                Linked to {folderLabel} · {images.length} images
              </>
            ) : (
              <>
                {folderLabel} · {folders.length} folders · {images.length} images
                {uploadedCount > 0 && ` · ${uploadedCount} uploaded`}
              </>
            )}
          </p>
        </div>
        <div className="images-panel-actions">
          {!assetFilterId && (
            <button
              type="button"
              className="folder-btn"
              onClick={() => setShowNewFolderForm((value) => !value)}
            >
              <FolderPlus size={16} />
              New Folder
            </button>
          )}
          <label className="upload-btn">
            <Upload size={16} />
            {uploading ? 'Uploading…' : 'Upload Media'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,video/mp4,video/webm,video/quicktime"
              multiple
              hidden
              disabled={uploading}
              onChange={(event) => {
                void handleFiles(event.target.files)
                event.target.value = ''
              }}
            />
          </label>
        </div>
      </header>

      {assetFilterId ? (
        <div className="asset-filter-banner">
          <span>
            Showing images associated with <strong>{activeAsset?.name ?? assetFilterId}</strong>
            {activeAsset && ` (${activeAsset.type})`}
          </span>
          <button
            type="button"
            className="asset-filter-clear"
            onClick={() => onAssetFilterChange(null)}
          >
            <X size={14} />
            Clear filter
          </button>
        </div>
      ) : (
        <nav className="folder-breadcrumbs" aria-label="Folder path">
          <button type="button" className="crumb-btn" onClick={goToRoot}>
            All Folders
          </button>
          {breadcrumbs.map((crumb) => (
            <span key={crumb.id} className="crumb-segment">
              <ChevronRight size={14} />
              <button type="button" className="crumb-btn" onClick={() => goToBreadcrumb(crumb.id)}>
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
      )}

      {showNewFolderForm && !assetFilterId && (
        <form className="new-folder-form" onSubmit={handleCreateFolder}>
          <input
            type="text"
            value={newFolderName}
            onChange={(event) => setNewFolderName(event.target.value)}
            placeholder="Folder name"
            autoFocus
            maxLength={80}
          />
          <button type="submit" className="card-btn primary" disabled={creatingFolder || !newFolderName.trim()}>
            {creatingFolder ? 'Creating…' : 'Create'}
          </button>
          <button
            type="button"
            className="card-btn"
            onClick={() => {
              setShowNewFolderForm(false)
              setNewFolderName('')
            }}
          >
            Cancel
          </button>
        </form>
      )}

      <div
        className={`upload-dropzone${dragging ? ' dragging' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={(event) => {
          event.preventDefault()
          if (event.currentTarget === event.target) setDragging(false)
        }}
        onDrop={onDrop}
        role="region"
        aria-label="Upload images by dragging files here"
      >
        <ImagePlus size={28} />
        <strong>
          {assetFilterId
            ? `Drop images to link to ${activeAsset?.name ?? 'asset'}`
            : `Drop images into ${folderLabel}`}
        </strong>
        <span>
          PNG, JPG, WEBP, MP4, WEBM
          {assetFilterId
            ? ' · uploads are automatically associated with this asset'
            : ' · uploads go to the current folder'}
        </span>
      </div>

      {loading ? (
        <p className="images-loading">Loading…</p>
      ) : folders.length === 0 && images.length === 0 ? (
        <div className="images-empty">
          {assetFilterId ? <MapPin size={32} /> : <Folder size={32} />}
          <p>
            {assetFilterId
              ? 'No images linked to this asset yet. Upload images or assign existing ones from the folder view.'
              : 'This folder is empty. Create a subfolder or upload images.'}
          </p>
        </div>
      ) : (
        <div className="images-grid">
          {!assetFilterId &&
            folders.map((folder) => (
              <article key={folder.id} className="folder-card">
                <button type="button" className="folder-card-open" onClick={() => openFolder(folder.id)}>
                  <Folder size={36} />
                  <strong>{folder.name}</strong>
                  <span>
                    {folder.childCount > 0 && `${folder.childCount} folders · `}
                    {folder.imageCount} images
                  </span>
                </button>
                {folder.imageCount === 0 && folder.childCount === 0 && (
                  <button
                    type="button"
                    className="card-btn icon folder-delete"
                    onClick={() => void handleDeleteFolder(folder)}
                    aria-label={`Delete folder ${folder.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </article>
            ))}

          {images.map((image) => {
            const linkedAsset = assetById(image.assetId)
            return (
              <article
                key={image.id}
                className={`image-card${image.id === activeId ? ' selected' : ''}`}
              >
                <button type="button" className="image-card-preview" onClick={() => onSelect(image.id)}>
                  {image.mediaType === 'video' ? (
                    <video src={image.src} muted preload="metadata" />
                  ) : (
                    <img src={image.src} alt={image.name} loading="lazy" />
                  )}
                  {image.mediaType === 'video' && <span className="image-card-media-badge">Video</span>}
                </button>

                <div className="image-card-body">
                  <div className="image-card-title">
                    <strong>{image.name}</strong>
                    <span className={`status-pill ${statusClass[image.status]}`}>
                      {image.uploaded ? 'Uploaded' : statusLabel[image.status]}
                    </span>
                  </div>

                  <div className="image-card-meta">
                    {image.uploaded ? 'Server upload' : 'Sample dataset'}
                    {image.boxes.length > 0 && ` · ${image.boxes.length} labels`}
                  </div>

                  <label className="image-asset-field">
                    <span>Asset</span>
                    <select
                      value={image.assetId ?? ''}
                      disabled={assigningId === image.id}
                      onChange={(event) => void handleAssetChange(image.id, event.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {assets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.name} ({asset.type})
                        </option>
                      ))}
                    </select>
                  </label>

                  {linkedAsset && (
                    <div className="image-asset-badge">
                      <MapPin size={12} />
                      {linkedAsset.name}
                    </div>
                  )}

                  <div className="image-card-actions">
                    <button type="button" className="card-btn primary" onClick={() => onOpenInProcessing(image.id)}>
                      Open in AI Processing
                    </button>
                    {image.uploaded && (
                      <button
                        type="button"
                        className="card-btn icon"
                        onClick={() => void handleDeleteImage(image.id)}
                        aria-label={`Delete ${image.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
