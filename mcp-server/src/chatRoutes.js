// mcp-server/src/chatRoutes.js
const { Router } = require("express");
const { PrismaClient } = require("@prisma/client");
const authMiddleware = require("./authMiddleware.js");

const prisma = new PrismaClient();
const router = Router();

// Apply authentication middleware to all chat routes
router.use(authMiddleware);

// === GET /api/chats - Get all chats for authenticated user ===
router.get("/", async (req, res) => {
  try {
    const userId = req.userId; // From auth middleware
    console.log("[CHAT LIST] Fetching chats for userId:", userId);

    const chats = await prisma.chat.findMany({
      where: { userId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
        documents: true,
      },
      orderBy: { updatedAt: "desc" },
    });

    console.log(`[CHAT LIST] Found ${chats.length} chats for user ${userId}`);
    res.json(chats);
  } catch (error) {
    console.error("Error fetching chats:", error);
    res.status(500).json({ error: "Failed to fetch chats" });
  }
});

// === GET /api/chats/:chatId - Get specific chat ===
router.get("/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.userId;

    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        userId,
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
        documents: true,
      },
    });

    if (!chat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    res.json(chat);
  } catch (error) {
    console.error("Error fetching chat:", error);
    res.status(500).json({ error: "Failed to fetch chat" });
  }
});

// === POST /api/chats - Create new chat ===
router.post("/", async (req, res) => {
  try {
    const { title } = req.body;
    const userId = req.userId;

    // Debug logging
    console.log("[CHAT CREATE] userId:", userId);
    console.log("[CHAT CREATE] req.user:", req.user);
    console.log("[CHAT CREATE] title:", title);

    if (!userId) {
      console.error("[CHAT CREATE] No userId found - authentication failed");
      return res.status(401).json({ error: "Authentication required" });
    }

    const chat = await prisma.chat.create({
      data: {
        title: title || "New Chat",
        user: {
          connect: { id: userId },
        },
      },
    });

    console.log("[CHAT CREATE] Success:", chat.id);
    res.status(201).json(chat);
  } catch (error) {
    console.error("Error creating chat:", error);
    res.status(500).json({ error: "Failed to create chat" });
  }
});

// === PATCH /api/chats/:chatId - Update chat (rename) ===
router.patch("/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { title } = req.body;
    const userId = req.userId;

    // Check if chat belongs to user
    const existingChat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        userId,
      },
    });

    if (!existingChat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    const updatedChat = await prisma.chat.update({
      where: { id: chatId },
      data: {
        title,
        updatedAt: new Date(),
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
        documents: true,
      },
    });

    res.json(updatedChat);
  } catch (error) {
    console.error("Error updating chat:", error);
    res.status(500).json({ error: "Failed to update chat" });
  }
});

// === DELETE /api/chats/:chatId - Delete chat ===
router.delete("/:chatId", async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.userId;

    // Check if chat belongs to user
    const existingChat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        userId,
      },
    });

    if (!existingChat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    await prisma.chat.delete({
      where: { id: chatId },
    });

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting chat:", error);
    res.status(500).json({ error: "Failed to delete chat" });
  }
});

// === POST /api/chats/:chatId/messages - Add message to chat ===
router.post("/:chatId/messages", async (req, res) => {
  try {
    const { chatId } = req.params;
    const { text, sender, sources } = req.body;
    const userId = req.userId;

    // Check if chat belongs to user
    const existingChat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        userId,
      },
    });

    if (!existingChat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // Create the message
    const message = await prisma.message.create({
      data: {
        text,
        sender,
        chatId,
        sources: sources ? sources : null, // Store sources as JSON
      },
    });

    // Update chat's updatedAt timestamp
    await prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    res.status(201).json(message);
  } catch (error) {
    console.error("Error adding message:", error);
    res.status(500).json({ error: "Failed to add message" });
  }
});

// === PATCH /api/chats/:chatId/messages/:messageId - Update message ===
router.patch("/:chatId/messages/:messageId", async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const { text, sources } = req.body;
    const userId = req.userId;

    // Check if chat belongs to user
    const existingChat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        userId,
      },
    });

    if (!existingChat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // Update the message
    const updatedMessage = await prisma.message.update({
      where: {
        id: messageId,
        chatId, // Double check message belongs to this chat
      },
      data: {
        ...(text !== undefined && { text }),
        ...(sources !== undefined && { sources: sources ? JSON.stringify(sources) : null }),
      },
    });

    // Update chat's updatedAt timestamp
    await prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    console.log(`[MESSAGE UPDATE] Updated message ${messageId} in chat ${chatId}`);
    res.json(updatedMessage);
  } catch (error) {
    console.error("Error updating message:", error);
    res.status(500).json({ error: "Failed to update message" });
  }
});

// === DELETE /api/chats/:chatId/messages/:messageId - Delete message ===
router.delete("/:chatId/messages/:messageId", async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const userId = req.userId;

    // Check if chat belongs to user
    const existingChat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        userId,
      },
    });

    if (!existingChat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // Delete message (documents will be cascade deleted)
    await prisma.message.delete({
      where: {
        id: messageId,
        chatId, // Double check message belongs to this chat
      },
    });

    // Update chat's updatedAt timestamp
    await prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting message:", error);
    res.status(500).json({ error: "Failed to delete message" });
  }
});

// === DELETE /api/chats/:chatId/documents/cleanup - Clean up source documents ===
router.delete("/:chatId/documents/cleanup", async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.userId;

    // Check if chat belongs to user
    const existingChat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        userId,
      },
    });

    if (!existingChat) {
      return res.status(404).json({ error: "Chat not found" });
    }

    // Delete all chat documents with "Unknown Document" name (these are polluted source docs)
    const result = await prisma.chatDocument.deleteMany({
      where: {
        chatId: chatId,
        name: "Unknown Document",
      },
    });

    console.log(`[CLEANUP] Deleted ${result.count} polluted documents from chat ${chatId}`);
    res.json({ message: `Cleaned up ${result.count} documents`, deleted: result.count });
  } catch (error) {
    console.error("Error cleaning up chat documents:", error);
    res.status(500).json({ error: "Failed to clean up documents" });
  }
});

module.exports = router;
