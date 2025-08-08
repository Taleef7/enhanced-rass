// In mcp-server/src/authMiddleware.js
const jwt = require("jsonwebtoken");

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn(
    "Warning: JWT_SECRET is not set. Using an insecure default value for development."
  );
  JWT_SECRET = "insecure-default-secret-for-dev";
}

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: No token provided." });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // console.log("[AUTH] Decoded JWT:", decoded);  // Commented out to reduce log noise
    req.user = decoded;
    req.userId = decoded.userId; // Extract userId for easy access
    // console.log("[AUTH] Set req.userId:", req.userId);  // Commented out to reduce log noise
    next();
  } catch (error) {
    console.log("[AUTH] JWT verification failed:", error.message);
    return res.status(401).json({ error: "Unauthorized: Invalid token." });
  }
};

module.exports = authMiddleware;
