'use strict';
/**
 * Amazon Bedrock — AI provider for all text and vision tasks.
 * Model: Amazon Nova Lite v2  (multimodal: text + image)
 *
 * Auth: standard AWS credential chain —
 *   • Local dev: AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY env vars
 *   • EC2: IAM instance role (no keys needed)
 */
const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const env = require('./env');

// Amazon Nova Lite v1 — confirmed working model ID
const MODEL_ID = 'amazon.nova-lite-v1:0';
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 2000;

const client = new BedrockRuntimeClient({ region: env.awsRegion });

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * Call Amazon Bedrock (Nova Lite v2) with a text prompt and optional image.
 * Returns parsed JSON or throws.
 *
 * @param {string} prompt
 * @param {{ bytes: Buffer, mimeType: string } | null} imagePart
 * @returns {Promise<any>} parsed JSON
 */
async function callBedrock(prompt, imagePart = null) {
    const content = [];

    if (imagePart) {
        // Map MIME type → Bedrock format name
        const formatMap = {
            'image/jpeg': 'jpeg',
            'image/jpg':  'jpeg',
            'image/png':  'png',
            'image/gif':  'gif',
            'image/webp': 'webp',
        };
        const format = formatMap[imagePart.mimeType] || 'jpeg';
        content.push({
            image: {
                format,
                source: { bytes: new Uint8Array(imagePart.bytes) },
            },
        });
    }

    content.push({ text: prompt });

    const command = new ConverseCommand({
        modelId: MODEL_ID,
        messages: [{ role: 'user', content }],
        inferenceConfig: {
            maxTokens: 4096,
            temperature: 0.1, // Low temp → consistent JSON output
        },
    });

    let lastError;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await client.send(command);
            const text = response.output.message.content[0].text;

            // Strip markdown code fences if the model wraps output
            const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/s);
            const jsonText = fenceMatch ? fenceMatch[1] : text;

            return JSON.parse(jsonText.trim());

        } catch (err) {
            lastError = err;
            const isThrottle =
                err.name === 'ThrottlingException' ||
                err.$metadata?.httpStatusCode === 429;

            if (isThrottle && attempt < MAX_RETRIES - 1) {
                const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
                console.warn(`[Bedrock] Throttled — retrying in ${delay / 1000}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
                await sleep(delay);
                continue;
            }

            console.error(`[Bedrock] Error (attempt ${attempt + 1}):`, err.message);
            throw err;
        }
    }

    throw lastError;
}

module.exports = { callBedrock };
