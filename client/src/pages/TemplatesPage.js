import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'

export default function TemplatesPage() {
  const navigate = useNavigate()
  const {
    templates,
    fetchTemplates,
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
                  <button
                    className='btn-start'
                    onClick={() => navigate('/templates/new')}
                  >
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
                                onClick={() =>
                                  navigate(`/templates/${t._id}/edit`)
                                }
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
          </div>
  )
}
