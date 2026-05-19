const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Utility Delay Function
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Retry wrapper for Gemini API
 */
const generateWithRetry = async (model, prompt, retries = 3) => {

  for (let attempt = 1; attempt <= retries; attempt++) {

    try {

      console.log(`Gemini Request Attempt: ${attempt}`);

      const result = await model.generateContent(prompt);

      return result;

    } catch (error) {

      console.error(`Attempt ${attempt} failed:`, error.message);

      // Retry only for temporary overload issues
      if (
        error.message.includes('503') ||
        error.message.includes('high demand')
      ) {

        if (attempt < retries) {

          const waitTime = attempt * 2000;

          console.log(`Retrying in ${waitTime}ms...`);

          await delay(waitTime);

          continue;
        }
      }

      throw error;
    }
  }
};

/**
 * Generate controlled micro-topics and summaries from raw text
 */
const generateControlledTopics = async (
  rawText,
  easyCount,
  moderateCount,
  hardCount
) => {

  console.log("USING MODEL:", 'gemini-2.5-flash-lite');

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.3,
      topK: 40,
      topP: 0.95,
    }
  });

const prompt = `You are an expert engineering curriculum designer and academic content architect.

Your task is to analyze the given engineering study material and generate highly structured educational topics for an AI-powered adaptive learning platform.

IMPORTANT OBJECTIVE:
Generate clean, meaningful, non-overlapping learning topics that can later be used for:
- adaptive learning
- quiz generation
- module building
- microlearning content
- student assessment

STRICT REQUIREMENTS:

1. Generate EXACTLY:
- ${easyCount} easy topics
- ${moderateCount} moderate topics
- ${hardCount} hard topics

2. Total generated topics MUST equal:
${easyCount + moderateCount + hardCount}

3. Every topic must:
- represent ONE complete teachable concept
- be academically meaningful
- be concise and naturally written
- independently make sense when read alone
- NOT be truncated
- NOT be vague
- NOT be repetitive
- NOT overlap heavily with another topic

4. Topic title quality rules:
- Prefer concise academic topic names
- Prefer 4–10 words
- Avoid filler phrases like:
  - "Understanding the..."
  - "Explaining the..."
  - "Recognizing the..."
  - "Describing the..."
  - "Identifying the..."
- Topic titles should sound like:
  - real syllabus topics
  - engineering curriculum headings
  - professional educational modules

5. Learning sequence rules:
- Arrange topics logically
- Begin from foundational concepts
- Progress toward intermediate understanding
- End with advanced or analytical concepts

6. Difficulty classification rules:
- easy:
  foundational concepts, definitions, introductions, basic understanding

- moderate:
  applied concepts, implementation, practical understanding, comparative analysis

- hard:
  advanced concepts, optimization, analytical thinking, synthesis, complex problem-solving

7. IMPORTANT:
- Ensure clear separation between easy, moderate, and hard topics
- Do NOT classify most topics as easy
- Difficulty distribution must genuinely reflect conceptual complexity

8. DO NOT:
- generate summaries
- generate explanations
- generate descriptions
- generate bullet points
- generate learning outcomes
- generate incomplete headings
- generate duplicated concepts

9. Return ONLY valid JSON array.
Do NOT include:
- markdown
- comments
- explanations
- code blocks

RESPONSE FORMAT:

[
  {
    "title": "Topic Name",
    "difficulty": "easy"
  }
]

STUDY MATERIAL:
${rawText.substring(0, 15000)}
`;

  try {

    const result = await generateWithRetry(model, prompt);

    const response = await result.response;

    const text = response.text();

    let cleanText = text.trim();

    cleanText = cleanText
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const jsonMatch = cleanText.match(/\[[\s\S]*\]/);

    if (!jsonMatch) {

      console.error('RAW GEMINI RESPONSE:', text);

      throw new Error('AI did not return valid JSON array');
    }

    const topics = JSON.parse(jsonMatch[0]);

    if (!Array.isArray(topics) || topics.length === 0) {
      throw new Error('Invalid topics array');
    }

    return topics.map((topic, index) => ({

      title: topic.title?.trim() || `Topic ${index + 1}`,

      difficulty: ['easy', 'moderate', 'hard'].includes(topic.difficulty)
        ? topic.difficulty
        : 'moderate'

    }));

  } catch (error) {

    console.error('Topic Generation Error:', error.message);

    return generateFallbackTopics(rawText);
  }
};

/**
 * Analyze document structure
 */
