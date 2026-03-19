const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
  content: { type: String, required: true, maxlength: 2000 },
  author: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    displayName: { type: String, required: true },
    avatar: { type: String }
  },
  media: [{
    url: { type: String },
    publicId: { type: String },
    type: { type: String, enum: ['image', 'video'] }
  }],
  reactions: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emoji: { type: String, default: '❤️' }
  }],
  comments: [{
    author: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      displayName: { type: String },
      avatar: { type: String }
    },
    content: { type: String, maxlength: 500 },
    createdAt: { type: Date, default: Date.now }
  }],
  pinnedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  tags: [{ type: String, maxlength: 30 }],
  color: { type: String, default: 'default' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

noteSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Note', noteSchema);