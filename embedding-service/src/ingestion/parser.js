// embedding-service/src/ingestion/parser.js
// File-type detection and text extraction using LangChain document loaders.

const path = require("path");
const { TextLoader } = require("langchain/document_loaders/fs/text");
const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");
const { DocxLoader } = require("@langchain/community/document_loaders/fs/docx");

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

module.exports = { getLoader };
