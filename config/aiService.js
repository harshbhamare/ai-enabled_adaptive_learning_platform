const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Utility Delay Function

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));


// Retry wrapper for Gemini API

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

// Generate controlled micro-topics and summaries from raw text

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


// Analyze document structure

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


// Fallback Topic Generator

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

const generateTopicContent = async (
  topicTitle,
  difficulty,
  rawText
) => {

  console.log("USING MODEL:", 'gemini-2.5-flash-lite');

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash-lite',
    generationConfig: {
      temperature: 0.5,
      topK: 40,
      topP: 0.95,
    }
  });

  const prompt = `You are an expert engineering educator and microlearning designer.

Generate structured educational learning content for the following topic.

TOPIC:
${topicTitle}

DIFFICULTY:
${difficulty}

IMPORTANT REQUIREMENTS:

1. explanation:
- 120-250 words
- clear and student-friendly
- academically accurate
- focused ONLY on this topic
- avoid unnecessary theory dumping

2. keyPoints:
- 4 to 6 concise revision points
- easy to remember
- no long paragraphs

3. realWorldExample:
- practical real-life or industry-based example
- simple and relatable

4. revisionSummary:
- 2-4 lines maximum
- should help quick revision before exam

5. IMPORTANT:
- generate concise educational content
- avoid repetition
- avoid generic AI wording
- avoid markdown
- avoid bullet symbols inside text fields

Return ONLY valid JSON:

{
  "explanation": "Topic explanation",
  "keyPoints": [
    "Point 1",
    "Point 2"
  ],
  "realWorldExample": "Example here",
  "revisionSummary": "Quick revision summary"
}

REFERENCE STUDY MATERIAL:
${rawText.substring(0, 12000)}
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

    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {

      console.error("RAW AI RESPONSE:", text);

      throw new Error('Invalid JSON returned');
    }

    const parsedContent = JSON.parse(jsonMatch[0]);

    return {

      explanation:
        parsedContent.explanation?.trim() ||
        'Explanation not generated.',

      keyPoints:
        Array.isArray(parsedContent.keyPoints)
          ? parsedContent.keyPoints
          : [],

      realWorldExample:
        parsedContent.realWorldExample?.trim() ||
        'Example not generated.',

      revisionSummary:
        parsedContent.revisionSummary?.trim() ||
        'Summary not generated.'

    };

  } catch (error) {

    console.error(
      "TOPIC CONTENT GENERATION ERROR:",
      error.message
    );

    return {

      explanation:
        `This topic explains ${topicTitle}.`,

      keyPoints: [
        topicTitle
      ],

      realWorldExample:
        'Real-world example unavailable.',

      revisionSummary:
        `Quick revision for ${topicTitle}.`

    };

  }

};

module.exports = {
  generateControlledTopics,
  analyzeDocumentStructure,
  generateTopicContent
};






























