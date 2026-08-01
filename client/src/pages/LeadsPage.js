import React, { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'

// Elapsed m:ss for the long-running Google Maps fetch loading indicator.
const fmtElapsed = (s) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export default function LeadsPage() {
  const {
    lists,
    openList,
    listLeads,
    selectedLeadIds,
    leadSearch,
    setLeadSearch,
    leadStatusFilter,
    addLeadOpen,
    setAddLeadOpen,
    addLeadBusy,
    addLeadForm,
    setAddLeadForm,
    regenBusy,
    newListForm,
    setNewListForm,
    assignTarget,
    setAssignTarget,
    importBusy,
    importSummary,
    sheetImport,
    setSheetImport,
    mapsImport,
    setMapsImport,
    mapsBusy,
    fetchLists,
    fetchListLeads,
    openListView,
    submitLeadSearch,
    changeStatusFilter,
    addLead,
    closeListView,
    createList,
    deleteList,
    toggleLeadSelected,
    allPageSelected,
    toggleSelectPage,
    selectAllInList,
    clearSelection,
    assignSelected,
    importCsv,
    importSheet,
    importMaps,
    openLeadEmail,
    regenerateListIntros,
    deleteLead,
    resendLead,
    markListLead,
  } = useApp()

  // Tick an elapsed counter while the Google Maps fetch runs so the loading card
  // proves it's still working (the actor call can take a minute or two).
  const [mapsElapsed, setMapsElapsed] = useState(0)
  useEffect(() => {
    if (!mapsBusy) return
    setMapsElapsed(0)
    const id = setInterval(() => setMapsElapsed((s) => s + 1), 1000)
    return () => clearInterval(id)
  }, [mapsBusy])

  // Rough stage narration driven by elapsed time (the request is a single call
  // with no server-side progress, so this reassures rather than reports exactly).
  const mapsStage =
    mapsElapsed < 8
      ? 'Searching Google Maps for matching businesses…'
      : mapsElapsed < 45
        ? 'Visiting each business website to find a public email…'
        : 'Almost done — filtering and saving leads…'

  return (
    <>
        {/* ── LISTS TAB (T-017) ── */}
        {!openList && (
          <div className='tab-content'>
            <div className='page-header'>
              <h1>Lists</h1>
              <p>Group leads into lists to target with campaigns</p>
            </div>

            {/* New list */}
            <div className='card'>
              <h2>New List</h2>
              <form onSubmit={createList}>
                <div className='settings-fields-grid'>
                  <div className='control-group'>
                    <label>Name</label>
                    <input
                      type='text'
                      value={newListForm.name}
                      onChange={(e) =>
                        setNewListForm((f) => ({ ...f, name: e.target.value }))
                      }
                      placeholder='Q3 SaaS founders'
                      required
                    />
                  </div>
                  <div className='control-group'>
                    <label>Description (optional)</label>
                    <input
                      type='text'
                      value={newListForm.description}
                      onChange={(e) =>
                        setNewListForm((f) => ({
                          ...f,
                          description: e.target.value,
                        }))
                      }
                      placeholder='Imported from Apollo export'
                    />
                  </div>
                </div>
                <div style={{ marginTop: '1.25rem' }}>
                  <button
                    className='btn-start'
                    type='submit'
                    disabled={!newListForm.name.trim()}
                  >
                    + Create List
                  </button>
                </div>
              </form>
            </div>

            {/* Lists table */}
            <div className='card table-card'>
              <div
                className='bulk-actions'
                style={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <h2 style={{ margin: 0 }}>Your Lists</h2>
                <button className='btn-ghost' onClick={fetchLists}>
                  ↻ Refresh
                </button>
              </div>
              <div className='table-wrapper'>
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Source</th>
                      <th>Leads</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lists.map((l) => (
                      <tr key={l._id}>
                        <td>{l.name}</td>
                        <td>
                          <span className='status-badge'>
                            {l.source || 'manual'}
                          </span>
                        </td>
                        <td>{l.leadCount}</td>
                        <td>
                          {l.createdAt
                            ? new Date(l.createdAt).toLocaleDateString()
                            : '—'}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              className='btn-ghost'
                              onClick={() => openListView(l)}
                            >
                              Open
                            </button>
                            <button
                              className='btn-stop'
                              onClick={() => deleteList(l)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── LIST DETAIL (T-017) ── */}
        {openList && (
          <div className='tab-content'>
            <div className='page-header'>
              <button className='btn-ghost' onClick={closeListView}>
                ← Back
              </button>
              <h1>{openList.name}</h1>
              <p>
                <strong>{listLeads.total}</strong> lead
                {listLeads.total === 1 ? '' : 's'} total ·{' '}
                {listLeads.items.length} shown on this page
              </p>
              <button
                className='btn-ghost'
                onClick={() => regenerateListIntros(false)}
                disabled={regenBusy}
              >
                {regenBusy ? 'Regenerating…' : '↻ Regenerate all intros'}
              </button>
            </div>

            {/* Import controls — real lists only */}
            {openList._id !== 'unassigned' && (
              <div className='card'>
                <h2>Import Leads</h2>
                <div className='settings-fields-grid'>
                  <div className='control-group'>
                    <label>Upload CSV</label>
                    <input
                      type='file'
                      accept='.csv,text/csv'
                      disabled={importBusy}
                      onChange={(e) => {
                        importCsv(e.target.files[0])
                        e.target.value = ''
                      }}
                    />
                    <span className='field-note'>
                      Needs an email column; other columns (first name, last
                      name, company, website…) are mapped automatically.
                    </span>
                  </div>
                  <div className='control-group'>
                    <label>Google Sheet ID (optional)</label>
                    <input
                      type='text'
                      value={sheetImport.sheetId}
                      onChange={(e) =>
                        setSheetImport((s) => ({
                          ...s,
                          sheetId: e.target.value,
                        }))
                      }
                      placeholder='defaults to configured sheet'
                    />
                  </div>
                  <div className='control-group'>
                    <label>Tab name (optional)</label>
                    <input
                      type='text'
                      value={sheetImport.tab}
                      onChange={(e) =>
                        setSheetImport((s) => ({ ...s, tab: e.target.value }))
                      }
                      placeholder='Sheet1'
                    />
                  </div>
                  <div className='control-group'>
                    <label>&nbsp;</label>
                    <button
                      className='btn-start'
                      type='button'
                      disabled={importBusy}
                      onClick={importSheet}
                    >
                      {importBusy ? 'Importing…' : 'Import Sheet'}
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    borderTop: '1px solid var(--border)',
                    margin: '1rem 0 0.75rem',
                  }}
                />
                <h3 style={{ margin: '0 0 0.25rem' }}>
                  Fetch from Google Maps
                </h3>
                <p className='field-note' style={{ marginTop: 0 }}>
                  Searches Google Maps and imports only businesses whose website
                  lists a public email. This runs a live scrape and can take a
                  minute or two.
                </p>
                <div className='settings-fields-grid'>
                  <div className='control-group'>
                    <label>Search query</label>
                    <input
                      type='text'
                      value={mapsImport.query}
                      disabled={importBusy}
                      onChange={(e) =>
                        setMapsImport((m) => ({ ...m, query: e.target.value }))
                      }
                      placeholder='e.g. restaurants in Riyadh'
                    />
                  </div>
                  <div className='control-group'>
                    <label>Max places</label>
                    <input
                      type='number'
                      min='1'
                      max='120'
                      value={mapsImport.maxResults}
                      disabled={importBusy}
                      onChange={(e) =>
                        setMapsImport((m) => ({
                          ...m,
                          maxResults: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className='control-group'>
                    <label>&nbsp;</label>
                    <button
                      className='btn-start'
                      type='button'
                      disabled={importBusy}
                      onClick={importMaps}
                    >
                      {mapsBusy ? 'Fetching…' : 'Fetch Leads'}
                    </button>
                  </div>
                  <div className='control-group full-width'>
                    <label className='checkbox-row'>
                      <input
                        type='checkbox'
                        checked={mapsImport.skipRoleBased}
                        disabled={importBusy}
                        onChange={(e) =>
                          setMapsImport((m) => ({
                            ...m,
                            skipRoleBased: e.target.checked,
                          }))
                        }
                      />
                      Skip generic inboxes (info@, contact@, sales@…) — keep only
                      personal/named emails
                    </label>
                    <span className='field-note'>
                      Recommended for 1:1 outreach. Turn off if a search returns
                      too few leads (many small businesses only list a generic
                      inbox).
                    </span>
                  </div>
                </div>

                {/* Long-running fetch: show a live loading card so it's clear
                    something is happening (not stuck). */}
                {mapsBusy && (
                  <div
                    className='card loading-card'
                    style={{ marginTop: '0.75rem' }}
                  >
                    <div className='spinner' />
                    <p style={{ margin: '0.5rem 0 0.25rem' }}>{mapsStage}</p>
                    <span className='field-note'>
                      Elapsed {fmtElapsed(mapsElapsed)} · usually 1–2 minutes.
                      Keep this tab open.
                    </span>
                  </div>
                )}

                {importSummary && !mapsBusy && (
                  <p style={{ marginTop: '0.75rem', color: 'var(--muted)' }}>
                    {importSummary.foundPlaces != null && (
                      <>
                        Found {importSummary.foundPlaces} places ·{' '}
                        {importSummary.withEmail} with a usable email ·{' '}
                        {importSummary.roleBasedSkipped > 0 && (
                          <>
                            {importSummary.roleBasedSkipped} generic inboxes
                            skipped ·{' '}
                          </>
                        )}
                      </>
                    )}
                    Inserted {importSummary.inserted} · Updated{' '}
                    {importSummary.updated} · Skipped {importSummary.skipped}
                  </p>
                )}
              </div>
            )}

            {/* Assign controls */}
            <div className='card'>
              <div className='bulk-actions' style={{ alignItems: 'center' }}>
                <span className='field-note'>
                  {selectedLeadIds.size} of {listLeads.total} selected
                </span>
                <button
                  className='btn-ghost'
                  onClick={selectAllInList}
                  disabled={
                    listLeads.total === 0 ||
                    selectedLeadIds.size === listLeads.total
                  }
                >
                  Select all {listLeads.total}
                </button>
                <button
                  className='btn-ghost'
                  onClick={clearSelection}
                  disabled={selectedLeadIds.size === 0}
                >
                  Clear
                </button>
                <span className='field-note'>Assign selected to</span>
                <select
                  value={assignTarget}
                  onChange={(e) => setAssignTarget(e.target.value)}
                >
                  <option value=''>Select a list…</option>
                  {lists
                    .filter((l) => l._id !== openList._id)
                    .map((l) => (
                      <option key={l._id} value={l._id}>
                        {l.name}
                      </option>
                    ))}
                </select>
                <button
                  className='btn-start'
                  onClick={assignSelected}
                  disabled={!assignTarget || selectedLeadIds.size === 0}
                >
                  Assign
                </button>
                <button
                  className='btn-ghost'
                  onClick={() => regenerateListIntros(true)}
                  disabled={selectedLeadIds.size === 0 || regenBusy}
                >
                  {regenBusy
                    ? 'Regenerating…'
                    : `↻ Regenerate selected (${selectedLeadIds.size})`}
                </button>
              </div>
            </div>

            {/* Lead status legend */}
            <div className='card legend-card'>
              <div className='legend-statuses'>
                <span>
                  <span className='status-badge badge-new'>new</span> not yet
                  emailed
                </span>
                <span>
                  <span className='status-badge badge-queued'>queued</span>{' '}
                  waiting in the send queue
                </span>
                <span>
                  <span className='status-badge badge-contacted'>
                    contacted
                  </span>{' '}
                  email sent
                </span>
                <span>
                  <span className='status-badge badge-replied'>replied</span>{' '}
                  they responded (sequence stops)
                </span>
                <span>
                  <span className='status-badge badge-bounced'>bounced</span>{' '}
                  address rejected it
                </span>
                <span>
                  <span className='status-badge badge-unsubscribed'>
                    unsubscribed
                  </span>{' '}
                  opted out
                </span>
                <span>
                  <span className='status-badge badge-failed'>failed</span>{' '}
                  invalid / couldn't send
                </span>
              </div>
            </div>

            {/* Leads table */}
            <div className='card table-card'>
              {/* Search + Add Lead — directly above the table */}
              <div
                style={{
                  display: 'flex',
                  gap: '0.75rem',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '1rem',
                  flexWrap: 'wrap',
                }}
              >
                <form
                  onSubmit={submitLeadSearch}
                  style={{
                    display: 'flex',
                    gap: '0.5rem',
                    alignItems: 'center',
                    flex: 1,
                    maxWidth: 460,
                  }}
                >
                  <input
                    type='text'
                    placeholder='Search name, email, or company…'
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <button className='btn-ghost' type='submit'>
                    Search
                  </button>
                  {leadSearch && (
                    <button
                      className='btn-ghost'
                      type='button'
                      onClick={() => {
                        setLeadSearch('')
                        fetchListLeads(openList._id, 1, '', leadStatusFilter)
                      }}
                    >
                      Clear
                    </button>
                  )}
                </form>
                <div
                  style={{
                    display: 'flex',
                    gap: '0.75rem',
                    alignItems: 'center',
                  }}
                >
                  <select
                    value={leadStatusFilter}
                    onChange={(e) => changeStatusFilter(e.target.value)}
                    title='Filter by status'
                  >
                    <option value=''>All statuses</option>
                    <option value='new'>New</option>
                    <option value='queued'>Queued</option>
                    <option value='contacted'>Contacted</option>
                    <option value='replied'>Replied</option>
                    <option value='bounced'>Bounced</option>
                    <option value='unsubscribed'>Unsubscribed</option>
                    <option value='failed'>Failed</option>
                  </select>
                  <button
                    className='btn-start'
                    onClick={() => setAddLeadOpen((v) => !v)}
                  >
                    {addLeadOpen ? '× Cancel' : '+ Add Lead'}
                  </button>
                </div>
              </div>

              {/* Add-lead form */}
              {addLeadOpen && (
                <form
                  onSubmit={addLead}
                  style={{
                    marginBottom: '1rem',
                    paddingBottom: '1rem',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <div className='settings-fields-grid'>
                    <div className='control-group'>
                      <label>First name</label>
                      <input
                        value={addLeadForm.firstName}
                        onChange={(e) =>
                          setAddLeadForm((s) => ({
                            ...s,
                            firstName: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className='control-group'>
                      <label>Last name</label>
                      <input
                        value={addLeadForm.lastName}
                        onChange={(e) =>
                          setAddLeadForm((s) => ({
                            ...s,
                            lastName: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className='control-group'>
                      <label>Email *</label>
                      <input
                        type='email'
                        value={addLeadForm.email}
                        onChange={(e) =>
                          setAddLeadForm((s) => ({
                            ...s,
                            email: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className='control-group'>
                      <label>Company</label>
                      <input
                        value={addLeadForm.company}
                        onChange={(e) =>
                          setAddLeadForm((s) => ({
                            ...s,
                            company: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className='control-group'>
                      <label>Title</label>
                      <input
                        value={addLeadForm.title}
                        onChange={(e) =>
                          setAddLeadForm((s) => ({
                            ...s,
                            title: e.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className='control-group'>
                      <label>Website</label>
                      <input
                        value={addLeadForm.website}
                        onChange={(e) =>
                          setAddLeadForm((s) => ({
                            ...s,
                            website: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div style={{ marginTop: '0.9rem' }}>
                    <button
                      className='btn-start'
                      type='submit'
                      disabled={addLeadBusy}
                    >
                      {addLeadBusy ? 'Adding…' : 'Add Lead'}
                    </button>
                  </div>
                </form>
              )}

              {listLeads.items.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
                  {leadSearch || leadStatusFilter
                    ? 'No leads match your filters.'
                    : 'No leads in this list yet — use “+ Add Lead” or import a CSV.'}
                </p>
              ) : (
                <div className='table-wrapper'>
                  <table>
                    <thead>
                      <tr>
                        <th>
                          <input
                            type='checkbox'
                            checked={allPageSelected}
                            onChange={toggleSelectPage}
                            title='Select all on this page'
                          />
                        </th>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Company</th>
                        <th>Website</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listLeads.items.map((lead) => (
                        <tr key={lead._id}>
                          <td>
                            <input
                              type='checkbox'
                              checked={selectedLeadIds.has(lead._id)}
                              onChange={() => toggleLeadSelected(lead._id)}
                            />
                          </td>
                          <td>
                            {[lead.firstName, lead.lastName]
                              .filter(Boolean)
                              .join(' ') || '—'}
                          </td>
                          <td className='td-email'>{lead.email}</td>
                          <td>{lead.company || '—'}</td>
                          <td>
                            {lead.website ? (
                              <a
                                href={lead.website}
                                target='_blank'
                                rel='noreferrer'
                                className='link'
                              >
                                {lead.website
                                  .replace(/https?:\/\//, '')
                                  .slice(0, 25)}
                              </a>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            <span
                              className={`status-badge badge-${lead.status}`}
                            >
                              {lead.status}
                            </span>
                          </td>
                          <td>
                            <div
                              style={{
                                display: 'flex',
                                gap: '0.4rem',
                                flexWrap: 'wrap',
                              }}
                            >
                              <button
                                className='btn-preview'
                                onClick={() => openLeadEmail(lead)}
                              >
                                Email
                              </button>
                              <button
                                className='btn-ghost'
                                onClick={() =>
                                  markListLead(lead._id, 'replied')
                                }
                              >
                                Mark replied
                              </button>
                              <button
                                className='btn-ghost'
                                onClick={() =>
                                  markListLead(lead._id, 'bounced')
                                }
                              >
                                Mark bounced
                              </button>
                              {[
                                'contacted',
                                'replied',
                                'bounced',
                                'failed',
                              ].includes(lead.status) && (
                                <button
                                  className='btn-ghost'
                                  onClick={() => resendLead(lead)}
                                >
                                  Resend
                                </button>
                              )}
                              <button
                                className='btn-stop'
                                onClick={() => deleteLead(lead)}
                              >
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className='queue-pagination'>
                <button
                  className='btn-ghost'
                  disabled={listLeads.page <= 1}
                  onClick={() =>
                    fetchListLeads(openList._id, listLeads.page - 1)
                  }
                >
                  ← Prev
                </button>
                <span className='queue-page-label'>
                  Page {listLeads.page} of {listLeads.pages}
                </span>
                <button
                  className='btn-ghost'
                  disabled={listLeads.page >= listLeads.pages}
                  onClick={() =>
                    fetchListLeads(openList._id, listLeads.page + 1)
                  }
                >
                  Next →
                </button>
              </div>
            </div>
          </div>
        )}
    </>
  )
}
