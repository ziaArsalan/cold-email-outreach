import React, { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { substitute, SAMPLE_VARS } from '../utils'
import { useApp } from '../context/AppContext'

// New / edit template form — a nested route (/templates/new, /templates/:id/edit)
// off the Templates list. Loads the target template into the shared form state on
// an edit route, or a blank form on the new route. Saving returns to the list.
export default function TemplateForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    templates,
    templateForm,
    setTemplateForm,
    templateBusy,
    openNewTemplateForm,
    openEditTemplateForm,
    closeTemplateForm,
    saveTemplate,
  } = useApp()

  // Sync form state to the route. `templates` is loaded by the route-driven fetch
  // in AppContext, so on a hard refresh we wait for the matching one to arrive.
  useEffect(() => {
    if (id) {
      if (templateForm && templateForm._id === id) return
      const t = templates.find((x) => x._id === id)
      if (t) openEditTemplateForm(t)
    } else {
      openNewTemplateForm()
    }
  }, [id, templates])

  const isEdit = !!id
  // On an edit route, wait until the template is loaded into the form.
  const notReady = !templateForm || (isEdit && templateForm._id !== id)

  const onSubmit = async (e) => {
    const ok = await saveTemplate(e)
    if (ok) navigate('/templates')
  }

  const onCancel = () => {
    closeTemplateForm()
    navigate('/templates')
  }

  return (
    <div className='tab-content'>
      <div className='page-header'>
        <button className='btn-ghost' onClick={onCancel}>
          ← Back to Templates
        </button>
        <h1>{isEdit ? 'Edit Template' : 'New Template'}</h1>
        <p>Reusable email templates with {'{{variable}}'} substitution</p>
      </div>

      {notReady ? (
        <div className='card loading-card'>
          <div className='spinner' />
          <p>Loading template…</p>
        </div>
      ) : (
        <form
          onSubmit={onSubmit}
          className='card'
          style={{ background: 'var(--bg-alt)' }}
        >
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
          </div>

          <div
            style={{
              marginTop: '1rem',
              display: 'flex',
              gap: '0.5rem',
            }}
          >
            <button className='btn-start' type='submit' disabled={templateBusy}>
              {templateBusy
                ? 'Saving…'
                : isEdit
                  ? 'Save Changes'
                  : '+ Create Template'}
            </button>
            <button
              className='btn-ghost'
              type='button'
              onClick={onCancel}
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
