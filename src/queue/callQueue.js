'use strict';

/**
 * Call-tracking webhook queue.
 *
 * When a call webhook arrives we enqueue the event in Redis and process it with
 * a BullMQ worker bounded to 5 concurrent jobs (CALL_WORKER_CONCURRENCY). This
 * keeps the webhook response instant and protects the DB under bursty traffic.
 *
 * If REDIS_URL is not configured (e.g. local/dev), we transparently fall back to
 * inline processing so the app still works without Redis.
 */

const { processCallEvent } = require('../services/call.service');

const CONCURRENCY = parseInt(process.env.CALL_WORKER_CONCURRENCY, 10) || 5;
const QUEUE_NAME = 'call-events';

let queue = null;
let worker = null;
let connection = null;
let useRedis = false;

const redisUrl = () => process.env.REDIS_URL || process.env.REDIS_HOST || null;

const initCallQueue = () => {
  const url = redisUrl();
  if (!url) {
    console.log('[queue] REDIS_URL not set — call events processed inline (no queue).');
    return;
  }

  try {
    const IORedis = require('ioredis');
    const { Queue, Worker } = require('bullmq');

    // BullMQ requires maxRetriesPerRequest = null on the connection.
    connection = url.startsWith('redis')
      ? new IORedis(url, { maxRetriesPerRequest: null })
      : new IORedis({ host: url, port: parseInt(process.env.REDIS_PORT, 10) || 6379, maxRetriesPerRequest: null });

    connection.on('error', (err) => console.error('[queue] redis error:', err.message));

    queue = new Queue(QUEUE_NAME, { connection });

    worker = new Worker(
      QUEUE_NAME,
      async (job) => processCallEvent(job.data),
      { connection, concurrency: CONCURRENCY }
    );

    worker.on('failed', (job, err) =>
      console.error(`[queue] call job ${job?.id} failed:`, err.message));
    worker.on('completed', (job) =>
      console.log(`[queue] call job ${job.id} done.`));

    useRedis = true;
    console.log(`[queue] call worker started — concurrency ${CONCURRENCY}.`);
  } catch (err) {
    console.error('[queue] init failed, falling back to inline processing:', err.message);
    useRedis = false;
  }
};

/**
 * Enqueue a call event. Returns { queued:true, jobId } when Redis is active,
 * otherwise processes inline and returns { queued:false, callId, callStatus }.
 */
const enqueueCall = async (payload) => {
  if (useRedis && queue) {
    const job = await queue.add('ingest', payload, {
      removeOnComplete: 1000,
      removeOnFail: 5000,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    });
    return { queued: true, jobId: String(job.id) };
  }
  const result = await processCallEvent(payload);
  return { queued: false, ...result };
};

const shutdownCallQueue = async () => {
  try { if (worker) await worker.close(); } catch (_) {}
  try { if (queue) await queue.close(); } catch (_) {}
  try { if (connection) await connection.quit(); } catch (_) {}
};

module.exports = { initCallQueue, enqueueCall, shutdownCallQueue, QUEUE_NAME };
