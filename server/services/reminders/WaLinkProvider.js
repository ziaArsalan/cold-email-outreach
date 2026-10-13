// Default, zero-setup reminder channel. It can't actually deliver on its own —
// WhatsApp click-to-chat needs a human click — so `send` just builds the
// prefilled wa.me link and returns status 'queued'. The UI renders a send queue
// of these links; the admin clicks each (WhatsApp opens prefilled) then hits
// "Mark sent", which is what finally records delivery (reminderService.markSent).
class WaLinkProvider {
  constructor() {
    this.name = 'wa_link'
  }

  // message = { text, params }. Only `text` is used here.
  async send(member, message) {
    const text = (message && message.text) || ''
    const digits = String(member.phone || '').replace(/\D/g, '')
    if (!digits) {
      return { status: 'failed', providerMessageId: null, error: 'member has no phone' }
    }
    const link = `https://wa.me/${digits}?text=${encodeURIComponent(text)}`
    return { status: 'queued', providerMessageId: null, error: null, link }
  }
}

module.exports = WaLinkProvider
