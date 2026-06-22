const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect, authorize } = require('../middleware/authMiddleware');
const {
  uploadContent,
  analyzeContent,
  generateTopics,
  generateContentForTopic,
  getTopicContent,
  generateQuizPlan,
  generateChapterQuiz,
  getMyContent,
  getContentTopics,
  generateCompleteModule
} = require('../controllers/contentController');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.ppt', '.pptx', '.mp4', '.avi', '.mov', '.mp3', '.wav', '.m4a'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Only PDF, PPT, Video (MP4/AVI/MOV), and Audio (MP3/WAV/M4A) files are allowed'));
  },
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});



router.use(protect, authorize('faculty', 'admin'));
router.post('/upload', upload.single('file'), uploadContent);
router.get('/', getMyContent);
router.get('/:id/topics', getContentTopics);
router.post('/:id/analyze', analyzeContent);
router.post('/:id/generate-topics', generateTopics);
router.post('/topic/:topicId/generate-content', generateContentForTopic);
router.get('/topic/:topicId/content', getTopicContent);
router.post('/topic/:topicId/generate-quiz-plan', generateQuizPlan);
router.post('/:contentId/generate-chapter-quiz', generateChapterQuiz);
router.post('/:contentId/generate-complete-module', generateCompleteModule);

module.exports = router;
