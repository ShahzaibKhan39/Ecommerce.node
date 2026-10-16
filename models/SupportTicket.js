// Shopfluence – SupportTicket model (support portal)
const mongoose = require('mongoose');

const replySchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    authorRole: { type: String, required: true },
    message: { type: String, required: true, trim: true, maxlength: 3000 },
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const ticketSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['problem', 'feedback'], required: true },
    subject: { type: String, required: [true, 'Subject is required'], trim: true, minlength: 3, maxlength: 150 },
    message: { type: String, required: [true, 'Message is required'], trim: true, minlength: 3, maxlength: 4000 },
    status: { type: String, enum: ['open', 'in_progress', 'resolved', 'closed'], default: 'open', index: true },
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal', index: true },
    raisedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    raisedByRole: { type: String, enum: ['buyer', 'company', 'manager', 'salesman'], required: true, index: true },
    replies: { type: [replySchema], default: [] },
  },
  { timestamps: true }
);

ticketSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('SupportTicket', ticketSchema);
