'use strict';
// Groq has been replaced by Amazon Bedrock (Nova Lite v2). This file is kept
// as a stub so any legacy require('./groq') calls resolve without error.
const { callBedrock } = require('./bedrock');

async function callGroq(prompt) {
    return callBedrock(prompt);
}

module.exports = { callGroq };
