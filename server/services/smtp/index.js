const NodemailerProvider = require('./NodemailerProvider')

/**
 * @typedef {Object} MailPayload
 * @property {string} to
 * @property {string} subject
 * @property {string} text
 * @property {string} [html]
 * @property {string} fromName
 * @property {string} fromEmail
 *
 * @typedef {Object} EmailProvider
 * @property {(mail: MailPayload) => Promise<Object>} send  Sends one email, resolves with the transport info.
 * @property {() => Promise<true>} verify  Verifies the connection, resolves true.
 */

/**
 * Resolve an EmailProvider for a mailbox based on its `provider` field.
 * @param {Object} mailbox
 * @returns {EmailProvider}
 */
const providerFor = (mailbox) => {
  switch (mailbox.provider) {
    case 'smtp':
    case undefined:
      return new NodemailerProvider(mailbox)
    default:
      throw new Error(
        `Provider '${mailbox.provider}' not implemented yet`,
      )
  }
}

module.exports = { providerFor }
