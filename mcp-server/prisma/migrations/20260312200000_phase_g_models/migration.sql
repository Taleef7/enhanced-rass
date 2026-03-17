-- Migration: 20260312200000_phase_g_models
-- Phase G: Adaptive retrieval feedback, knowledge graph, collaborative annotations, chat sharing

-- Core chat persistence tables used by the current gateway routes.
CREATE TABLE "chats" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chats_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "chats" ADD CONSTRAINT "chats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "messages" (
  "id" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "sender" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "sources" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "messages" ADD CONSTRAINT "messages_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "chat_documents" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "size" INTEGER,
  "chatId" TEXT NOT NULL,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chat_documents_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "chat_documents" ADD CONSTRAINT "chat_documents_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase G #134: Adaptive Retrieval Feedback
CREATE TABLE "RetrievalFeedback" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "chatMessageId" TEXT,
  "citationId" TEXT,
  "feedbackType" TEXT NOT NULL,
  "chunkId" TEXT,
  "documentId" TEXT,
  "documentName" TEXT,
  "query" TEXT,
  "abGroup" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RetrievalFeedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RetrievalFeedback_userId_createdAt_idx" ON "RetrievalFeedback"("userId", "createdAt");
CREATE INDEX "RetrievalFeedback_documentId_idx" ON "RetrievalFeedback"("documentId");

-- Phase G #137: Knowledge Graph
CREATE TABLE "Entity" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "description" TEXT,
  "kbId" TEXT NOT NULL,
  "documentId" TEXT,
  "chunkId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Entity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Entity_kbId_idx" ON "Entity"("kbId");
CREATE INDEX "Entity_name_kbId_idx" ON "Entity"("name", "kbId");

CREATE TABLE "Relation" (
  "id" TEXT NOT NULL,
  "subjectId" TEXT NOT NULL,
  "predicate" TEXT NOT NULL,
  "objectId" TEXT NOT NULL,
  "kbId" TEXT NOT NULL,
  "chunkId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Relation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Relation_kbId_idx" ON "Relation"("kbId");
CREATE INDEX "Relation_subjectId_idx" ON "Relation"("subjectId");
CREATE INDEX "Relation_objectId_idx" ON "Relation"("objectId");
ALTER TABLE "Relation" ADD CONSTRAINT "Relation_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Relation" ADD CONSTRAINT "Relation_objectId_fkey" FOREIGN KEY ("objectId") REFERENCES "Entity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase G #138: Collaborative Annotations
CREATE TYPE "AnnotationType" AS ENUM ('NOTE', 'FLAG_OUTDATED', 'FLAG_INCORRECT', 'AUTHORITATIVE', 'BOOKMARK');
CREATE TABLE "Annotation" (
  "id" TEXT NOT NULL,
  "chunkId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "annotationType" "AnnotationType" NOT NULL,
  "content" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Annotation_chunkId_idx" ON "Annotation"("chunkId");
CREATE INDEX "Annotation_documentId_idx" ON "Annotation"("documentId");
CREATE INDEX "Annotation_userId_idx" ON "Annotation"("userId");
CREATE INDEX "Annotation_workspaceId_idx" ON "Annotation"("workspaceId");
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase G #138: Shareable Chat Links
CREATE TABLE "SharedChat" (
  "id" TEXT NOT NULL,
  "chatId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  CONSTRAINT "SharedChat_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SharedChat_token_key" ON "SharedChat"("token");
CREATE INDEX "SharedChat_chatId_idx" ON "SharedChat"("chatId");
ALTER TABLE "SharedChat" ADD CONSTRAINT "SharedChat_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "chats"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SharedChat" ADD CONSTRAINT "SharedChat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
