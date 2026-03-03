'use strict';
/**
 * RAG Event Emitter — Real-time Learning Event Bus
 * ─────────────────────────────────────────────────
 * 
 * Singleton EventEmitter that broadcasts RAG learning events.
 * Used by shopMemory.js and transactionLearner.js to emit events
 * that the SSE dashboard endpoint can stream to connected clients.
 * 
 * Event format: { type, storeId, ...payload, ts }
 *
 * Events emitted:
 *  - product_learned        : a product behavior entry was upserted
 *  - relationship_updated   : a product pair relationship was updated
 *  - insight_generated      : an experience insight was saved
 *  - deep_learning_started  : deep relationship discovery triggered
 *  - deep_learning_completed: deep learning cycle finished
 *  - memory_initialized     : full store initialization completed
 *  - batch_learn_progress   : progress tick during batch learning
 */
const EventEmitter = require('events');

class RagEventEmitter extends EventEmitter {}

const emitter = new RagEventEmitter();
emitter.setMaxListeners(100); // allow many concurrent SSE connections

/**
 * Emit a RAG learning event
 * @param {string} storeId  - UUID of the store
 * @param {string} type     - event type string
 * @param {object} payload  - event-specific data
 */
function emitRagEvent(storeId, type, payload = {}) {
    const event = { type, storeId, ts: new Date().toISOString(), ...payload };
    emitter.emit(`store:${storeId}`, event);
    emitter.emit('all', event); // global listener if needed
}

/**
 * Subscribe to events for a specific store
 * @param {string}   storeId  - UUID of the store to watch
 * @param {Function} listener - callback(event)
 */
function subscribeStore(storeId, listener) {
    emitter.on(`store:${storeId}`, listener);
}

/**
 * Unsubscribe from events for a specific store
 * @param {string}   storeId  - UUID of the store
 * @param {Function} listener - the same callback passed to subscribeStore
 */
function unsubscribeStore(storeId, listener) {
    emitter.off(`store:${storeId}`, listener);
}

module.exports = { emitRagEvent, subscribeStore, unsubscribeStore };
