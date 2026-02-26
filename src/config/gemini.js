'use strict';
const { GoogleGenAI } = require('@google/genai');
const env = require('./env');

const genai = new GoogleGenAI({ apiKey: env.geminiApiKey });

/**
 * Call Gemini with a text prompt (and optional image part).
 * Always asks Gemini to return valid JSON.
 * @param {string} prompt
 * @param {{ inlineData: { mimeType: string, data: string } } | null} imagePart
 * @returns {Promise<any>} parsed JSON
 */
async function callGemini(prompt, imagePart = null) {
    const model = 'gemini-1.5-flash';
    const parts = [];

    if (imagePart) parts.push(imagePart);
    parts.push({ text: prompt });

    const response = await genai.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        generationConfig: {
            responseMimeType: 'application/json',
        },
    });

    const text = response.candidates[0].content.parts[0].text;
    return JSON.parse(text);
}

module.exports = { callGemini };
