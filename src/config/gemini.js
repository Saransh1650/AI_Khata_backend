'use strict';
const { GoogleGenAI } = require('@google/genai');
const env = require('./env');
const { callGroq } = require('./groq');

const genai = new GoogleGenAI({ apiKey: env.geminiApiKey });

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Unified model chain for Gemini
const MODEL_CHAIN = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];

// In-process circuit breaker: tracks which models are daily-quota-exhausted.
// Resets after 1 hour so it re-tries after partial quota recovery.
const exhaustedUntil = {};
const EXHAUSTED_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

/**
 * Call Gemini with a text prompt (and optional image part).
 * Tries MODEL_CHAIN in order, skipping models whose daily quota is exhausted.
 * FALLBACKS to Groq (Llama 3.1) if all Gemini models fail.
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

            if (!is429) {
                console.error(`[Gemini] Non-429 error on ${model}:`, msg);
                lastError = err;
                continue; // Try next model or fallback
            }

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
                : 20_000;
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

    // FINAL FALLBACK: Groq (Llama 3.1)
    if (env.groqApiKey) {
        console.log('[AI Fallback] Trying Groq (Llama 3.1) as Gemini is unavailable…');
        try {
            // Groq doesn't support image parts in this simple text call easily,
            // so if imagePart exists, we might need a different handler or skip.
            // For insights (text-only), it works perfectly.
            if (imagePart) {
                console.warn('[Groq Fallback] Image processing not yet optimized for Llama fallback, attempting text-only analysis.');
            }
            return await callGroq(prompt);
        } catch (groqErr) {
            console.error('[Groq Fallback] Groq also failed:', groqErr.message);
            throw groqErr;
        }
    }

    throw lastError ?? new Error('All AI providers unavailable');
}

module.exports = { callGemini };
