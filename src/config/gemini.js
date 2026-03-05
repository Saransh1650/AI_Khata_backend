'use strict';
// Gemini has been replaced by Amazon Bedrock (Nova Lite v2).
// This shim keeps any legacy require('./gemini') calls working.
const { callBedrock } = require('./bedrock');

/**
 * @deprecated — backed by Amazon Bedrock (Nova Lite v2).
 * imagePart should now be { bytes: Buffer, mimeType: string }.
 */
async function callGemini(prompt, imagePart = null) {
    return callBedrock(prompt, imagePart);
}

module.exports = { callGemini };
