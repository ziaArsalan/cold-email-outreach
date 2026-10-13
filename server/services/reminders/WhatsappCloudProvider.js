const axios = require('axios')
const config = require('../../config')

// WhatsApp Business Cloud API (Meta). Business-initiated messages outside the
// 24-hour customer-service window MUST use an approved template, so this
// provider ALWAYS sends a template message and passes the name + pending-task
// list as body variables — it never sends free-form text that bypasses the
// approved template. Template name/language and all secrets come from env/config.
//
// `message.params` supplies the two body variables:
//   {{1}} = member name, {{2}} = the pending-task list text
// Your approved template body must therefore read something like:
//   "Hi {{1}}, quick reminder. Still pending: {{2}}. Reply DONE once completed."
class WhatsappCloudProvider {
  constructor() {
    this.name = 'whatsapp_cloud'
    const c = config.followups.whatsappCloud
    this.token = c.token
    this.phoneNumberId = c.phoneNumberId
    this.templateName = c.templateName
    this.templateLang = c.templateLang
    this.graphVersion = c.graphVersion
  }

  async send(member, message) {
    const to = String(member.phone || '').replace(/\D/g, '')
    if (!to) return { status: 'failed', providerMessageId: null, error: 'member has no phone' }
    if (!this.token || !this.phoneNumberId || !this.templateName) {
      return {
        status: 'failed',
        providerMessageId: null,
        error:
          'whatsapp_cloud not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_TEMPLATE_NAME)',
      }
    }

    const params = (message && message.params) || {}
    const bodyVars = [params.name || member.name || '', params.tasksText || '']

    const url = `https://graph.facebook.com/${this.graphVersion}/${this.phoneNumberId}/messages`
    const payload = {
      messaging_product: 'whatsapp',
      to,
      type: 'template',
      template: {
        name: this.templateName,
        language: { code: this.templateLang },
        components: [
          {
            type: 'body',
            parameters: bodyVars.map((t) => ({ type: 'text', text: String(t) })),
          },
        ],
      },
    }

    try {
      const res = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${this.token}` },
        timeout: 15000,
      })
      const id =
        res.data && res.data.messages && res.data.messages[0] && res.data.messages[0].id
      return { status: 'sent', providerMessageId: id || null, error: null }
    } catch (err) {
      // Normalize the Graph API error so one member's failure is logged, not thrown.
      const apiErr =
        (err.response && err.response.data && err.response.data.error && err.response.data.error.message) ||
        err.message
      return { status: 'failed', providerMessageId: null, error: apiErr }
    }
  }
}

module.exports = WhatsappCloudProvider
