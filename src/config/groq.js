'use strict';
const Groq = require('groq-sdk');
const env = require('./env');

const groq = new Groq({ apiKey: env.groqApiKey });

/**
 * Call Groq with a text prompt.
 * Uses Llama 3.1 70B by default for high quality.
 * Returns parsed JSON or throws on error.
 * @param {string} prompt
 * @param {string} model
 * @returns {Promise<any>} parsed JSON
 */
async function callGroq(prompt, model = 'llama-3.3-70b-versatile') {
    try {
        const chatCompletion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model: model,
            response_format: { type: 'json_object' },
        });

        const text = chatCompletion.choices[0].message.content;
        return JSON.parse(text.trim());
    } catch (err) {
        console.error(`[Groq] Error with model ${model}:`, err.message);
        throw err;
    }
}

module.exports = { callGroq };
