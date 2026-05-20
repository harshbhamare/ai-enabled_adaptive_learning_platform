const mongoose = require('mongoose');

const quizPlanSchema = new mongoose.Schema({

  topicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic',
    required: true
  },

  recommendedQuestions: {
    type: Number,
    default: 0
  },

  assessmentLevel: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },

  reason: {
    type: String
  },

  approvedByFaculty: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true
});

module.exports = mongoose.model(
  'QuizPlan',
  quizPlanSchema
);