const analyzeDocumentStructure = async (rawText) => {

  console.log("USING MODEL:", 'gemini-2.5-flash-lite');

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.3,
    }
  });

  const prompt = `You are an expert academic analyst and curriculum designer.

Analyze the following study material.

Your task:
1. Identify logically teachable concepts
2. Classify them into:
   - easy
   - moderate
   - hard

Return ONLY valid JSON:

{
  "totalTopics": number,
  "easy": number,
  "moderate": number,
  "hard": number
}

Rules:
- Do NOT generate actual topics
- Only analyze structure
- Ensure counts are realistic

STUDY MATERIAL:
${rawText.substring(0, 15000)}
`;

  try {

    const result = await generateWithRetry(model, prompt);

    const text = result.response.text().trim();

    const cleanText = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {

      console.error("RAW GEMINI RESPONSE:", text);

      throw new Error("Invalid JSON format returned by AI");
    }

    const parsedData = JSON.parse(jsonMatch[0]);

    if (
      typeof parsedData.totalTopics !== 'number' ||
      typeof parsedData.easy !== 'number' ||
      typeof parsedData.moderate !== 'number' ||
      typeof parsedData.hard !== 'number'
    ) {
      throw new Error("Incomplete analysis structure");
    }

    return parsedData;

  } catch (err) {

    console.error("Analysis Error:", err.message);

    // Dynamic fallback
    const wordCount = rawText.split(/\s+/).length;

    let totalTopics = Math.max(4, Math.ceil(wordCount / 600));

    totalTopics = Math.min(totalTopics, 20);

    const easy = Math.ceil(totalTopics * 0.3);
    const moderate = Math.ceil(totalTopics * 0.5);
    const hard = totalTopics - easy - moderate;

    return {
      totalTopics,
      easy,
      moderate,
      hard
    };
  }
};

/**
 * Fallback Topic Generator
 */
const generateFallbackTopics = (rawText) => {

  const paragraphs = rawText
    .split('\n')
    .filter(p => p.trim().length > 50);

  return paragraphs.slice(0, 6).map((p, index) => ({

    title: `Topic ${index + 1}`,

    summary: p.substring(0, 180).trim(),

    difficulty:
      index < 2
        ? 'easy'
        : index < 4
          ? 'normal'
          : 'advanced'
  }));
};

module.exports = {
  generateControlledTopics,
  analyzeDocumentStructure
};





































/**
 * Generate quiz questions from a topic using Gemini
 * Enhanced for educational quality and clarity
 */
// const generateQuizQuestions = async (topicTitle, topicSummary, count = 3) => {
//   const model = genAI.getGenerativeModel({
//     model: 'gemini-pro',
//     generationConfig: {
//       temperature: 0.6,
//       topK: 40,
//       topP: 0.95,
//     }
//   });

//   const prompt = `You are an expert assessment designer creating high-quality multiple-choice questions for educational purposes.

// TOPIC: ${topicTitle}
// CONTEXT: ${topicSummary}

// Create ${count} multiple-choice questions that:
// 1. Test genuine understanding (not just memorization)
// 2. Have clear, unambiguous wording
// 3. Include 4 distinct, plausible options
// 4. Have one clearly correct answer
// 5. Use distractors that reveal common misconceptions
// 6. Are appropriate for the topic's complexity level

// QUESTION TYPES TO USE:
// - Application: "What would happen if..."
// - Analysis: "Why does..."
// - Evaluation: "Which approach is best..."
// - Comprehension: "What does this mean..."

// Return ONLY a valid JSON array (no markdown, no code blocks):
// [
//   {
//     "questionText": "Clear, specific question that tests understanding?",
//     "options": [
//       "Correct answer with specific details",
//       "Plausible distractor based on common misconception",
//       "Another plausible but incorrect option",
//       "Fourth option that's clearly wrong but educational"
//     ],
//     "correctAnswer": "Correct answer with specific details",
//     "marks": 1,
//     "difficulty": "easy|normal|advanced",
//     "explanation": "Brief explanation of why the correct answer is right (1 sentence)"
//   }
// ]

// Make questions engaging and educational. Avoid trick questions.`;

//   try {
//     const result = await model.generateContent(prompt);
//     const response = await result.response;
//     const text = response.text();

//     // Clean up response
//     let cleanText = text.trim();
//     cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

//     // Extract JSON array
//     const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
//     if (!jsonMatch) {
//       console.error('Gemini response:', text);
//       throw new Error('AI did not return valid JSON for quiz');
//     }

//     const questions = JSON.parse(jsonMatch[0]);

//     // Validate structure
//     if (!Array.isArray(questions) || questions.length === 0) {
//       throw new Error('AI returned empty or invalid questions array');
//     }

//     // Ensure quality and structure
//     return questions.map((q, index) => {
//       // Validate options
//       const options = Array.isArray(q.options) && q.options.length === 4
//         ? q.options.map(opt => opt?.trim()).filter(Boolean)
//         : ['Option A', 'Option B', 'Option C', 'Option D'];

//       // Ensure we have 4 options
//       while (options.length < 4) {
//         options.push(`Additional option ${options.length + 1}`);
//       }

//       const correctAnswer = q.correctAnswer?.trim() || options[0];

