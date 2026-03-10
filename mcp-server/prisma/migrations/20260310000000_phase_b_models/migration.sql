-- Phase B: Document Registry, ETL Provenance, Knowledge Base, Audit Log
-- Migration: 20260310000000_phase_b_models

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('QUEUED', 'PROCESSING', 'READY', 'FAILED', 'DELETED');

-- CreateEnum
CREATE TYPE "KBRole" AS ENUM ('OWNER', 'EDITOR', 'VIEWER');

-- AlterTable: add Phase B relations to User (no DDL needed; handled by FK on child tables)

-- CreateTable: Document
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'QUEUED',
    "chunkCount" INTEGER,
    "errorMessage" TEXT,
    "openSearchIndex" TEXT NOT NULL DEFAULT 'knowledge_base',
    "redisKeyPrefix" TEXT,
    "ingestionJobId" TEXT,
    "kbId" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DocumentProvenance
CREATE TABLE "DocumentProvenance" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ingestionJobId" TEXT NOT NULL,
    "rawFileSha256" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "pageCount" INTEGER,
    "chunkingStrategy" JSONB NOT NULL,
    "embeddingModel" TEXT NOT NULL,
    "embeddingDim" INTEGER NOT NULL,
    "chunkCount" INTEGER NOT NULL,
    "parentCount" INTEGER NOT NULL,
    "stagesMs" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentProvenance_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AuditLog
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "outcome" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable: KnowledgeBase
CREATE TABLE "KnowledgeBase" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "ownerId" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "openSearchIndex" TEXT NOT NULL,
    "embeddingModel" TEXT NOT NULL,
    "embedDim" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id")
);

-- CreateTable: KBMember
CREATE TABLE "KBMember" (
    "id" TEXT NOT NULL,
    "kbId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "KBRole" NOT NULL DEFAULT 'VIEWER',

    CONSTRAINT "KBMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentProvenance_documentId_key" ON "DocumentProvenance"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeBase_openSearchIndex_key" ON "KnowledgeBase"("openSearchIndex");

-- CreateIndex
CREATE UNIQUE INDEX "KBMember_kbId_userId_key" ON "KBMember"("kbId", "userId");

-- AddForeignKey: Document → User
ALTER TABLE "Document" ADD CONSTRAINT "Document_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: Document → KnowledgeBase
ALTER TABLE "Document" ADD CONSTRAINT "Document_kbId_fkey" FOREIGN KEY ("kbId") REFERENCES "KnowledgeBase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: DocumentProvenance → Document
ALTER TABLE "DocumentProvenance" ADD CONSTRAINT "DocumentProvenance_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: KnowledgeBase → User
ALTER TABLE "KnowledgeBase" ADD CONSTRAINT "KnowledgeBase_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: KBMember → KnowledgeBase
ALTER TABLE "KBMember" ADD CONSTRAINT "KBMember_kbId_fkey" FOREIGN KEY ("kbId") REFERENCES "KnowledgeBase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: KBMember → User
ALTER TABLE "KBMember" ADD CONSTRAINT "KBMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
