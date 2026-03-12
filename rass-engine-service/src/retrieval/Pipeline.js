// rass-engine-service/src/retrieval/Pipeline.js
// Executes an ordered array of Stage objects, threading a context object through each.
// Records wall-clock time per stage and logs structured JSON at INFO level.

const logger = require("../logger");
"use strict";

class Pipeline {
  /**
   * @param {import('./Stage').Stage[]} stages - Ordered list of stages to execute.
   */
  constructor(stages) {
    if (!Array.isArray(stages)) {
      throw new TypeError("Pipeline requires an array of Stage objects.");
    }
    this.stages = stages;
  }

  /**
   * Run all stages in order, threading the context through each.
   * Stage timings are recorded in context.stageTimes.
   *
   * @param {object} context - The initial pipeline context (created by createContext()).
   * @returns {Promise<object>} The final context after all stages have executed.
   */
  async run(context) {
    logger.info(
      `[Pipeline] Starting pipeline with ${this.stages.length} stages: [${this.stages.map((s) => s.name).join(" → ")}]`
    );
    const pipelineStart = Date.now();

    for (const stage of this.stages) {
      const stageStart = Date.now();
      try {
        context = await stage.run(context);
      } catch (err) {
        logger.error(`[Pipeline] Stage "${stage.name}" threw an error:`, err.message);
        throw err;
      }
      const elapsed = Date.now() - stageStart;
      context.stageTimes[stage.name] = elapsed;
      logger.info(
        JSON.stringify({
          level: "INFO",
          pipeline: "retrieval",
          stage: stage.name,
          durationMs: elapsed,
        })
      );
    }

    const totalMs = Date.now() - pipelineStart;
    logger.info(
      JSON.stringify({
        level: "INFO",
        pipeline: "retrieval",
        stage: "TOTAL",
        durationMs: totalMs,
        stageTimes: context.stageTimes,
      })
    );

    return context;
  }
}

module.exports = { Pipeline };
