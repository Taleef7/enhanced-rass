const { v4: uuidv4 } = require("uuid");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");

async function createChunkers(chunkingConfig) {
  const parentSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: chunkingConfig.parentSize,
    chunkOverlap: chunkingConfig.parentOverlap,
  });

  const childSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: chunkingConfig.childSize,
    chunkOverlap: chunkingConfig.childOverlap,
  });

  return { parentSplitter, childSplitter };
}

async function splitDocuments(docs, parentSplitter, childSplitter) {
  const parentChunks = await parentSplitter.splitDocuments(docs);
  const parentDocIds = parentChunks.map(() => uuidv4());

  const childChunks = [];

  for (let i = 0; i < parentChunks.length; i++) {
    const subDocs = await childSplitter.splitDocuments([parentChunks[i]]);

    subDocs.forEach((doc) => {
      doc.metadata.parentId = parentDocIds[i];
      doc.metadata.userId = parentChunks[i].metadata.userId;
      doc.metadata.originalFilename = parentChunks[i].metadata.originalFilename;
      doc.metadata.uploadedAt = parentChunks[i].metadata.uploadedAt;
      childChunks.push(doc);
    });
  }

  return { parentChunks, parentDocIds, childChunks };
}

module.exports = {
  createChunkers,
  splitDocuments,
};
