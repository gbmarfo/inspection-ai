import { useEffect, useRef, useState } from 'react'
import { Brain, CheckCircle2, Play, Sparkles } from 'lucide-react'
import { api } from '../api/client'
import type { VisionModel } from '../data/visionModels'
import type { MlflowRegisteredModel, MlflowStatus, TrainingConfig, TrainingJob } from '../types'

/** Defaults aligned with Ultralytics fine-tuning guide for small custom datasets. */
const defaultConfig: TrainingConfig = {
  epochs: 50,
  batchSize: 8,
  imageSize: 640,
  learningRate: 0.001,
  trainSplit: 80,
  freeze: 10,
  patience: 15,
  optimizer: 'AdamW',
  twoStage: false,
  stage1Epochs: 20,
  stage2Epochs: 30,
  warmupEpochs: 3,
}

type FreezePreset = {
  value: number | null
  label: string
  hint: string
}

export function ModelsPanel() {
  const [catalog, setCatalog] = useState<VisionModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [config, setConfig] = useState<TrainingConfig>(defaultConfig)
  const [dataset, setDataset] = useState<Awaited<ReturnType<typeof api.getDatasetStats>> | null>(null)
  const [activeJob, setActiveJob] = useState<TrainingJob | null>(null)
  const [history, setHistory] = useState<TrainingJob[]>([])
  const [mlflowStatus, setMlflowStatus] = useState<MlflowStatus | null>(null)
  const [registeredModels, setRegisteredModels] = useState<MlflowRegisteredModel[]>([])
  const [ultralyticsAvailable, setUltralyticsAvailable] = useState(false)
  const [freezePresets, setFreezePresets] = useState<FreezePreset[]>([
    { value: null, label: 'None (full model)', hint: 'Large dataset or domain far from COCO' },
    { value: 10, label: 'Backbone (freeze=10)', hint: 'Small dataset, similar domain — recommended' },
    { value: 11, label: 'Full backbone (freeze=11)', hint: 'Freeze entire backbone including C2PSA' },
    { value: 23, label: 'Head only (freeze=23)', hint: 'Very small dataset — only detection head trains' },
  ])
  const [guideUrl, setGuideUrl] = useState('https://docs.ultralytics.com/guides/finetuning-guide')
  const [startError, setStartError] = useState<string | null>(null)
  const pollRef = useRef<number | null>(null)

  const refreshMlflow = () =>
    Promise.all([api.getMlflowStatus(), api.getMlflowRegisteredModels()])
      .then(([status, models]) => {
        setMlflowStatus(status)
        setRegisteredModels(models)
      })
      .catch(() => undefined)

  useEffect(() => {
    Promise.all([
      api.getModelCatalog(),
      api.getDatasetStats(),
      api.getTrainingJobs(),
      api.getFinetuneCapabilities().catch(() => null),
    ])
      .then(([models, stats, jobs, caps]) => {
        setCatalog(models)
        setSelectedModelId(models.find((m) => m.recommended)?.id ?? models[0]?.id ?? '')
        setDataset(stats)
        setHistory(jobs.filter((job) => job.status === 'completed' || job.status === 'failed'))
        const running = jobs.find((job) => job.status === 'running')
        if (running) setActiveJob(running)
        if (caps) {
          setUltralyticsAvailable(caps.ultralyticsAvailable)
          setFreezePresets(caps.freezePresets)
          setGuideUrl(caps.guideUrl)
        }
      })
      .catch(() => undefined)
    void refreshMlflow()
  }, [])

  useEffect(() => {
    if (!activeJob || activeJob.status !== 'running') {
      if (pollRef.current) window.clearInterval(pollRef.current)
      return
    }

    pollRef.current = window.setInterval(async () => {
      try {
        const job = await api.getTrainingJob(activeJob.id)
        setActiveJob(job)
        if (job.status === 'completed' || job.status === 'failed') {
          setHistory((jobs) => [job, ...jobs.filter((entry) => entry.id !== job.id)].slice(0, 5))
          const stats = await api.getDatasetStats()
          setDataset(stats)
          void refreshMlflow()
        }
      } catch {
        // ignore polling errors
      }
    }, 500)

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current)
    }
  }, [activeJob?.id, activeJob?.status])

  const ready = dataset?.ready ?? false
  const selectedModel = catalog.find((model) => model.id === selectedModelId) ?? catalog[0]
  const willUseUltralytics = Boolean(selectedModel?.finetuneSupported && ultralyticsAvailable)
  const selectedFreeze = freezePresets.find((preset) => preset.value === config.freeze)

  const startTraining = async () => {
    if (!ready || !selectedModel || activeJob?.status === 'running') return
    setStartError(null)
    try {
      const job = await api.startTraining(selectedModel.id, config)
      setActiveJob(job)
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'Failed to start training')
    }
  }

  const topClasses = Object.entries(dataset?.classCounts ?? {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  if (!catalog.length || !dataset) {
    return (
      <section className="placeholder-panel">
        <p>Loading models…</p>
      </section>
    )
  }

  return (
    <section className="models-panel">
      <header className="models-panel-header">
        <div>
          <h2>Vision Models</h2>
          <p>
            Fine-tune a pretrained detector on your inspection dataset
            {willUseUltralytics ? ' with Ultralytics YOLO transfer learning.' : '.'}
          </p>
        </div>
        <button
          type="button"
          className="train-btn"
          disabled={!ready || activeJob?.status === 'running'}
          onClick={() => void startTraining()}
        >
          {activeJob?.status === 'running' ? (
            <>Fine-tuning… {activeJob.progress}%</>
          ) : (
            <>
              <Play size={16} />
              Start Fine-Tune
            </>
          )}
        </button>
      </header>

      {startError && <p className="models-error">{startError}</p>}

      <div className="models-layout">
        <aside className="models-sidebar">
          <div className="models-card">
            <h3>Dataset Summary</h3>
            <dl className="dataset-stats">
              <div>
                <dt>Total images</dt>
                <dd>{dataset.totalImages}</dd>
              </div>
              <div>
                <dt>Labeled images</dt>
                <dd>{dataset.labeledImages}</dd>
              </div>
              <div>
                <dt>Annotations</dt>
                <dd>{dataset.totalAnnotations}</dd>
              </div>
              <div>
                <dt>Uploaded</dt>
                <dd>{dataset.uploadedImages}</dd>
              </div>
              <div>
                <dt>Train / Val split</dt>
                <dd>
                  {config.trainSplit}% / {100 - config.trainSplit}%
                </dd>
              </div>
            </dl>

            {!ready && (
              <p className="models-hint">
                Need at least 2 labeled images and 5 annotations to start fine-tuning.
              </p>
            )}
            {ready && willUseUltralytics && (
              <p className="models-hint">
                Dataset will be exported to YOLO format and trained from pretrained weights
                {selectedModel?.baseWeights ? ` (${selectedModel.baseWeights})` : ''}.
              </p>
            )}
            {ready && !willUseUltralytics && (
              <p className="models-hint">
                {ultralyticsAvailable
                  ? 'This architecture uses simulated training. Choose PowerAI Detect, YOLOv8, or RT-DETR for real Ultralytics fine-tuning.'
                  : 'Install ultralytics to enable real YOLO fine-tuning (pip install ultralytics).'}
              </p>
            )}
          </div>

          {topClasses.length > 0 && (
            <div className="models-card">
              <h3>Class Distribution</h3>
              <ul className="class-distribution">
                {topClasses.map(([label, count]) => (
                  <li key={label}>
                    <span>{label}</span>
                    <strong>{count}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activeJob && (
            <div className="models-card">
              <h3>Active Job</h3>
              <div className="job-status">
                <span className={`job-badge ${activeJob.status}`}>{activeJob.status}</span>
                <strong>{activeJob.modelName}</strong>
                <span className="job-meta">
                  {activeJob.engine === 'ultralytics' ? 'Ultralytics fine-tune' : 'Simulated'} ·{' '}
                  {activeJob.id}
                </span>
              </div>
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${activeJob.progress}%` }} />
              </div>
              <p className="job-meta">
                Epoch {activeJob.currentEpoch} / {activeJob.totalEpochs}
                {activeJob.twoStage ? ' · two-stage' : ''}
                {activeJob.freeze != null ? ` · freeze=${activeJob.freeze}` : ''}
              </p>
              {activeJob.error && <p className="models-error">{activeJob.error}</p>}
              {activeJob.metrics && (
                <dl className="metrics-grid">
                  <div>
                    <dt>mAP</dt>
                    <dd>{(activeJob.metrics.mAP * 100).toFixed(1)}%</dd>
                  </div>
                  <div>
                    <dt>Precision</dt>
                    <dd>{(activeJob.metrics.precision * 100).toFixed(1)}%</dd>
                  </div>
                  <div>
                    <dt>Recall</dt>
                    <dd>{(activeJob.metrics.recall * 100).toFixed(1)}%</dd>
                  </div>
                  <div>
                    <dt>Loss</dt>
                    <dd>{activeJob.metrics.loss.toFixed(3)}</dd>
                  </div>
                </dl>
              )}
              {activeJob.mlflowRunId && (
                <p className="job-meta mlflow-meta">
                  MLflow run <code>{activeJob.mlflowRunId.slice(0, 8)}</code>
                </p>
              )}
              {activeJob.mlflowModelName && activeJob.mlflowModelVersion && (
                <p className="job-meta mlflow-meta">
                  Registered as {activeJob.mlflowModelName} v{activeJob.mlflowModelVersion}
                </p>
              )}
            </div>
          )}

          {mlflowStatus?.enabled && (
            <div className="models-card">
              <h3>MLflow Registry</h3>
              <p className="models-hint mlflow-uri">{mlflowStatus.trackingUri}</p>
              {registeredModels.length === 0 ? (
                <p className="models-hint">
                  No registered models yet. Complete a training run to register one.
                </p>
              ) : (
                <ul className="mlflow-registry">
                  {registeredModels.map((model) => (
                    <li key={`${model.name}-${model.latestVersion}`}>
                      <div>
                        <strong>{model.name}</strong>
                        <span className="job-meta">
                          v{model.latestVersion} · {model.stage}
                        </span>
                      </div>
                      {model.description && <p className="models-hint">{model.description}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </aside>

        <div className="models-main">
          <div className="models-card">
            <h3>Select Model</h3>
            <div className="model-grid">
              {catalog.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  className={`model-card${model.id === selectedModelId ? ' selected' : ''}`}
                  onClick={() => setSelectedModelId(model.id)}
                >
                  <div className="model-card-top">
                    <Brain size={18} />
                    {model.recommended && (
                      <span className="model-badge">
                        <Sparkles size={12} />
                        Recommended
                      </span>
                    )}
                    {model.finetuneSupported && (
                      <span className="model-badge finetune">Fine-tune</span>
                    )}
                  </div>
                  <strong>{model.name}</strong>
                  <span className="model-family">{model.family}</span>
                  <p>{model.description}</p>
                  <div className="model-tags">
                    <span>{model.task}</span>
                    <span>{model.params} params</span>
                    {model.baseWeights && <span>{model.baseWeights}</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="models-card">
            <div className="models-card-head-row">
              <h3>Fine-Tuning Configuration</h3>
              <a className="models-guide-link" href={guideUrl} target="_blank" rel="noreferrer">
                Ultralytics guide
              </a>
            </div>
            <p className="models-hint finetune-intro">
              Start from pretrained COCO weights, optionally freeze the backbone, and stop early when
              validation plateaus. Two-stage mode freezes the backbone first, then unfreezes with a
              lower learning rate.
            </p>

            <div className="config-grid">
              <label>
                Epochs
                <input
                  type="number"
                  min={10}
                  max={200}
                  value={config.epochs}
                  disabled={config.twoStage}
                  onChange={(event) =>
                    setConfig((current) => ({ ...current, epochs: Number(event.target.value) }))
                  }
                />
              </label>
              <label>
                Batch size
                <input
                  type="number"
                  min={2}
                  max={64}
                  step={2}
                  value={config.batchSize}
                  onChange={(event) =>
                    setConfig((current) => ({ ...current, batchSize: Number(event.target.value) }))
                  }
                />
              </label>
              <label>
                Image size (px)
                <select
                  value={config.imageSize}
                  onChange={(event) =>
                    setConfig((current) => ({ ...current, imageSize: Number(event.target.value) }))
                  }
                >
                  <option value={512}>512</option>
                  <option value={640}>640</option>
                  <option value={768}>768</option>
                  <option value={1024}>1024</option>
                </select>
              </label>
              <label>
                Learning rate
                <input
                  type="number"
                  min={0.0001}
                  max={0.01}
                  step={0.0001}
                  value={config.learningRate}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      learningRate: Number(event.target.value),
                    }))
                  }
                />
              </label>
              <label>
                Optimizer
                <select
                  value={config.optimizer}
                  onChange={(event) =>
                    setConfig((current) => ({
                      ...current,
                      optimizer: event.target.value as TrainingConfig['optimizer'],
                    }))
                  }
                >
                  <option value="auto">Auto</option>
                  <option value="AdamW">AdamW</option>
                  <option value="SGD">SGD</option>
                </select>
              </label>
              <label>
                Patience (early stop)
                <input
                  type="number"
                  min={5}
                  max={100}
                  value={config.patience}
                  onChange={(event) =>
                    setConfig((current) => ({ ...current, patience: Number(event.target.value) }))
                  }
                />
              </label>
              <label className="config-wide">
                Freeze layers
                <select
                  value={config.freeze === null ? 'none' : String(config.freeze)}
                  onChange={(event) => {
                    const value = event.target.value
                    setConfig((current) => ({
                      ...current,
                      freeze: value === 'none' ? null : Number(value),
                    }))
                  }}
                >
                  {freezePresets.map((preset) => (
                    <option
                      key={String(preset.value)}
                      value={preset.value === null ? 'none' : String(preset.value)}
                    >
                      {preset.label}
                    </option>
                  ))}
                </select>
                {selectedFreeze && <span className="config-hint">{selectedFreeze.hint}</span>}
              </label>
              <label className="config-wide">
                Train split ({config.trainSplit}%)
                <input
                  type="range"
                  min={60}
                  max={90}
                  step={5}
                  value={config.trainSplit}
                  onChange={(event) =>
                    setConfig((current) => ({ ...current, trainSplit: Number(event.target.value) }))
                  }
                />
              </label>
              <label className="config-wide config-checkbox">
                <input
                  type="checkbox"
                  checked={config.twoStage}
                  onChange={(event) =>
                    setConfig((current) => ({ ...current, twoStage: event.target.checked }))
                  }
                />
                <span>
                  Two-stage fine-tuning (stage 1 freeze backbone → stage 2 unfreeze, lower LR)
                </span>
              </label>
              {config.twoStage && (
                <>
                  <label>
                    Stage 1 epochs
                    <input
                      type="number"
                      min={5}
                      max={100}
                      value={config.stage1Epochs}
                      onChange={(event) =>
                        setConfig((current) => ({
                          ...current,
                          stage1Epochs: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Stage 2 epochs
                    <input
                      type="number"
                      min={5}
                      max={100}
                      value={config.stage2Epochs}
                      onChange={(event) =>
                        setConfig((current) => ({
                          ...current,
                          stage2Epochs: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                </>
              )}
            </div>
          </div>

          {history.length > 0 && (
            <div className="models-card">
              <h3>Recent Training Runs</h3>
              <ul className="training-history">
                {history.map((job) => (
                  <li key={job.id}>
                    <div>
                      <strong>{job.modelName}</strong>
                      <span>
                        {job.startedAt}
                        {job.engine ? ` · ${job.engine}` : ''}
                      </span>
                    </div>
                    <div className="history-meta">
                      <span className={`job-badge ${job.status}`}>{job.status}</span>
                      {job.metrics && (
                        <span className="history-score">
                          <CheckCircle2 size={14} />
                          mAP {(job.metrics.mAP * 100).toFixed(1)}%
                        </span>
                      )}
                      {job.mlflowModelName && job.mlflowModelVersion && (
                        <span className="history-score">
                          {job.mlflowModelName} v{job.mlflowModelVersion}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
