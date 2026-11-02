import { useEffect, useState } from 'react'
import { CheckSquare, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { api } from '../api/client'
import type { AssetClass, ChecklistItem } from '../types'

type AssetClassesPanelProps = {
  onChanged?: () => void | Promise<void>
}

const EMPTY_CLASS = { name: '', description: '', category: 'Transmission' }
const EMPTY_ITEM = { label: '', description: '', required: true, severityHint: 'Medium' }
const SEVERITIES = ['Low', 'Medium', 'High', 'Critical'] as const
const CATEGORIES = ['Transmission', 'Distribution', 'Substation', 'Other'] as const

type ItemDraft = {
  label: string
  description: string
  required: boolean
  severityHint: string
}

function toDraft(item: ChecklistItem): ItemDraft {
  return {
    label: item.label,
    description: item.description || '',
    required: item.required,
    severityHint: item.severityHint || 'Medium',
  }
}

function ChecklistItemFields({
  value,
  onChange,
  idPrefix,
}: {
  value: ItemDraft
  onChange: (next: ItemDraft) => void
  idPrefix: string
}) {
  return (
    <div className="checklist-form-fields">
      <div className="checklist-form-row">
        <label className="checklist-field checklist-field-grow" htmlFor={`${idPrefix}-label`}>
          <span className="checklist-field-label">Inspection item</span>
          <input
            id={`${idPrefix}-label`}
            value={value.label}
            onChange={(event) => onChange({ ...value, label: event.target.value })}
            placeholder="e.g. Ground wire continuity"
          />
        </label>
        <label className="checklist-field checklist-field-severity" htmlFor={`${idPrefix}-severity`}>
          <span className="checklist-field-label">Severity hint</span>
          <select
            id={`${idPrefix}-severity`}
            value={value.severityHint}
            onChange={(event) => onChange({ ...value, severityHint: event.target.value })}
          >
            {SEVERITIES.map((severity) => (
              <option key={severity}>{severity}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="checklist-field" htmlFor={`${idPrefix}-guidance`}>
        <span className="checklist-field-label">Inspector guidance</span>
        <textarea
          id={`${idPrefix}-guidance`}
          rows={3}
          value={value.description}
          onChange={(event) => onChange({ ...value, description: event.target.value })}
          placeholder="Describe what to inspect, what failure looks like, and any evidence to capture."
        />
      </label>

      <label className="checklist-switch" htmlFor={`${idPrefix}-required`}>
        <input
          id={`${idPrefix}-required`}
          type="checkbox"
          checked={value.required}
          onChange={(event) => onChange({ ...value, required: event.target.checked })}
        />
        <span className="checklist-switch-ui" aria-hidden />
        <span className="checklist-switch-copy">
          <strong>Required during inspection</strong>
          <em>Inspectors must complete this item before closing the checklist.</em>
        </span>
      </label>
    </div>
  )
}

export function AssetClassesPanel({ onChanged }: AssetClassesPanelProps) {
  const [classes, setClasses] = useState<AssetClass[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newClass, setNewClass] = useState(EMPTY_CLASS)
  const [newItem, setNewItem] = useState(EMPTY_ITEM)
  const [savingItem, setSavingItem] = useState(false)
  const [editingClass, setEditingClass] = useState(false)
  const [classDraft, setClassDraft] = useState(EMPTY_CLASS)
  const [savingClass, setSavingClass] = useState(false)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [itemDraft, setItemDraft] = useState<ItemDraft>(EMPTY_ITEM)
  const [savingEditItem, setSavingEditItem] = useState(false)

  const selected = classes.find((entry) => entry.id === selectedId) ?? null
  const requiredCount = selected?.checklist.filter((item) => item.required).length ?? 0

  const refresh = async (preferId?: string | null) => {
    setLoading(true)
    setError(null)
    try {
      const next = await api.getAssetClasses()
      setClasses(next)
      const keep =
        preferId && next.some((entry) => entry.id === preferId)
          ? preferId
          : selectedId && next.some((entry) => entry.id === selectedId)
            ? selectedId
            : (next[0]?.id ?? null)
      setSelectedId(keep)
      const current = next.find((entry) => entry.id === keep)
      if (current) {
        setClassDraft({
          name: current.name,
          description: current.description,
          category: current.category || 'Other',
        })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load asset classes')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    if (!selected) return
    setClassDraft({
      name: selected.name,
      description: selected.description,
      category: selected.category || 'Other',
    })
    setEditingClass(false)
    setEditingItemId(null)
  }, [selected])

  const handleCreateClass = async () => {
    if (!newClass.name.trim()) return
    setCreating(true)
    setError(null)
    try {
      const created = await api.createAssetClass({
        name: newClass.name.trim(),
        description: newClass.description.trim(),
        category: newClass.category.trim(),
      })
      setNewClass(EMPTY_CLASS)
      await refresh(created.id)
      await onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create asset class')
    } finally {
      setCreating(false)
    }
  }

  const handleSaveClass = async () => {
    if (!selected || !classDraft.name.trim()) return
    setSavingClass(true)
    setError(null)
    try {
      await api.updateAssetClass(selected.id, {
        name: classDraft.name.trim(),
        description: classDraft.description.trim(),
        category: classDraft.category.trim(),
      })
      setEditingClass(false)
      await refresh(selected.id)
      await onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update asset class')
    } finally {
      setSavingClass(false)
    }
  }

  const handleDeleteClass = async (classId: string) => {
    if (!window.confirm('Delete this asset class and its checklist? Assets stay, but lose the class link.')) {
      return
    }
    try {
      await api.deleteAssetClass(classId)
      setEditingItemId(null)
      await refresh(null)
      await onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete asset class')
    }
  }

  const handleAddItem = async () => {
    if (!selected || !newItem.label.trim()) return
    setSavingItem(true)
    setError(null)
    try {
      await api.createChecklistItem(selected.id, {
        label: newItem.label.trim(),
        description: newItem.description.trim(),
        required: newItem.required,
        severityHint: newItem.severityHint || null,
      })
      setNewItem(EMPTY_ITEM)
      await refresh(selected.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add checklist item')
    } finally {
      setSavingItem(false)
    }
  }

  const startEditItem = (item: ChecklistItem) => {
    setEditingItemId(item.id)
    setItemDraft(toDraft(item))
  }

  const handleSaveItem = async () => {
    if (!selected || !editingItemId || !itemDraft.label.trim()) return
    setSavingEditItem(true)
    setError(null)
    try {
      await api.updateChecklistItem(selected.id, editingItemId, {
        label: itemDraft.label.trim(),
        description: itemDraft.description.trim(),
        required: itemDraft.required,
        severityHint: itemDraft.severityHint || null,
      })
      setEditingItemId(null)
      await refresh(selected.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update checklist item')
    } finally {
      setSavingEditItem(false)
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    if (!selected) return
    try {
      await api.deleteChecklistItem(selected.id, itemId)
      if (editingItemId === itemId) setEditingItemId(null)
      await refresh(selected.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete checklist item')
    }
  }

  if (loading && classes.length === 0) {
    return (
      <section className="placeholder-panel">
        <p>Loading asset classes…</p>
      </section>
    )
  }

  return (
    <section className="assets-panel asset-classes-page">
      <header className="panel-header">
        <div>
          <h2>Asset Classes</h2>
          <p>
            Define reusable asset types and edit the inspection checklist each class requires in the
            field.
          </p>
        </div>
      </header>

      {error && <p className="asset-classes-error">{error}</p>}

      <div className="asset-classes-layout">
        <aside className="asset-classes-sidebar">
          <div className="asset-classes-sidebar-head">
            <h3>Classes</h3>
            <span>{classes.length}</span>
          </div>

          <ul className="asset-classes-list">
            {classes.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={entry.id === selectedId ? 'active' : undefined}
                  onClick={() => setSelectedId(entry.id)}
                >
                  <strong>{entry.name}</strong>
                  <span>
                    {entry.category || 'Uncategorized'} · {entry.itemCount} item
                    {entry.itemCount === 1 ? '' : 's'} · {entry.assetCount} asset
                    {entry.assetCount === 1 ? '' : 's'}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="asset-class-create">
            <h4>New class</h4>
            <label>
              Name
              <input
                value={newClass.name}
                onChange={(event) => setNewClass((current) => ({ ...current, name: event.target.value }))}
                placeholder="e.g. Substation Transformer"
              />
            </label>
            <label>
              Category
              <select
                value={newClass.category}
                onChange={(event) =>
                  setNewClass((current) => ({ ...current, category: event.target.value }))
                }
              >
                {CATEGORIES.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label>
              Description
              <textarea
                rows={3}
                value={newClass.description}
                onChange={(event) =>
                  setNewClass((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="What this class covers during inspection"
              />
            </label>
            <button
              type="button"
              className="card-btn primary"
              disabled={creating || !newClass.name.trim()}
              onClick={() => void handleCreateClass()}
            >
              <Plus size={15} />
              {creating ? 'Creating…' : 'Create class'}
            </button>
          </div>
        </aside>

        <section className="asset-class-detail">
          {!selected ? (
            <div className="asset-class-empty">
              <CheckSquare size={28} />
              <h3>No asset class selected</h3>
              <p>Create a class or select one to edit its inspection checklist.</p>
            </div>
          ) : (
            <>
              <header className="asset-class-detail-head">
                {editingClass ? (
                  <div className="asset-class-edit-form">
                    <div className="checklist-form-toolbar">
                      <div>
                        <p className="checklist-form-kicker">Edit class</p>
                        <h3>Class details</h3>
                      </div>
                    </div>
                    <div className="checklist-form-row">
                      <label className="checklist-field checklist-field-grow">
                        <span className="checklist-field-label">Name</span>
                        <input
                          value={classDraft.name}
                          onChange={(event) =>
                            setClassDraft((current) => ({ ...current, name: event.target.value }))
                          }
                        />
                      </label>
                      <label className="checklist-field checklist-field-severity">
                        <span className="checklist-field-label">Category</span>
                        <select
                          value={classDraft.category}
                          onChange={(event) =>
                            setClassDraft((current) => ({
                              ...current,
                              category: event.target.value,
                            }))
                          }
                        >
                          {CATEGORIES.map((category) => (
                            <option key={category}>{category}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label className="checklist-field">
                      <span className="checklist-field-label">Description</span>
                      <textarea
                        rows={3}
                        value={classDraft.description}
                        onChange={(event) =>
                          setClassDraft((current) => ({
                            ...current,
                            description: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <div className="checklist-form-actions">
                      <button
                        type="button"
                        className="card-btn primary"
                        disabled={savingClass || !classDraft.name.trim()}
                        onClick={() => void handleSaveClass()}
                      >
                        <Save size={14} />
                        {savingClass ? 'Saving…' : 'Save changes'}
                      </button>
                      <button
                        type="button"
                        className="card-btn"
                        onClick={() => {
                          setEditingClass(false)
                          setClassDraft({
                            name: selected.name,
                            description: selected.description,
                            category: selected.category || 'Other',
                          })
                        }}
                      >
                        <X size={14} />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="asset-class-detail-copy">
                      <p className="asset-class-category">{selected.category || 'Uncategorized'}</p>
                      <h3>{selected.name}</h3>
                      <p>{selected.description || 'No description yet.'}</p>
                      <div className="asset-class-stats">
                        <span>
                          <strong>{selected.checklist.length}</strong> checklist items
                        </span>
                        <span>
                          <strong>{requiredCount}</strong> required
                        </span>
                        <span>
                          <strong>{selected.assetCount}</strong> linked assets
                        </span>
                      </div>
                    </div>
                    <div className="checklist-item-actions">
                      <button
                        type="button"
                        className="card-btn"
                        onClick={() => setEditingClass(true)}
                        title="Edit class"
                      >
                        <Pencil size={14} />
                        Edit class
                      </button>
                      <button
                        type="button"
                        className="card-btn icon"
                        title="Delete class"
                        onClick={() => void handleDeleteClass(selected.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </>
                )}
              </header>

              <div className="checklist-panel">
                <div className="checklist-panel-head">
                  <div>
                    <h4>Inspection checklist</h4>
                    <p>Define the ordered steps inspectors complete for this asset class.</p>
                  </div>
                  <span className="checklist-count-chip">
                    {requiredCount} required · {selected.checklist.length} total
                  </span>
                </div>

                {selected.checklist.length === 0 ? (
                  <p className="checklist-empty">
                    No checklist items yet. Add the first inspection step below.
                  </p>
                ) : (
                  <ol className="checklist-items">
                    {selected.checklist.map((item, index) => {
                      const editing = editingItemId === item.id
                      return (
                        <li key={item.id} className={editing ? 'editing' : undefined}>
                          {editing ? (
                            <div className="checklist-edit-form">
                              <div className="checklist-form-toolbar">
                                <div className="checklist-form-toolbar-left">
                                  <span className="checklist-index">{index + 1}</span>
                                  <div>
                                    <p className="checklist-form-kicker">Editing item</p>
                                    <h5>Update inspection step</h5>
                                  </div>
                                </div>
                              </div>

                              <ChecklistItemFields
                                idPrefix={`edit-${item.id}`}
                                value={itemDraft}
                                onChange={setItemDraft}
                              />

                              <div className="checklist-form-actions">
                                <button
                                  type="button"
                                  className="card-btn primary"
                                  disabled={savingEditItem || !itemDraft.label.trim()}
                                  onClick={() => void handleSaveItem()}
                                >
                                  <Save size={14} />
                                  {savingEditItem ? 'Saving…' : 'Save item'}
                                </button>
                                <button
                                  type="button"
                                  className="card-btn"
                                  onClick={() => setEditingItemId(null)}
                                >
                                  <X size={14} />
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="checklist-item-main">
                                <span className="checklist-index">{index + 1}</span>
                                <div className="checklist-item-body">
                                  <div className="checklist-item-title-row">
                                    <strong>{item.label}</strong>
                                    <div className="checklist-item-tags">
                                      {item.required ? (
                                        <em className="checklist-required">Required</em>
                                      ) : (
                                        <em className="checklist-optional">Optional</em>
                                      )}
                                      {item.severityHint ? (
                                        <span
                                          className={`checklist-severity severity-${String(item.severityHint).toLowerCase()}`}
                                        >
                                          {item.severityHint}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                  {item.description ? (
                                    <p className="checklist-item-guidance">{item.description}</p>
                                  ) : (
                                    <p className="checklist-item-guidance muted">No guidance provided.</p>
                                  )}
                                </div>
                              </div>
                              <div className="checklist-item-actions">
                                <button
                                  type="button"
                                  className="card-btn"
                                  onClick={() => startEditItem(item)}
                                >
                                  <Pencil size={14} />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="card-btn icon"
                                  title="Delete item"
                                  onClick={() => void handleDeleteItem(item.id)}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </>
                          )}
                        </li>
                      )
                    })}
                  </ol>
                )}

                <div className="checklist-add">
                  <div className="checklist-form-toolbar">
                    <div>
                      <p className="checklist-form-kicker">New step</p>
                      <h4>Add checklist item</h4>
                    </div>
                  </div>

                  <ChecklistItemFields
                    idPrefix="new-item"
                    value={newItem}
                    onChange={setNewItem}
                  />

                  <div className="checklist-form-actions">
                    <button
                      type="button"
                      className="card-btn primary"
                      disabled={savingItem || !newItem.label.trim()}
                      onClick={() => void handleAddItem()}
                    >
                      <Plus size={15} />
                      {savingItem ? 'Adding…' : 'Add item'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  )
}
