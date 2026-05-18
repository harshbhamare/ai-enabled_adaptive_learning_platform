const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Extract micro-topics and summaries from raw text using Gemini
 * Enhanced prompts for sharper, more educational content
 */
const extractTopicsAndSummaries = async (rawText) => {
  console.log("USING MODEL:", 'models/gemini-2.5-flash-lite');
  const model = genAI.getGenerativeModel({
    model: 'models/gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.4,
      topK: 40,
      topP: 0.95,
    }
  });

  const prompt = `You are an expert educational content curator and instructional designer. Analyze the following study material and extract clear, actionable micro-topics.

REQUIREMENTS:
1. Extract 6-12 distinct, focused topics (not too broad, not too narrow)
2. Each topic should represent a single, teachable concept
3. Write summaries that are:
   - Clear and concise (2-3 sentences)
   - Action-oriented (what students will learn/understand)
   - Free of jargon unless necessary
   - Engaging and motivating
4. Assign difficulty based on:
   - "easy": Foundational concepts, definitions, basic understanding
   - "normal": Application of concepts, moderate complexity
   - "advanced": Complex analysis, synthesis, expert-level understanding

Return ONLY a valid JSON array (no markdown, no code blocks):
[
  {
    "title": "Clear, specific topic title (5-8 words)",
    "summary": "Engaging 2-3 sentence summary explaining what students will learn and why it matters.",
    "difficulty": "easy|normal|advanced"
  }
]

STUDY MATERIAL:
${rawText.substring(0, 10000)}

Focus on creating topics that build upon each other logically. Make summaries compelling and student-focused.`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Clean up response
    let cleanText = text.trim();
    cleanText = cleanText.replace(/```json\n?/g, '').replace(/```\n?/g, '');

    // Extract JSON array
    const jsonMatch = cleanText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('Gemini response:', text);
      throw new Error('AI did not return valid JSON array');
    }

    const topics = JSON.parse(jsonMatch[0]);

    // Validate and enhance
    if (!Array.isArray(topics) || topics.length === 0) {
      throw new Error('AI returned empty or invalid topics array');
    }

    // Ensure quality standards
    return topics.map((topic, index) => ({
      title: topic.title?.trim() || `Topic ${index + 1}`,
      summary: topic.summary?.trim() || 'Summary not available',
      difficulty: ['easy', 'normal', 'advanced'].includes(topic.difficulty)
        ? topic.difficulty
        : 'normal'
    }));

  } catch (error) {
    console.error('Gemini API Error:', error.message);

    // Enhanced fallback
    return generateFallbackTopics(rawText);
  }
};

/**
 * Analyze document structure to determine topic distribution
 */
const analyzeDocumentStructure = async (rawText) => {
  const model = genAI.getGenerativeModel({
    model: 'models/gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.3,
    }
  });

  const prompt = `You are an expert academic analyst and a professional curriculum designer.
Analyze the following study material and determine how it can be broken into highly effective learning topics.

Your task:
1. Identify all logically teachable concepts present in the document.
Consider:
- conceptual depth
- subtopics
- dependency between topics
- engineering-level complexity
2. Classify them into:
   - easy (basic concepts)
   - moderate (applied understanding)
   - hard (complex concepts)

Do not estimate randomly.
Analyze the document structure carefully before deciding topic counts.

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
- Ensure counts are realistic and sum equals totalTopics

STUDY MATERIAL:
${rawText.substring(0, 15000)}`;

  try {
    const result = await model.generateContent(prompt);

    // Get raw AI response
    const text = result.response.text().trim();

    // Remove markdown wrappers if Gemini adds them
    const cleanText = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    // Extract JSON object
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      console.error("RAW GEMINI RESPONSE:", text);
      throw new Error("Invalid JSON format returned by AI");
    }

    // Parse JSON safely
    const parsedData = JSON.parse(jsonMatch[0]);

    // Basic validation
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

    // Dynamic fallback based on document size
    const wordCount = rawText.split(/\s+/).length;

    let totalTopics = Math.max(4, Math.ceil(wordCount / 600));

    // Prevent extremely large values
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

module.exports = {
  extractTopicsAndSummaries,
  analyzeDocumentStructure,
};



  // generateControlledTopics
  //   generateQuizQuestions,