const WaLinkProvider = require('./WaLinkProvider')
const WhatsappCloudProvider = require('./WhatsappCloudProvider')

/**
 * @typedef {Object} ReminderMessage
 * @property {string} text    Fully-rendered message (used by wa_link).
 * @property {Object} params  Structured variables (used by template channels):
 *                            { name, periodLabel, tasksText }.
 *
 * @typedef {Object} ReminderResult
 * @property {'queued'|'sent'|'failed'} status
 * @property {string|null} providerMessageId
 * @property {string|null} error
 * @property {string} [link]  wa.me link (wa_link only).
 *
 * @typedef {Object} ReminderChannel
 * @property {string} name
 * @property {(member: Object, message: ReminderMessage) => Promise<ReminderResult>} send
 */

// Resolve a ReminderChannel by provider name. Kept generic so SMS / email /
// GoHighLevel can be added later without touching reminderService.
const channelFor = (providerName) => {
  switch (providerName) {
    case 'wa_link':
    case undefined:
      return new WaLinkProvider()
    case 'whatsapp_cloud':
      return new WhatsappCloudProvider()
    default:
      throw new Error(`Reminder provider '${providerName}' not implemented`)
  }
}

module.exports = { channelFor }
