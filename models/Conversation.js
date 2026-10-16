// Shopfluence – Conversation (company/manager <-> salesman chat, scoped to one company)
const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema(
  {
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    participants: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      validate: [(v) => v.length === 2, 'A conversation has exactly two participants'],
    },
    participantKey: { type: String, required: true }, // sorted "idA:idB"
    lastMessage: { type: String, maxlength: 2000 },
    lastMessageAt: { type: Date, default: Date.now },
    lastSender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

conversationSchema.index({ company: 1, participantKey: 1 }, { unique: true });
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

conversationSchema.statics.keyFor = (a, b) => [String(a), String(b)].sort().join(':');

conversationSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Conversation', conversationSchema);
