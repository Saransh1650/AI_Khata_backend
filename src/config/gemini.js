'use strict';
const { GoogleGenAI } = require('@google/genai');
const env = require('./env');

const genai = new GoogleGenAI({ apiKey: env.geminiApiKey });

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Both are valid in the @google/genai v0.x SDK with the Gemini Developer API
const MODEL_CHAIN = ['gemini-2.5-flash', 'gemini-2.0-flash'];

// In-process circuit breaker: tracks which models are daily-quota-exhausted.
// Resets after 1 hour so it re-tries after partial quota recovery.
const exhaustedUntil = {};
const EXHAUSTED_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

/**
 * Call Gemini with a text prompt (and optional image part).
 * Tries MODEL_CHAIN in order, skipping models whose daily quota is exhausted.
 * Returns parsed JSON or throws if all models are unavailable.
 * @param {string} prompt
 * @param {{ inlineData: { mimeType: string, data: string } } | null} imagePart
 * @returns {Promise<any>} parsed JSON
 */
async function callGemini(prompt, imagePart = null) {
    const parts = [];
    if (imagePart) parts.push(imagePart);
    parts.push({ text: prompt });

    let lastError;

    for (const model of MODEL_CHAIN) {
        // Skip model if we know its daily quota is blown
        if (exhaustedUntil[model] && Date.now() < exhaustedUntil[model]) {
            continue;
        }

        try {
            const response = await genai.models.generateContent({
                model,
                contents: [{ role: 'user', parts }],
                generationConfig: { responseMimeType: 'application/json' },
            });

            let text = response.candidates[0].content.parts[0].text;
            // Strip markdown code fences if the model wraps output
            const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (fenceMatch) text = fenceMatch[1];

            return JSON.parse(text.trim());

        } catch (err) {
            const msg = err?.message ?? '';
            const is429 = err?.status === 429
                || msg.includes('429')
                || msg.includes('RESOURCE_EXHAUSTED');

            if (!is429) throw err; // Non-quota error, propagate immediately

            const isDailyExhausted = msg.includes('PerDay') || msg.includes('limit: 0');

            if (isDailyExhausted) {
                // Mark this model as exhausted for 1 hour, move to next
                exhaustedUntil[model] = Date.now() + EXHAUSTED_COOLDOWN_MS;
                console.warn(`[Gemini] Daily quota exhausted for ${model}, skipping for 1h`);
                lastError = err;
                continue;
            }

            // Per-minute rate limit — wait for the retry delay, then try once more
            const retryMatch = msg.match(/retryDelay[^\d]*(\d+)|retry[^\d]*(\d+)/i);
            const waitMs = retryMatch
                ? parseInt(retryMatch[1] ?? retryMatch[2], 10) * 1000
                : 30_000;
            console.warn(`[Gemini] Rate limited on ${model}, retrying in ${waitMs / 1000}s…`);
            await sleep(waitMs);

            try {
                const retryResponse = await genai.models.generateContent({
                    model,
                    contents: [{ role: 'user', parts }],
                    generationConfig: { responseMimeType: 'application/json' },
                });
                let text = retryResponse.candidates[0].content.parts[0].text;
                const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
                if (fenceMatch) text = fenceMatch[1];
                return JSON.parse(text.trim());
            } catch (retryErr) {
                console.warn(`[Gemini] Retry also failed for ${model}, trying next…`);
                lastError = retryErr;
                continue;
            }
        }
    }

    throw lastError ?? new Error('All Gemini models unavailable');
}

module.exports = { callGemini };
