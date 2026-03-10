// embedding-service/src/ingestion/chunker.js
// Parent/child document splitting logic configured from config.yml.

const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
const {
  PARENT_CHUNK_SIZE,
  PARENT_CHUNK_OVERLAP,
  CHILD_CHUNK_SIZE,
  CHILD_CHUNK_OVERLAP,
} = require("../config");

const parentSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: PARENT_CHUNK_SIZE,
  chunkOverlap: PARENT_CHUNK_OVERLAP,
});

const childSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHILD_CHUNK_SIZE,
  chunkOverlap: CHILD_CHUNK_OVERLAP,
});

module.exports = { parentSplitter, childSplitter };
