import React from 'react'
import { useApp } from '../context/AppContext'
import { statusColor, EMAIL_SIGNATURE } from '../utils'

export default function PreviewPage() {
  const { previewLead, preview, previewLoading, sendEmail, setTab } = useApp()

  return (
          <div className='tab-content'>
            <div className='page-header'>
              <button className='btn-ghost' onClick={() => setTab('leads')}>
                ← Back to Leads
              </button>
              <h1>Email Preview</h1>
              {previewLead && (
                <p>
                  For {previewLead.name} at {previewLead.business}
                  <br />
                  {previewLead.email}
                </p>
              )}
            </div>
            {previewLoading && (
              <div className='card loading-card'>
                <div className='spinner' />
                <p>
                  {previewLead?.generatedEmail
                    ? 'Loading saved email...'
                    : `AI is researching ${previewLead?.website} and crafting your email...`}
                </p>
              </div>
            )}
            {preview && !previewLoading && (
              <div className='card preview-card'>
                <div className='preview-status'>
                  <label>Status</label>
                  <span
                    className={`status-badge ${statusColor(previewLead?.status)}`}
                  >
                    {previewLead?.status || 'Pending'}
                  </span>
                </div>
                <div className='preview-subject'>
                  <label>
                    Subject
                    {preview.cached && (
                      <span className='badge-cached'>
                        Cached — no tokens used
                      </span>
                    )}
                    {!preview.cached && (
                      <span className='badge-fresh'>
                        Freshly generated + saved
                      </span>
                    )}
                  </label>
                  <p>{preview.subject}</p>
                </div>
                <div className='preview-body'>
                  <label>Email Body</label>
                  <pre>
                    {preview.body}
                    {EMAIL_SIGNATURE}
                  </pre>
                </div>
                {/* {previewLead?.status !== 'Emailed' && ( */}
                <div className='preview-actions'>
                  <button className='btn-start' onClick={sendEmail}>
                    ✉ Send Email
                  </button>
                </div>
                {/* )} */}
              </div>
            )}
          </div>
  )
}
