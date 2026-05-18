const Content = require('../models/Content');
const Topic = require('../models/Topic');
const {
  analyzeDocumentStructure,
  generateControlledTopics
} = require('../config/aiService');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const path = require('path');

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

  const { easy, moderate, hard } = req.body;

  const content = await Content.findById(req.params.id);

  if (!content) {
    return res.status(404).json({
      message: 'Content not found'
    });
  }

  try {

    const topics = await generateControlledTopics(
      content.rawText,
      easy,
      moderate,
      hard
    );

    const createdTopics = await Topic.insertMany(
      topics.map((t, i) => ({
        title: t.title,
        difficulty: t.difficulty,
        contentId: content._id,
        createdBy: req.user._id,
        order: i
      }))
    );

    content.status = 'processed';

    await content.save();

    res.json({
      topics: createdTopics
    });

  } catch (error) {

    content.status = 'failed';

    await content.save();

    res.status(500).json({
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

module.exports = {
  uploadContent,
  analyzeContent,
  generateTopics,
  getMyContent,
  getContentTopics
};
