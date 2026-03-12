// rass-engine-service/src/retrieval/Stage.js
// Base class for all retrieval pipeline stages.
// Each stage receives a context object, performs its work, and returns the (potentially modified) context.

"use strict";

class Stage {
  constructor(name) {
    this.name = name || this.constructor.name;
  }

  /**
   * Execute the stage logic.
   * Subclasses must override this method.
   *
   * @param {object} context - The shared pipeline context.
   * @returns {Promise<object>} The updated context.
   */
  async run(context) {
    throw new Error(`Stage "${this.name}" must implement run(context).`);
  }
}

module.exports = { Stage };
