// Shopfluence – hiring Application (pending -> interview_scheduled -> approved/rejected)
const mongoose = require('mongoose');

const applicationSchema = new mongoose.Schema(
  {
    applicant: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    type: { type: String, enum: ['manager', 'salesman'], required: true },
    status: { type: String, enum: ['pending', 'interview_scheduled', 'approved', 'rejected'], default: 'pending' },
    message: { type: String, trim: true, maxlength: 1000 },
    // Contact details + CV submitted with the application form
    fullName: { type: String, trim: true, maxlength: 80 },
    email: { type: String, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 30 },
    cv: {
      filename: { type: String },       // name on disk (private-uploads/cv)
      originalName: { type: String, maxlength: 200 },
      mimeType: { type: String },
      size: { type: Number },
    },
    interviewAt: { type: Date },
    interviewNote: { type: String, trim: true, maxlength: 500 },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
    assignedManager: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

// One open application per applicant + company
applicationSchema.index(
  { applicant: 1, company: 1 },
  { unique: true, partialFilterExpression: { status: { $in: ['pending', 'interview_scheduled'] } } }
);

applicationSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = String(ret._id);
    ret.hasCv = !!(ret.cv && ret.cv.filename);
    ret.cvName = ret.cv && ret.cv.originalName;
    delete ret.cv; // never expose the on-disk file name
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Application', applicationSchema);
