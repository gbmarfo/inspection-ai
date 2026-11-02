import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from './api/client'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { ImageViewer } from './components/ImageViewer'
import { VideoViewer } from './components/VideoViewer'
import { MapPanel } from './components/MapPanel'
import { ThumbnailStrip } from './components/ThumbnailStrip'
import { ImagesPanel } from './components/ImagesPanel'
import { ModelsPanel } from './components/ModelsPanel'
import { OverviewPanel } from './components/OverviewPanel'
import { AssetsPanel } from './components/AssetsPanel'
import { AssetClassesPanel } from './components/AssetClassesPanel'
import { SchedulePanel } from './components/SchedulePanel'
import { ReportsPanel } from './components/ReportsPanel'
import { ServiceRequestsPanel } from './components/ServiceRequestsPanel'
import { AIProcessingToolbar } from './components/AIProcessingToolbar'
import type {
  BoundingBox,
  ImageFolder,
  InspectionImage,
  InspectionReport,
  NavTab,
  OverviewStats,
  ServiceRequest,
  ServiceRequestStatus,
  Asset,
} from './types'
import type { VisionModel } from './data/visionModels'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('Overview')
  const [images, setImages] = useState<InspectionImage[]>([])
  const [overview, setOverview] = useState<OverviewStats | null>(null)
  const [assets, setAssets] = useState<Asset[]>([])
  const [reports, setReports] = useState<InspectionReport[]>([])
  const [serviceRequests, setServiceRequests] = useState<ServiceRequest[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [showLabels, setShowLabels] = useState(true)
  const [showMap, setShowMap] = useState(false)
  const [thumbsCollapsed, setThumbsCollapsed] = useState(true)
  const [page, setPage] = useState(1)
  const [datasets, setDatasets] = useState<ImageFolder[]>([])
  const [datasetId, setDatasetId] = useState<string | null>(null)
  const [modelCatalog, setModelCatalog] = useState<VisionModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [processing, setProcessing] = useState(false)
  const [extractingFrames, setExtractingFrames] = useState(false)
  const [loading, setLoading] = useState(true)
  const [overviewLoading, setOverviewLoading] = useState(false)
  const [assetsLoading, setAssetsLoading] = useState(false)
  const [reportsLoading, setReportsLoading] = useState(false)
  const [serviceRequestsLoading, setServiceRequestsLoading] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [creatingServiceRequests, setCreatingServiceRequests] = useState(false)
  const [focusAnnotationId, setFocusAnnotationId] = useState<string | null>(null)
  const [assetFilterId, setAssetFilterId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const activeImage = images[activeIndex] ?? images[0]

  const stats = useMemo(() => {
    const critical = images.filter((img) => img.status === 'critical').length
    const clear = images.filter((img) => img.status === 'clear').length
    return { critical, clear, total: images.length }
  }, [images])

  const refreshImages = useCallback(async () => {
    const next = await api.getImages(
      datasetId === null ? undefined : { folderId: datasetId },
    )
    setImages(next)
    setActiveIndex((index) => {
      if (!next.length) return 0
      if (index >= next.length) return next.length - 1
      return index
    })
    return next
  }, [datasetId])

  useEffect(() => {
    refreshImages()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load images'))
      .finally(() => setLoading(false))
  }, [refreshImages])

  useEffect(() => {
    api.getFolders().then(setDatasets).catch(() => undefined)
    api.getModelCatalog()
      .then((models) => {
        setModelCatalog(models)
        setSelectedModelId(
          (current) => current || models.find((model) => model.recommended)?.id || models[0]?.id || '',
        )
      })
      .catch(() => undefined)
  }, [])

  useEffect(() => {
    if (activeTab !== 'Overview') return
    setOverviewLoading(true)
    api.getOverview()
      .then(setOverview)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load overview'))
      .finally(() => setOverviewLoading(false))
  }, [activeTab, images])

  useEffect(() => {
    if (activeTab !== 'Assets' && activeTab !== 'Images' && activeTab !== 'Schedule') return
    setAssetsLoading(true)
    api.getAssets()
      .then(setAssets)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load assets'))
      .finally(() => setAssetsLoading(false))
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== 'Reports') return
    setReportsLoading(true)
    api.getReports()
      .then(setReports)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load reports'))
      .finally(() => setReportsLoading(false))
  }, [activeTab])

  useEffect(() => {
    if (activeTab !== 'Service Requests') return
    setServiceRequestsLoading(true)
    api.getServiceRequests()
      .then(setServiceRequests)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load service requests'),
      )
      .finally(() => setServiceRequestsLoading(false))
  }, [activeTab])

  const goTo = (index: number) => {
    if (!images.length) return
    const wrapped = (index + images.length) % images.length
    setActiveIndex(wrapped)
  }

  const selectById = (id: string) => {
    const index = images.findIndex((img) => img.id === id)
    if (index >= 0) setActiveIndex(index)
  }

  const replaceImage = (updated: InspectionImage) => {
    setImages((current) => current.map((image) => (image.id === updated.id ? updated : image)))
  }

  const handleUpload = useCallback(async (
    files: FileList,
    options?: { folderId?: string | null; assetId?: string | null },
  ) => {
    const uploaded = await api.uploadImages(files, options)
    await refreshImages()
    const firstNew = uploaded[0]
    if (firstNew) {
      const next = await api.getImages()
      const index = next.findIndex((image) => image.id === firstNew.id)
      if (index >= 0) setActiveIndex(index)
    }
  }, [refreshImages])

  const handleDeleteUploaded = useCallback(async (id: string) => {
    await api.deleteImage(id)
    await refreshImages()
  }, [refreshImages])

  const openInProcessing = (id: string) => {
    selectById(id)
    setActiveTab('AI Processing')
  }

  const handleCreateBox = useCallback(async (imageId: string, box: BoundingBox) => {
    const updated = await api.createAnnotation(imageId, box)
    replaceImage(updated)
  }, [])

  const handleUpdateBox = useCallback(
    async (
      imageId: string,
      annotationId: string,
      patch: Partial<
        Pick<
          BoundingBox,
          'classification' | 'severity' | 'label' | 'status' | 'x' | 'y' | 'width' | 'height' | 'points' | 'timestampMs'
        >
      >,
    ) => {
      const updated = await api.updateAnnotation(imageId, annotationId, patch)
      replaceImage(updated)
    },
    [],
  )

  const handleDeleteBox = useCallback(async (imageId: string, boxId: string) => {
    const updated = await api.deleteAnnotation(imageId, boxId)
    replaceImage(updated)
  }, [])

  const handleRunInference = async () => {
    if (!activeImage || processing) return
    setProcessing(true)
    try {
      const updated = await api.runInference(activeImage.id, selectedModelId || undefined)
      replaceImage(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI processing failed')
    } finally {
      setProcessing(false)
    }
  }

  const handleExtractFrames = async () => {
    if (!activeImage || extractingFrames || activeImage.mediaType !== 'video') return
    setExtractingFrames(true)
    try {
      const result = await api.extractVideoFrames(activeImage.id)
      const nextImages = await refreshImages()
      const firstExtracted = result.images[0]
      if (firstExtracted) {
        const index = nextImages.findIndex((image) => image.id === firstExtracted.id)
        if (index >= 0) setActiveIndex(index)
      }
      api.getFolders().then(setDatasets).catch(() => undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extract video frames')
    } finally {
      setExtractingFrames(false)
    }
  }

  const handleSelectDataset = (id: string | null) => {
    setDatasetId(id)
    setActiveIndex(0)
    setPage(1)
  }

  const handleGenerateReport = async () => {
    setGeneratingReport(true)
    try {
      const report = await api.generateReport()
      setReports((current) => [report, ...current])
    } finally {
      setGeneratingReport(false)
    }
  }

  const handleCreateServiceRequest = useCallback(async (imageId: string, annotationId: string) => {
    try {
      const request = await api.createServiceRequest(annotationId, imageId)
      setServiceRequests((current) => [request, ...current.filter((item) => item.id !== request.id)])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create service request')
      throw err
    }
  }, [])

  const handleBulkCreateServiceRequests = async () => {
    setCreatingServiceRequests(true)
    try {
      const result = await api.bulkCreateServiceRequests()
      if (result.created.length) {
        setServiceRequests((current) => {
          const ids = new Set(result.created.map((item) => item.id))
          return [...result.created, ...current.filter((item) => !ids.has(item.id))]
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create service requests')
    } finally {
      setCreatingServiceRequests(false)
    }
  }

  const handleUpdateServiceRequest = async (id: string, status: ServiceRequestStatus) => {
    const updated = await api.updateServiceRequest(id, status)
    setServiceRequests((current) => current.map((item) => (item.id === id ? updated : item)))
  }

  const handleAssignAsset = useCallback(async (imageId: string, assetId: string | null) => {
    const updated = await api.assignImageAsset(imageId, assetId)
    replaceImage(updated)
    await api.getAssets().then(setAssets).catch(() => undefined)
  }, [])

  const handleSelectAsset = (assetId: string) => {
    setAssetFilterId(assetId)
    setActiveTab('Images')
  }

  const handleOpenServiceRequest = async (
    request: ServiceRequest,
    options?: { showMap?: boolean },
  ) => {
    try {
      let nextImages = images
      let index = images.findIndex((image) => image.id === request.imageId)
      if (index < 0) {
        nextImages = await api.getImages()
        setImages(nextImages)
        setDatasetId(null)
        index = nextImages.findIndex((image) => image.id === request.imageId)
      }
      if (index < 0) {
        setError('Image for this service request is no longer available.')
        return
      }
      setActiveIndex(index)
      setFocusAnnotationId(request.annotationId)
      setActiveTab('AI Processing')
      if (options?.showMap) setShowMap(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to open service request')
    }
  }

  const handleOpenAssetImage = (imageId: string) => {
    selectById(imageId)
    setActiveTab('AI Processing')
  }

  const activeFocusAnnotationId =
    focusAnnotationId && activeImage?.boxes.some((box) => box.id === focusAnnotationId)
      ? focusAnnotationId
      : null

  if (loading) {
    return (
      <div className="app-shell loading-shell">
        <p>Loading PowerAI…</p>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="workspace">
        {error && (
          <div className="app-error" role="alert">
            {error}
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">
              ×
            </button>
          </div>
        )}

        {activeTab !== 'Overview' && (
          <TopBar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            showLabels={showLabels}
            onToggleLabels={() => setShowLabels((value) => !value)}
            focusTitle={activeImage?.name}
            focusMeta={
              activeTab === 'AI Processing' && images.length
                ? `${activeIndex + 1} / ${images.length}`
                : undefined
            }
            onPrevious={activeTab === 'AI Processing' ? () => goTo(activeIndex - 1) : undefined}
            onNext={activeTab === 'AI Processing' ? () => goTo(activeIndex + 1) : undefined}
          />
        )}

        {activeTab === 'Overview' ? (
          <OverviewPanel stats={overview} loading={overviewLoading} />
        ) : activeTab === 'Assets' ? (
          <AssetsPanel
            assets={assets}
            loading={assetsLoading}
            onSelectAsset={handleSelectAsset}
            onOpenImage={handleOpenAssetImage}
            onAssetsChanged={() => api.getAssets().then(setAssets).catch(() => undefined)}
          />
        ) : activeTab === 'Asset Classes' ? (
          <AssetClassesPanel
            onChanged={() => api.getAssets().then(setAssets).catch(() => undefined)}
          />
        ) : activeTab === 'Schedule' ? (
          <SchedulePanel
            assets={assets}
            loading={assetsLoading}
            onAssetsChanged={() => api.getAssets().then(setAssets).catch(() => undefined)}
          />
        ) : activeTab === 'AI Processing' ? (
          activeImage ? (
            <div className="ai-processing-shell">
              <AIProcessingToolbar
                activeImage={activeImage}
                activeIndex={activeIndex}
                totalImages={images.length}
                stats={stats}
                datasets={datasets}
                datasetId={datasetId}
                modelCatalog={modelCatalog}
                selectedModelId={selectedModelId}
                processing={processing}
                extractingFrames={extractingFrames}
                showMap={showMap}
                onDatasetChange={handleSelectDataset}
                onModelChange={setSelectedModelId}
                onRunInference={handleRunInference}
                onExtractFrames={handleExtractFrames}
                onToggleMap={() => setShowMap((visible) => !visible)}
              />

              <main className={`split-view${showMap ? '' : ' map-hidden'}`}>
                {activeImage.mediaType === 'video' ? (
                  <VideoViewer
                    imageId={activeImage.id}
                    src={activeImage.src}
                    alt={activeImage.name}
                    boxes={activeImage.boxes}
                    showLabels={showLabels}
                    onCreateBox={handleCreateBox}
                    onUpdateBox={handleUpdateBox}
                    onDeleteBox={handleDeleteBox}
                    onCreateServiceRequest={handleCreateServiceRequest}
                    focusAnnotationId={activeFocusAnnotationId}
                    onFocusApplied={() => setFocusAnnotationId(null)}
                    onPrevious={() => goTo(activeIndex - 1)}
                    onNext={() => goTo(activeIndex + 1)}
                  />
                ) : (
                  <ImageViewer
                    imageId={activeImage.id}
                    src={activeImage.src}
                    alt={activeImage.name}
                    boxes={activeImage.boxes}
                    showLabels={showLabels}
                    onCreateBox={handleCreateBox}
                    onUpdateBox={handleUpdateBox}
                    onDeleteBox={handleDeleteBox}
                    onCreateServiceRequest={handleCreateServiceRequest}
                    focusAnnotationId={activeFocusAnnotationId}
                    onFocusApplied={() => setFocusAnnotationId(null)}
                    onPrevious={() => goTo(activeIndex - 1)}
                    onNext={() => goTo(activeIndex + 1)}
                  />
                )}
                {showMap && <MapPanel activeLat={activeImage.lat} activeLng={activeImage.lng} />}
              </main>

              <ThumbnailStrip
                images={images}
                activeId={activeImage.id}
                page={page}
                collapsed={thumbsCollapsed}
                onToggleCollapse={() => setThumbsCollapsed((value) => !value)}
                onSelect={selectById}
                onPageChange={setPage}
              />
            </div>
          ) : (
            <section className="placeholder-panel">
              <h2>No images</h2>
              <p>Upload images from the Images tab to begin inspection.</p>
            </section>
          )
        ) : activeTab === 'Images' ? (
          <ImagesPanel
            activeId={activeImage?.id ?? ''}
            assets={assets}
            assetFilterId={assetFilterId}
            onAssetFilterChange={setAssetFilterId}
            onUpload={handleUpload}
            onSelect={selectById}
            onOpenInProcessing={openInProcessing}
            onDeleteUploaded={handleDeleteUploaded}
            onAssignAsset={handleAssignAsset}
            onImagesChanged={() => {
              void refreshImages()
              void api.getAssets().then(setAssets).catch(() => undefined)
            }}
          />
        ) : activeTab === 'Models' ? (
          <ModelsPanel />
        ) : activeTab === 'Reports' ? (
          <ReportsPanel
            reports={reports}
            loading={reportsLoading}
            generating={generatingReport}
            onGenerate={handleGenerateReport}
          />
        ) : activeTab === 'Service Requests' ? (
          <ServiceRequestsPanel
            requests={serviceRequests}
            loading={serviceRequestsLoading}
            creating={creatingServiceRequests}
            onBulkCreate={handleBulkCreateServiceRequests}
            onUpdateStatus={handleUpdateServiceRequest}
            onOpenImage={(request) => void handleOpenServiceRequest(request)}
            onViewOnMap={(request) => void handleOpenServiceRequest(request, { showMap: true })}
          />
        ) : (
          <section className="placeholder-panel">
            <h2>{activeTab}</h2>
            <p>This section is not available in the prototype.</p>
          </section>
        )}
      </div>
    </div>
  )
}

export default App
