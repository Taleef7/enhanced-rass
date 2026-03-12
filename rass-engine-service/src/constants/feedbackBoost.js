// rass-engine-service/src/constants/feedbackBoost.js
// Phase G #134: Shared constants for feedback boost multipliers.
// Used by FeedbackBoostStage.js (retrieval) and referenced by the mcp-server's
// /internal/feedback/boosts endpoint to ensure consistent values.

"use strict";

/** Score multiplier applied to chunks positively reviewed by the user. */
const DEFAULT_POSITIVE_BOOST = 1.5;

/** Score multiplier applied to chunks negatively reviewed by the user. */
const DEFAULT_NEGATIVE_PENALTY = 0.4;

module.exports = { DEFAULT_POSITIVE_BOOST, DEFAULT_NEGATIVE_PENALTY };
