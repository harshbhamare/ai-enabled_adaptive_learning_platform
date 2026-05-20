const mongoose = require('mongoose');

const topicContentSchema = new mongoose.Schema({

  topicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic',
    required: true
  },

  explanation: {
    type: String,
    required: true
  },

  keyPoints: [{
    type: String
  }],

  realWorldExample: {
    type: String
  },

  revisionSummary: {
    type: String
  },

  generatedByAI: {
    type: Boolean,
    default: true
  },

  verifiedByFaculty: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true
});

module.exports = mongoose.model(
  'TopicContent',
  topicContentSchema
);