const Lead = require('./Lead')
const List = require('./List')
const Mailbox = require('./Mailbox')
const Template = require('./Template')
const Campaign = require('./Campaign')
const QueuedEmail = require('./QueuedEmail')
const SendLog = require('./SendLog')
const OutreachSetting = require('./OutreachSetting')
const Reply = require('./Reply')
// ── Bid Analytics module (Upwork proposal tracking) ──
const Proposal = require('./Proposal')
const ServiceLane = require('./ServiceLane')
const ConnectsTransaction = require('./ConnectsTransaction')
const Budget = require('./Budget')
const BidTemplate = require('./BidTemplate')
const ProfileVariant = require('./ProfileVariant')
const BidAuditLog = require('./BidAuditLog')

module.exports = {
  Lead,
  List,
  Mailbox,
  Template,
  Campaign,
  QueuedEmail,
  SendLog,
  OutreachSetting,
  Reply,
  Proposal,
  ServiceLane,
  ConnectsTransaction,
  Budget,
  BidTemplate,
  ProfileVariant,
  BidAuditLog,
}
