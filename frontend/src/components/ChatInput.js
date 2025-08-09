import React, { useState, useRef, useEffect } from "react";
import {
  Box,
  Typography,
  Tooltip,
  IconButton,
  TextField,
  Chip,
  CircularProgress,
} from "@mui/material";
import {
  AttachFile as AttachFileIcon,
  Send as SendIcon,
  Stop as StopIcon,
  Mic as MicIcon,
  MicOff as MicOffIcon,
} from "@mui/icons-material";
import { useChat } from "../context/ChatContext";
import { uploadFile, transcribeAudio } from "../apiClient";

const ChatInput = ({
  query,
  setQuery,
  onSend,
  onStop,
  isTyping,
  showSuggestions = true,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingError, setRecordingError] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [partialTranscript, setPartialTranscript] = useState("");
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const mediaStreamRef = useRef(null);
  const speechRecRef = useRef(null);
  const fileInputRef = useRef(null);
  // --- 1. THE FIX: Get addMessageToChat from the context ---
  const { activeChat, addDocumentToChat, addMessageToChat } = useChat();
  const uploadedDocuments = activeChat ? activeChat.documents : [];

  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleFileSelect = async (file) => {
    if (!file || !activeChat) return;

    setIsUploading(true);
    try {
      await uploadFile(file);
      const newDoc = { name: file.name, size: file.size, type: file.type };
      addDocumentToChat(activeChat.id, newDoc);
      // --- 2. THE FIX: Use the function to add a system message ---
      addMessageToChat(activeChat.id, {
        sender: "system",
        text: `📄 Document "${file.name}" has been successfully uploaded and is ready for use in this chat.`,
      });
    } catch (error) {
      console.error("File upload failed in ChatInput:", error);
      // --- 3. THE FIX: Also use it for error messages ---
      addMessageToChat(activeChat.id, {
        sender: "system",
        text: `Error uploading "${file.name}": ${error.message}`,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  // Voice recording handlers
  const startRecording = async () => {
    try {
      setRecordingError("");
      setPartialTranscript("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      // Choose the best supported MIME type
      let mimeType = "audio/webm";
      if (
        window.MediaRecorder &&
        typeof MediaRecorder.isTypeSupported === "function"
      ) {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          mimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          mimeType = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) {
          mimeType = "audio/ogg;codecs=opus";
        } else {
          mimeType = "audio/webm"; // fallback
        }
      }
      const recorder = new MediaRecorder(stream, { mimeType });
      recordedChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };
      recorder.onstop = async () => {
        try {
          const blob = new Blob(recordedChunksRef.current, {
            type: mimeType.includes("ogg") ? "audio/ogg" : "audio/webm",
          });
          if (blob.size === 0) return;
          setIsTranscribing(true);
          let text = "";
          try {
            text = await transcribeAudio(blob);
          } catch (err) {
            // If unauthorized, surface a friendly message in chat
            if (activeChat) {
              addMessageToChat(activeChat.id, {
                sender: "system",
                text: `Transcription failed (${err.message}). Please log in to continue.`,
              });
            }
            throw err;
          }
          if (text) setQuery((prev) => (prev ? `${prev} ${text}` : text));
        } catch (err) {
          console.error("Transcription failed:", err);
          setRecordingError(err.message || "Transcription error");
        } finally {
          setIsTranscribing(false);
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((t) => t.stop());
            mediaStreamRef.current = null;
          }
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);

      // Optional: Live preview via Web Speech API if supported
      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const rec = new SpeechRecognition();
          rec.interimResults = true;
          rec.continuous = true;
          rec.lang = navigator.language || "en-US";
          rec.onresult = (event) => {
            let interim = "";
            for (let i = event.resultIndex; i < event.results.length; i++) {
              const res = event.results[i];
              if (!res.isFinal) {
                interim += res[0].transcript;
              }
            }
            if (interim) setPartialTranscript(interim.trim());
          };
          rec.onerror = () => {
            // Ignore SR errors; Whisper is the source of truth
          };
          rec.onend = () => {
            // no-op
          };
          rec.start();
          speechRecRef.current = rec;
        } catch (e) {
          // If SR fails, ignore
        }
      }
    } catch (err) {
      console.error("Mic access error:", err);
      setRecordingError("Microphone access denied or unavailable.");
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    try {
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      if (speechRecRef.current) {
        try {
          speechRecRef.current.stop();
        } catch {
          // Ignore speech recognition cleanup errors
        }
        speechRecRef.current = null;
      }
    } catch (e) {
      // noop
    } finally {
      setIsRecording(false);
    }
  };

  // Toggle handler (click to start/stop)
  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state !== "inactive"
        ) {
          mediaRecorderRef.current.stop();
        }
      } catch {}
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
      }
      if (speechRecRef.current) {
        try {
          speechRecRef.current.stop();
        } catch {}
        speechRecRef.current = null;
      }
    };
  }, []);

  return (
    <Box
      sx={{
        p: 2,
        backgroundColor: "transparent",
        borderTop: 0,
        position: "relative",
      }}
    >
      {/* Centered container like Gemini */}
      <Box
        sx={{
          maxWidth: "768px", // Same as MessageList
          width: "100%",
          mx: "auto", // Center horizontally
        }}
      >
        {/* Smart suggestions (visible when input empty) */}
        {showSuggestions && !query.trim() && (
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
            {[
              "Summarize the key points from my uploaded PDFs",
              "Explain this concept with an analogy",
              "Draft an email reply using my documents",
              "List citations with quotes and sources",
            ].map((s, i) => (
              <Chip
                key={i}
                label={s}
                size="small"
                onClick={() => setQuery(s)}
                sx={{
                  bgcolor: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  "&:hover": {
                    bgcolor: "rgba(255,255,255,0.07)",
                  },
                }}
              />
            ))}
          </Box>
        )}
        {/* Uploaded Documents Indicator */}
        {uploadedDocuments.length > 0 && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              mb: 2,
              flexWrap: "wrap",
            }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ mr: 1 }}>
              Using documents:
            </Typography>
            {uploadedDocuments.slice(0, 3).map((doc, index) => (
              <Chip
                key={index}
                label={doc.name}
                size="small"
                variant="outlined"
                sx={{ fontSize: "0.75rem" }}
              />
            ))}
            {uploadedDocuments.length > 3 && (
              <Chip
                label={`+${uploadedDocuments.length - 3} more`}
                size="small"
                variant="outlined"
                sx={{ fontSize: "0.75rem" }}
              />
            )}
          </Box>
        )}

        {/* Input Area - Modern gradient ring with frosted inner */}
        <Box
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          sx={{
            display: "flex",
            gap: 2,
            alignItems: "flex-end",
            borderRadius: "24px",
            p: 0.75, // compact
            pl: 2,
            backgroundColor: "rgba(10,10,10,0.85)",
            backdropFilter: "saturate(120%) blur(10px)",
            border: "1px solid rgba(255,255,255,0.06)", // thinner border
            transition: "all 0.2s ease",
            "&:focus-within": {
              borderColor: "primary.main",
              boxShadow: "0 0 0 3px rgba(138,180,248,0.12)",
            },
          }}
        >
          <Tooltip title="Attach file">
            <IconButton
              size="small"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isTyping}
              sx={{
                color: "text.secondary",
                "&:hover": { color: "primary.main" },
              }}
            >
              {isUploading ? (
                <CircularProgress size={20} />
              ) : (
                <AttachFileIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>

          <input
            ref={fileInputRef}
            type="file"
            onChange={(e) => handleFileSelect(e.target.files[0])}
            style={{ display: "none" }}
            accept=".pdf,.txt,.md,.doc,.docx"
          />

          <TextField
            fullWidth
            multiline
            minRows={1}
            maxRows={6}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask anything about your documents..."
            variant="standard"
            disabled={isTyping || isUploading}
            InputProps={{
              disableUnderline: true,
            }}
            sx={{
              "& .MuiInputBase-input": {
                fontSize: "1rem",
                lineHeight: 1.5,
                py: 1,
              },
              "& .MuiInput-input": {
                padding: "8px 0",
              },
            }}
          />

          {/* Right-aligned status indicators */}
          {isTranscribing && (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mr: 1 }}>
              <CircularProgress size={18} />
              <Typography variant="caption" color="text.secondary">
                Transcribing…
              </Typography>
            </Box>
          )}

          {/* Voice Input */}
          <Tooltip title={isRecording ? "Stop recording" : "Start voice input"}>
            <span>
              <IconButton
                onClick={toggleRecording}
                disabled={isTyping || isUploading}
                sx={{
                  width: 36,
                  height: 36,
                  backgroundColor: isRecording ? "error.main" : "action.hover",
                  color: isRecording ? "#fff" : "text.secondary",
                  "&:hover": {
                    backgroundColor: isRecording
                      ? "error.dark"
                      : "action.selected",
                  },
                }}
              >
                {isRecording ? (
                  <MicOffIcon fontSize="small" />
                ) : (
                  <MicIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>

          <Tooltip title={isTyping ? "Stop generation" : "Send message"}>
            <span>
              <IconButton
                onClick={() => (isTyping ? onStop?.() : onSend?.())}
                disabled={!query.trim() || isTyping || isUploading}
                color={isTyping ? "error" : "primary"}
                sx={{
                  width: 36,
                  height: 36,
                  backgroundColor:
                    !query.trim() || isTyping || isUploading
                      ? "action.disabledBackground"
                      : "primary.main",
                  color:
                    !query.trim() || isTyping || isUploading
                      ? "action.disabled"
                      : "white",
                  "&:hover": {
                    backgroundColor:
                      !query.trim() || isTyping || isUploading
                        ? "action.disabledBackground"
                        : "primary.dark",
                  },
                }}
              >
                {isTyping ? (
                  <StopIcon fontSize="small" />
                ) : (
                  <SendIcon fontSize="small" />
                )}
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        {/* Drag-and-drop overlay */}
        {isDragging && (
          <Box
            sx={{
              position: "fixed",
              inset: 0,
              bgcolor: "rgba(138,180,248,0.08)",
              border: "2px dashed rgba(138,180,248,0.5)",
              pointerEvents: "none",
            }}
          />
        )}

        {/* Below-input live preview and errors */}
        {(isRecording || partialTranscript || recordingError) && (
          <Box sx={{ mt: 1, display: "flex", alignItems: "center", gap: 2 }}>
            {isRecording && (
              <Chip
                color="error"
                label="Recording…"
                size="small"
                sx={{ height: 22 }}
              />
            )}
            {partialTranscript && isRecording && (
              <Typography
                variant="caption"
                color="text.secondary"
                noWrap
                sx={{ maxWidth: "100%" }}
              >
                Live: {partialTranscript}
              </Typography>
            )}
            {recordingError && (
              <Typography variant="caption" color="error.main">
                {recordingError}
              </Typography>
            )}
          </Box>
        )}
        {/* Keyboard hint */}
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            display: "block",
            mt: 0.5,
            mb: 0.25,
            textAlign: "center",
            opacity: 0.8,
          }}
        >
          Press Enter to send • Shift+Enter for a new line
        </Typography>
      </Box>
    </Box>
  );
};

export default ChatInput;
