// embedding-service/src/ingestion/parser.js
// File-type detection and text extraction using LangChain document loaders.
// Phase G #136: Extended with OCR fallback for scanned PDFs and image files.

"use strict";

const path = require("path");
const { TextLoader } = require("langchain/document_loaders/fs/text");
const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");
const { DocxLoader } = require("@langchain/community/document_loaders/fs/docx");
const logger = require("../logger");

// Image extensions that require OCR extraction
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".tif", ".webp"]);

/**
 * Returns the appropriate LangChain document loader for the given file path.
 * Supports PDF, DOCX, and plain text (default).
 *
 * @param {string} filePath - Absolute or relative path to the file on disk.
 * @param {string} originalName - Original filename used for extension detection.
 * @returns {TextLoader|PDFLoader|DocxLoader} An instantiated LangChain loader.
 */
function getLoader(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === ".pdf") return new PDFLoader(filePath);
  if (ext === ".docx") return new DocxLoader(filePath);
  return new TextLoader(filePath);
}

/**
 * Phase G #136: Determines whether a file is an image that should be processed via OCR.
 *
 * @param {string} originalName - Original filename.
 * @returns {boolean}
 */
function isImageFile(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Phase G #136: Runs Tesseract.js OCR on an image file and returns extracted text.
 * Falls back gracefully if tesseract.js is not installed.
 *
 * @param {string} filePath - Absolute path to the image file.
 * @returns {Promise<string>} Extracted text (may be empty if no text detected).
 */
async function extractTextViaOCR(filePath) {
  try {
    const Tesseract = require("tesseract.js");
    logger.info(`[Parser/OCR] Running OCR on ${filePath}`);
    const { data: { text } } = await Tesseract.recognize(filePath, "eng", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          // Log progress every 25%
          if (Math.round(m.progress * 100) % 25 === 0) {
            logger.debug(`[Parser/OCR] Progress: ${Math.round(m.progress * 100)}%`);
          }
        }
      },
    });
    logger.info(`[Parser/OCR] Extracted ${text.length} characters via OCR`);
    return text.trim();
  } catch (err) {
    if (err.code === "MODULE_NOT_FOUND") {
      logger.warn("[Parser/OCR] tesseract.js not installed — skipping OCR. Install with: npm install tesseract.js");
      return "";
    }
    logger.error("[Parser/OCR] OCR failed:", err.message);
    return "";
  }
}

/**
 * Phase G #136: Checks whether a PDF's extracted text content is too sparse,
 * suggesting it may be a scanned PDF that needs OCR.
 *
 * @param {object[]} docs - Array of LangChain Document objects from PDFLoader.
 * @returns {boolean} True if the PDF appears to be scanned (very little text content).
 */
function isScannedPdf(docs) {
  const totalText = docs.reduce((acc, d) => acc + (d.pageContent || "").trim().length, 0);
  const totalPages = docs.length || 1;
  const avgCharsPerPage = totalText / totalPages;
  // If the average page has fewer than 50 characters, it's likely a scanned PDF
  return avgCharsPerPage < 50;
}

module.exports = { getLoader, isImageFile, extractTextViaOCR, isScannedPdf };
