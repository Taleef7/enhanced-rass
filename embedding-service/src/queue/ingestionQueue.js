// embedding-service/src/queue/ingestionQueue.js
// Defines the BullMQ queue used for async document ingestion jobs.
// The queue is named "rass:ingestion" and is backed by the shared Redis instance.

"use strict";

const { Queue } = require("bullmq");
const { REDIS_HOST, REDIS_PORT, REDIS_DB } = require("../config");

const connection = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  db: REDIS_DB,
};

const ingestionQueue = new Queue("rass:ingestion", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { age: 3600, count: 500 }, // keep 1 h or last 500
    removeOnFail: { age: 86400 },               // keep failures 24 h for debugging
  },
});

ingestionQueue.on("error", (err) => {
  console.error("[Queue] ingestionQueue error:", err.message);
});

module.exports = { ingestionQueue, connection };