//       return {
//         questionText: q.questionText?.trim() || `Question ${index + 1} about ${topicTitle}`,
//         options: options.slice(0, 4),
//         correctAnswer: options.includes(correctAnswer) ? correctAnswer : options[0],
//         marks: q.marks || 1,
//         difficulty: ['easy', 'normal', 'advanced'].includes(q.difficulty)
//           ? q.difficulty
//           : 'normal',
//         explanation: q.explanation?.trim() || ''
//       };
//     });

//   } catch (error) {
//     console.error('Gemini API Error:', error.message);

//     // Enhanced fallback
//     return generateFallbackQuestions(topicTitle, topicSummary, count);
//   }
// };

/**
 * Enhanced fallback topic generation
 */
// function generateFallbackTopics(rawText) {
//   const paragraphs = rawText
//     .split(/\n{2,}/)
//     .map((p) => p.trim())
//     .filter((p) => p.length > 50)
//     .slice(0, 10);

//   if (paragraphs.length === 0) {
//     return [{
//       title: 'Introduction and Overview',
//       summary: 'This section provides foundational knowledge and context for understanding the main concepts. Students will gain essential background information needed for deeper learning.',
//       difficulty: 'easy',
//     }];
//   }

//   const difficulties = ['easy', 'easy', 'normal', 'normal', 'normal', 'advanced', 'advanced'];

//   return paragraphs.map((para, i) => {
//     // Extract first meaningful sentence
//     const sentences = para.split(/[.!?]+/).filter(s => s.trim().length > 10);
//     const firstSentence = sentences[0]?.trim() || '';

//     // Create title from first sentence
//     let title = firstSentence.length > 60
//       ? firstSentence.substring(0, 57) + '...'
//       : firstSentence || `Key Concept ${i + 1}`;

//     // Clean up title
//     title = title.replace(/^(the|a|an)\s+/i, '').trim();
//     title = title.charAt(0).toUpperCase() + title.slice(1);

//     // Create engaging summary
//     const summaryText = sentences.slice(0, 3).join('. ').substring(0, 280);
//     const summary = summaryText + (summaryText.length < para.length ? '...' : '');

//     return {
//       title,
//       summary: summary || 'This topic covers important concepts that build upon previous knowledge.',
//       difficulty: difficulties[i % difficulties.length],
//     };
//   });
// }

/**
 * Enhanced fallback question generation
 */
// function generateFallbackQuestions(topicTitle, topicSummary, count) {
//   const questions = [];
//   const questionStarters = [
//     'What is the primary purpose of',
//     'Which statement best describes',
//     'How does',
//     'What would be the result of',
//     'Which approach is most effective for'
//   ];

//   for (let i = 0; i < count; i++) {
//     const starter = questionStarters[i % questionStarters.length];
//     questions.push({
//       questionText: `${starter} ${topicTitle.toLowerCase()}?`,
//       options: [
//         `Understanding and applying the core principles of ${topicTitle}`,
//         `A common but incorrect interpretation`,
//         `A partially correct but incomplete answer`,
//         `An unrelated concept`,
//       ],
//       correctAnswer: `Understanding and applying the core principles of ${topicTitle}`,
//       marks: 1,
//       difficulty: i === 0 ? 'easy' : i === count - 1 ? 'advanced' : 'normal',
//       explanation: `This question tests comprehension of ${topicTitle}.`
//     });
//   }
//   return questions;
// }

// Exports moved to end of file



/**
 * Generate controlled topics based on specified difficulty counts
 */
// const generateControlledTopics = async (rawText, easyCount, moderateCount, hardCount) => {
//   const model = genAI.getGenerativeModel({
//     model: 'gemini-pro',
//     generationConfig: {
//       temperature: 0.4,
//     }
//   });

//   const prompt = `You are an expert academic content designer.
// Generate structured learning topics from the given study material.

// IMPORTANT REQUIREMENTS:
// 1. Generate EXACT number of topics:
//    - Easy: ${easyCount}
//    - Moderate: ${moderateCount}
//    - Hard: ${hardCount}

// 2. Each topic MUST:
//    - Be a COMPLETE sentence or concept (NOT fragments)
//    - Be clear and meaningful
//    - Be 6–12 words long
//    - Represent a full idea (no cut phrases)

// 3. DO NOT:
//    - Use bullet points
//    - Use incomplete phrases
//    - Cut sentences halfway
//    - Add summaries

// Return ONLY JSON array:
// [
//   {
//     "title": "Complete meaningful topic sentence",
//     "difficulty": "easy|moderate|hard"
//   }
// ]

// STUDY MATERIAL:
// ${rawText.substring(0, 10000)}`;

//   try {
//     const result = await model.generateContent(prompt);
//     const text = result.response.text().trim();
//     const cleanText = text.replace(/```json/g, '').replace(/```/g, '');
//     const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
//     if (!jsonMatch) throw new Error("Invalid JSON");
//     return JSON.parse(jsonMatch[0]);
//   } catch (err) {
//     console.error("Topic Generation Error:", err.message);
//     return generateFallbackTopics(rawText);
//   }
// };




  // generateControlledTopics
  //   generateQuizQuestions,