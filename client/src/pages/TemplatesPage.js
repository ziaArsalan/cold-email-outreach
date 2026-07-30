import React from 'react'
import { substitute, SAMPLE_VARS } from '../utils'
import { useApp } from '../context/AppContext'

export default function TemplatesPage() {
  const {
    templates,
    templateForm,
    setTemplateForm,
    templateBusy,
    fetchTemplates,
    openNewTemplateForm,
    openEditTemplateForm,
    closeTemplateForm,
    saveTemplate,
    deleteTemplate,
    openTemplateTest,
  } = useApp()

  return (
          <div className='tab-content'>
            <div className='page-header'>
              <h1>Templates</h1>
              <p>Reusable email templates with {'{{variable}}'} substitution</p>
            </div>

            <div className='card table-card'>
              <div
                className='bulk-actions'
                style={{
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <h2 style={{ margin: 0 }}>Your Templates</h2>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className='btn-ghost' onClick={fetchTemplates}>
                    ↻ Refresh
                  </button>
                  <button className='btn-start' onClick={openNewTemplateForm}>
                    + New Template
                  </button>
                </div>
              </div>
              {templates.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '13px' }}>
                  No templates yet.
                </p>
              ) : (
                <div className='table-wrapper'>
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Subject</th>
                        <th>Status</th>
                        <th>Updated</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {templates.map((t) => (
                        <tr key={t._id}>
                          <td>{t.name}</td>
                          <td
                            style={{
                              maxWidth: '280px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={t.subject}
                          >
                            {t.subject}
                          </td>
                          <td>
                            <span
                              className={`status-badge ${
                                t.active !== false
                                  ? 'health-healthy'
                                  : 'health-paused'
                              }`}
                            >
                              {t.active !== false ? 'active' : 'inactive'}
                            </span>
                          </td>
                          <td>
                            {t.updatedAt
                              ? new Date(t.updatedAt).toLocaleDateString()
                              : '—'}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.4rem' }}>
                              <button
                                className='btn-preview'
                                onClick={() => openTemplateTest(t)}
                              >
                                Test
                              </button>
                              <button
                                className='btn-ghost'
                                onClick={() => openEditTemplateForm(t)}
                              >
                                Edit
                              </button>
                              <button
                                className='btn-stop'
                                onClick={() => deleteTemplate(t)}
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
            </div>

            {templateForm && (
              <form
                onSubmit={saveTemplate}
                className='card'
                style={{ background: 'var(--bg-alt)' }}
              >
                <h3 style={{ marginTop: 0 }}>
                  {templateForm._id ? 'Edit Template' : 'New Template'}
                </h3>
                <div className='settings-fields-grid'>
                  <div className='control-group'>
                    <label>Name</label>
                    <input
                      value={templateForm.name}
                      onChange={(e) =>
                        setTemplateForm((f) => ({ ...f, name: e.target.value }))
                      }
                      placeholder='Default'
                      required
                    />
                  </div>
                  <div className='control-group'>
                    <label>Subject</label>
                    <input
                      value={templateForm.subject}
                      onChange={(e) =>
                        setTemplateForm((f) => ({
                          ...f,
                          subject: e.target.value,
                        }))
                      }
                      placeholder='Quick question, {{first_name}}'
                      required
                    />
                  </div>
                  <div className='control-group full-width'>
                    <label>Body</label>
                    <textarea
                      rows={8}
                      value={templateForm.body}
                      onChange={(e) =>
                        setTemplateForm((f) => ({ ...f, body: e.target.value }))
                      }
                      required
                    />
                    <span className='field-note'>
                      {
                        'Variables: {{first_name}} {{last_name}} {{company}} {{industry}} {{website}} {{ai_intro}}'
                      }
                    </span>
                  </div>
                  <div className='control-group full-width'>
                    <label>Signature</label>
                    <textarea
                      rows={3}
                      value={templateForm.signature}
                      onChange={(e) =>
                        setTemplateForm((f) => ({
                          ...f,
                          signature: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className='control-group'>
                    <label>
                      <input
                        type='checkbox'
                        checked={templateForm.active}
                        onChange={(e) =>
                          setTemplateForm((f) => ({
                            ...f,
                            active: e.target.checked,
                          }))
                        }
                      />{' '}
                      Active
                    </label>
                  </div>
                </div>

                <div
                  className='card'
                  style={{ background: 'var(--bg-alt)', marginTop: '1rem' }}
                >
                  <h4 style={{ marginTop: 0 }}>Live Preview</h4>
                  <p style={{ margin: '0 0 0.5rem' }}>
                    <strong>Subject:</strong>{' '}
                    {substitute(templateForm.subject, SAMPLE_VARS)}
                  </p>
                  <div style={{ whiteSpace: 'pre-wrap' }}>
                    {substitute(templateForm.body, SAMPLE_VARS)}
                  </div>
                  {templateForm.signature && (
                    <div
                      style={{ whiteSpace: 'pre-wrap', marginTop: '0.75rem' }}
                    >
                      {substitute(templateForm.signature, SAMPLE_VARS)}
                    </div>
                  )}
                </div>

                <div
                  style={{
                    marginTop: '1rem',
                    display: 'flex',
                    gap: '0.5rem',
                  }}
                >
                  <button
                    className='btn-start'
                    type='submit'
                    disabled={templateBusy}
                  >
                    {templateBusy
                      ? 'Saving…'
                      : templateForm._id
                        ? 'Save Changes'
                        : '+ Create Template'}
                  </button>
                  <button
                    className='btn-ghost'
                    type='button'
                    onClick={closeTemplateForm}
                    disabled={templateBusy}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
  )
}
