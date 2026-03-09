const path = require("path");
const { TextLoader } = require("langchain/document_loaders/fs/text");
const { PDFLoader } = require("@langchain/community/document_loaders/fs/pdf");
const { DocxLoader } = require("@langchain/community/document_loaders/fs/docx");

async function loadDocument(filePath, originalFilename, userId) {
  const ext = path.extname(originalFilename).toLowerCase();

  const LoaderClass =
    ext === ".pdf" ? PDFLoader :
    ext === ".docx" ? DocxLoader :
    TextLoader;

  const loader = new LoaderClass(filePath);
  const docs = await loader.load();

  docs.forEach((doc) => {
    doc.metadata.userId = userId;
    doc.metadata.originalFilename = originalFilename;
    doc.metadata.uploadedAt = new Date().toISOString();
  });

  return docs;
}

module.exports = { loadDocument };
