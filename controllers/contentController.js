const Content = require('../models/Content');
const Topic = require('../models/Topic');
const {
  generateControlledTopics,
  analyzeDocumentStructure,
  generateTopicContent,
  analyzeQuizRequirement
} = require('../config/aiService');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const TopicContent = require('../models/TopicContent');
const QuizPlan = require('../models/QuizPlan');

// Helper: Detect file type from extension
const getFileType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  if (['.mp4', '.avi', '.mov', '.mkv'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.m4a', '.aac'].includes(ext)) return 'audio';
  if (ext === '.pdf') return 'pdf';
  if (['.ppt', '.pptx'].includes(ext)) return 'ppt';
  return 'text';
};

// @desc Upload content
// @route POST /api/content/upload
const uploadContent = async (req, res) => {
  const { title, textContent } = req.body;
  let rawText = '';
  let fileType = 'text';
  let fileName = '';
  let filePath = '';

  if (req.file) {
    fileName = req.file.originalname;
    filePath = req.file.path;
    fileType = getFileType(fileName);

    if (fileType === 'pdf') {
      const dataBuffer = fs.readFileSync(req.file.path);

      const pdfData = await pdfParse(dataBuffer);

      rawText = pdfData.text;

      console.log("========== EXTRACTED TEXT ==========");
      console.log(rawText);
      console.log("====================================");
      fs.unlinkSync(req.file.path); // clean up temp file
      filePath = '';
    } else if (fileType === 'video' || fileType === 'audio') {
      // Keep file for later transcription
      rawText = `${fileType.toUpperCase()} file uploaded: ${fileName}. Transcription will be processed.`;
    } else {
      // PPT or other
      rawText = `${fileType.toUpperCase()} file uploaded: ${fileName}. Manual text extraction required.`;
      fs.unlinkSync(req.file.path);
      filePath = '';
    }
  } else if (textContent) {
    rawText = textContent;
    fileType = 'text';
  } else {
    return res.status(400).json({ message: 'No content provided' });
  }

  const content = await Content.create({
    title: title || fileName || 'Untitled',
    uploadedBy: req.user._id,
    fileType,
    rawText,
    fileName,
    filePath,
    status: 'uploaded',
  });

  res.status(201).json(content);
};

const analyzeContent = async (req, res) => {

  const content = await Content.findById(req.params.id);

  if (!content) {
    return res.status(404).json({
      message: 'Content not found'
    });
  }

  if (content.uploadedBy.toString() !== req.user._id.toString()) {
    return res.status(403).json({
      message: 'Not authorized'
    });
  }

  try {

    const analysis = await analyzeDocumentStructure(content.rawText);

    res.json({
      contentId: content._id,
      analysis
    });

  } catch (error) {

    res.status(500).json({
      message: 'Document analysis failed',
      error: error.message
    });

  }

};

const generateTopics = async (req, res) => {

  console.log("REQ BODY:", req.body);

  const { easy, moderate, hard } = req.body;

  const content = await Content.findById(req.params.id);

  if (!content) {

    return res.status(404).json({
      message: 'Content not found'
    });

  }

  // Ownership check
  if (content.uploadedBy.toString() !== req.user._id.toString()) {

    return res.status(403).json({
      message: 'Not authorized'
    });

  }

  // Validation
  if (
    easy < 0 ||
    moderate < 0 ||
    hard < 0
  ) {

    return res.status(400).json({
      message: 'Invalid topic counts'
    });

  }

  const totalTopics = easy + moderate + hard;

  if (totalTopics > 25) {

    return res.status(400).json({
      message: 'Too many topics requested'
    });

  }

  try {

    content.status = 'processing';

    await content.save();

    // Generate AI topics
    const topics = await generateControlledTopics(
      content.rawText,
      easy,
      moderate,
      hard
    );

    console.log("TOTAL GENERATED TOPICS:", topics.length);

    console.log("RAW GENERATED TOPICS:", topics);

    // Validate AI output
    const validTopics = topics.filter(t =>

      t.title &&
      typeof t.title === 'string' &&
      t.title.trim().length > 3 &&
      ['easy', 'moderate', 'hard'].includes(t.difficulty)

    );

    console.log("VALID TOPICS:", validTopics.length);

    // Ensure AI respected requested count
    if (validTopics.length !== totalTopics) {

      console.warn(
        `Expected ${totalTopics} topics but received ${validTopics.length}`
      );

    }

    // Remove old topics before regenerating
    await Topic.deleteMany({
      contentId: content._id
    });

    // Save validated topics
    const createdTopics = await Topic.insertMany(

      validTopics.map((t, i) => ({

        title: t.title.trim(),

        difficulty: t.difficulty,

        contentId: content._id,

        createdBy: req.user._id,

        order: i

      })),

      { ordered: false }

    );

    console.log("SAVED TOPICS:", createdTopics.length);

    content.status = 'processed';

    await content.save();

    res.json({
      success: true,
      requestedTopics: totalTopics,
      generatedTopics: topics.length,
      validTopics: validTopics.length,
      savedTopics: createdTopics.length,
      topics: createdTopics
    });

  } catch (error) {

    console.error("TOPIC GENERATION ERROR:", error);

    content.status = 'failed';

    await content.save();

    res.status(500).json({
      success: false,
      message: 'Topic generation failed',
      error: error.message
    });

  }

};

// @desc Get all content by faculty
// @route GET /api/content
const getMyContent = async (req, res) => {
  const content = await Content.find({ uploadedBy: req.user._id }).sort({ createdAt: -1 });
  res.json(content);
};

// @desc Get topics for a content
// @route GET /api/content/:id/topics
const getContentTopics = async (req, res) => {
  const topics = await Topic.find({ contentId: req.params.id }).sort({ order: 1 });
  res.json(topics);
};

const generateContentForTopic = async (req, res) => {

  const topic = await Topic.findById(req.params.topicId);

  if (!topic) {

    return res.status(404).json({
      message: 'Topic not found'
    });

  }

  const content = await Content.findById(topic.contentId);

  if (!content) {

    return res.status(404).json({
      message: 'Parent content not found'
    });

  }

  try {

    console.log("GENERATING CONTENT FOR TOPIC:");
    console.log(topic.title);

    // Remove old generated content
    await TopicContent.deleteMany({
      topicId: topic._id
    });

    const generatedContent = await generateTopicContent(
      topic.title,
      topic.difficulty,
      content.rawText
    );

    const savedContent = await TopicContent.create({

      topicId: topic._id,

      explanation: generatedContent.explanation,

      keyPoints: generatedContent.keyPoints,

      realWorldExample:
        generatedContent.realWorldExample,

      revisionSummary:
        generatedContent.revisionSummary

    });

    res.json({
      success: true,
      topic: topic.title,
      content: savedContent
    });

  } catch (error) {

    console.error(
      "CONTENT GENERATION ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message: 'Content generation failed',
      error: error.message
    });

  }

};

