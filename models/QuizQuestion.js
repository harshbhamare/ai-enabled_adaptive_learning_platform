const mongoose = require('mongoose');

const quizQuestionSchema = new mongoose.Schema({

  topicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic',
    required: true
  },

  question: {
    type: String,
    required: true
  },

  options: [{
    type: String
  }],

  correctAnswer: {
    type: String,
    required: true
  },

  explanation: {
    type: String
  },

  difficulty: {
    type: String,
    enum: ['easy', 'moderate', 'hard'],
    default: 'moderate'
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
  'QuizQuestion',
  quizQuestionSchema
);