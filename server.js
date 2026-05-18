require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

connectDB();

const app = express();


app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/content', require('./routes/contentRoutes'));
// app.use('/api/topics', require('./routes/topicRoutes'));
// app.use('/api/modules', require('./routes/moduleRoutes'));
// app.use('/api/quizzes', require('./routes/quizRoutes'));
// app.use('/api/results', require('./routes/resultRoutes'));
// app.use('/api/admin', require('./routes/adminRoutes'));

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ message: err.message || 'Server Error' });
});

app.get('/test-ai', async (req, res) => {

  try {

    const model = genAI.getGenerativeModel({
      model: 'models/gemini-2.5-flash-lite'
    });

    const result = await model.generateContent("Hello");

    const response = result.response.text();

    res.json({ response });

  } catch (err) {

    console.error(err);

    res.status(500).json({
      error: err.message
    });

  }

});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