const getTopicContent = async (req, res) => {

  try {

    const topic = await Topic.findById(req.params.topicId);

    if (!topic) {

      return res.status(404).json({
        message: 'Topic not found'
      });

    }

    const topicContent = await TopicContent.findOne({
      topicId: topic._id
    });

    if (!topicContent) {

      return res.status(404).json({
        message: 'Content not generated yet'
      });

    }

    res.json({
      success: true,
      topic: {
        id: topic._id,
        title: topic.title,
        difficulty: topic.difficulty
      },
      content: topicContent
    });

  } catch (error) {

    console.error(
      "GET TOPIC CONTENT ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message: 'Failed to fetch topic content',
      error: error.message
    });

  }

};

const generateQuizPlan = async (req, res) => {

  try {

    const topic = await Topic.findById(
      req.params.topicId
    );

    if (!topic) {

      return res.status(404).json({
        message: 'Topic not found'
      });

    }

    const topicContent = await TopicContent.findOne({
      topicId: topic._id
    });

    if (!topicContent) {

      return res.status(404).json({
        message: 'Generate topic content first'
      });

    }

    console.log(
      "GENERATING QUIZ PLAN FOR:",
      topic.title
    );

    // Remove old plan if exists
    await QuizPlan.deleteMany({
      topicId: topic._id
    });

    const analysis = await analyzeQuizRequirement(

      topic.title,

      topic.difficulty,

      topicContent.explanation

    );

    const savedPlan = await QuizPlan.create({

      topicId: topic._id,

      recommendedQuestions:
        analysis.recommendedQuestions,

      assessmentLevel:
        analysis.assessmentLevel,

      reason:
        analysis.reason

    });

    res.json({
      success: true,
      topic: {
        id: topic._id,
        title: topic.title,
        difficulty: topic.difficulty
      },
      quizPlan: savedPlan
    });

  } catch (error) {

    console.error(
      "QUIZ PLAN GENERATION ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message: 'Quiz plan generation failed',
      error: error.message
    });

  }

};

module.exports = {
  uploadContent,
  analyzeContent,
  generateTopics,
  getMyContent,
  getContentTopics,
  generateContentForTopic,
  getTopicContent,
  generateQuizPlan
};
