import React, { useEffect, useRef, useState } from "react";
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AttachFile as AttachFileIcon,
  Mic as MicIcon,
  MicOff as MicOffIcon,
  Send as SendIcon,
  Stop as StopIcon,
} from "@mui/icons-material";
import { useChat } from "../context/ChatContext";
import { useAuth } from "../context/AuthContext";
import { uploadFile, transcribeAudio } from "../apiClient";

const STATUS_LABELS = {
  READY: "ready",
  PROCESSING: "processing",
  QUEUED: "queued",
  FAILED: "failed",
};

const TOP_K_OPTIONS = [3, 5, 10, 20];

const ChatInput = ({
  query,
  setQuery,
  onSend,
  onStop,
  isTyping,
  topK = 10,
  onTopKChange,
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

  const { activeChat, addDocumentToChat, addMessageToChat } = useChat();
  const { token } = useAuth();
  const uploadedDocuments = activeChat ? activeChat.documents : [];

  const handleSend = () => {
    if (!query.trim() || isTyping || isUploading) return;
    onSend();
  };

  const handleFileSelect = async (file) => {
    if (!file || !activeChat) return;

    setIsUploading(true);

    try {
      const response = await uploadFile(file, null, null, token);
      const newDocument = {
        name: file.name,
        size: file.size,
        type: file.type,
        status: "QUEUED",
        jobId: response?.data?.jobId,
      };

      addDocumentToChat(activeChat.id, newDocument);
      addMessageToChat(activeChat.id, {
        sender: "system",
        text: `Document "${file.name}" was uploaded and queued for ingestion. Wait for READY status before relying on it in answers.`,
      });
    } catch (error) {
      console.error("File upload failed in ChatInput:", error);
      addMessageToChat(activeChat.id, {
        sender: "system",
        text: `Error uploading "${file.name}": ${error.message}`,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const startRecording = async () => {
    try {
      setRecordingError("");
      setPartialTranscript("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

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
        }
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      recordedChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
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
            text = await transcribeAudio(blob, token);
          } catch (error) {
            if (activeChat) {
              addMessageToChat(activeChat.id, {
                sender: "system",
                text: `Transcription failed (${error.message}). Please log in again and retry.`,
              });
            }
            throw error;
          }

          if (text) {
            setQuery((previous) => (previous ? `${previous} ${text}` : text));
          }
        } catch (error) {
          console.error("Transcription failed:", error);
          setRecordingError(error.message || "Transcription failed.");
        } finally {
          setIsTranscribing(false);
          if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach((track) => track.stop());
            mediaStreamRef.current = null;
          }
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);

      const SpeechRecognition =
        window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          const recognition = new SpeechRecognition();
          recognition.interimResults = true;
          recognition.continuous = true;
          recognition.lang = navigator.language || "en-US";
          recognition.onresult = (event) => {
            let interim = "";
            for (let index = event.resultIndex; index < event.results.length; index += 1) {
              const result = event.results[index];
              if (!result.isFinal) {
                interim += result[0].transcript;
              }
            }
            if (interim) setPartialTranscript(interim.trim());
          };
          recognition.start();
          speechRecRef.current = recognition;
        } catch (error) {
          console.warn("Speech recognition preview unavailable:", error);
        }
      }
    } catch (error) {
      console.error("Mic access error:", error);
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
        speechRecRef.current.stop();
        speechRecRef.current = null;
      }
    } finally {
      setIsRecording(false);
    }
  };

  useEffect(() => {
    return () => {
      try {
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state !== "inactive"
        ) {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // Ignore recorder cleanup failures.
      }

      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      }

      if (speechRecRef.current) {
        try {
          speechRecRef.current.stop();
        } catch {
          // Ignore speech recognition cleanup failures.
        }
      }
    };
  }, []);

  return (
    <Box
      data-tour="chat-input"
      sx={{ display: "grid", gap: 1 }}
    >
      {/* Document status chips */}
      {uploadedDocuments.length > 0 ? (
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {uploadedDocuments.slice(0, 4).map((document, index) => (
            <Chip
              key={`${document.name}-${index}`}
              label={`${document.name} — ${STATUS_LABELS[document.status] || document.status || "unknown"}`}
              size="small"
              variant="outlined"
              color={
                document.status === "READY"
                  ? "primary"
                  : document.status === "FAILED"
                  ? "error"
                  : "default"
              }
            />
          ))}
          {uploadedDocuments.length > 4 ? (
            <Chip
              label={`+${uploadedDocuments.length - 4} more`}
              size="small"
              variant="outlined"
            />
          ) : null}
        </Stack>
      ) : null}

      {/* Input container */}
      <Box
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          const file = event.dataTransfer.files?.[0];
          if (file) handleFileSelect(file);
        }}
        sx={{
          border: isDragging ? "2px solid #0052FF" : "1px solid #E2E8F0",
          borderRadius: "12px",
          backgroundColor: isDragging ? "rgba(0,82,255,0.03)" : "#FFFFFF",
          transition: "border-color 150ms, box-shadow 150ms",
          boxShadow: isDragging ? "0 0 0 3px rgba(0,82,255,0.12)" : "0 1px 3px rgba(15,23,42,0.06)",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-end",
            px: 1,
            pt: 1,
          }}
        >
          <Tooltip title="Attach document (PDF, TXT, MD, DOC, DOCX)">
            <span data-tour="upload-btn">
              <IconButton
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading || isTyping}
                aria-label="Upload document"
                size="small"
              >
                {isUploading ? (
                  <CircularProgress size={16} />
                ) : (
                  <AttachFileIcon sx={{ fontSize: 18 }} />
                )}
              </IconButton>
            </span>
          </Tooltip>

          <input
            ref={fileInputRef}
            type="file"
            hidden
            accept=".pdf,.txt,.md,.doc,.docx"
            onChange={(event) => handleFileSelect(event.target.files?.[0])}
          />

          <TextField
            fullWidth
            multiline
            minRows={1}
            maxRows={6}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask anything…"
            variant="standard"
            disabled={isTyping || isUploading}
            InputProps={{
              disableUnderline: true,
              "aria-label": "Question input",
            }}
            sx={{
              px: 1,
              "& .MuiInputBase-root": {
                alignItems: "flex-start",
                fontFamily: '"Inter", system-ui, sans-serif',
              },
              "& .MuiInputBase-input": {
                py: 1,
                fontSize: "0.95rem",
                lineHeight: 1.65,
                color: "#0F172A",
                "&::placeholder": {
                  color: "#94A3B8",
                  opacity: 1,
                },
              },
            }}
          />

          <Tooltip title={isRecording ? "Stop recording" : "Voice input"}>
            <span>
              <IconButton
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isTyping || isUploading}
                aria-label={isRecording ? "Stop recording" : "Start voice input"}
                size="small"
                sx={{
                  color: isRecording ? "#0052FF" : "#94A3B8",
                  backgroundColor: isRecording ? "rgba(0,82,255,0.10)" : "transparent",
                  border: isRecording ? "1px solid #0052FF" : "1px solid transparent",
                  borderRadius: "8px",
                }}
              >
                {isRecording ? (
                  <MicOffIcon sx={{ fontSize: 18 }} />
                ) : (
                  <MicIcon sx={{ fontSize: 18 }} />
                )}
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        {/* Bottom bar: Top-K selector + status indicators + send */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 1.5,
            pb: 1,
            pt: 0.5,
            borderTop: "1px solid #E2E8F0",
            mt: 0.5,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
            {/* Top-K sources selector */}
            {onTopKChange && (
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
                <Typography
                  sx={{
                    fontSize: "0.62rem",
                    fontFamily: '"JetBrains Mono", monospace',
                    color: "#94A3B8",
                    letterSpacing: "0.04em",
                    mr: 0.25,
                  }}
                >
                  sources:
                </Typography>
                {TOP_K_OPTIONS.map((k) => (
                  <Box
                    key={k}
                    role="button"
                    tabIndex={0}
                    onClick={() => onTopKChange(k)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") onTopKChange(k);
                    }}
                    sx={{
                      px: 0.75,
                      py: 0.25,
                      cursor: "pointer",
                      borderRadius: "4px",
                      backgroundColor: topK === k ? "rgba(0,82,255,0.10)" : "transparent",
                      border: topK === k ? "1px solid rgba(0,82,255,0.3)" : "1px solid transparent",
                      "&:hover": { backgroundColor: "rgba(0,82,255,0.06)" },
                    }}
                  >
                    <Typography
                      sx={{
                        fontSize: "0.62rem",
                        fontFamily: '"JetBrains Mono", monospace',
                        color: topK === k ? "#0052FF" : "#94A3B8",
                        letterSpacing: "0.04em",
                        fontWeight: topK === k ? 600 : 400,
                        lineHeight: 1.4,
                      }}
                    >
                      {k}
                    </Typography>
                  </Box>
                ))}
              </Box>
            )}

            <Box aria-live="polite" sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {isUploading ? (
                <Typography
                  sx={{
                    fontSize: "0.62rem",
                    fontFamily: '"JetBrains Mono", monospace',
                    color: "#64748B",
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                  }}
                >
                  <CircularProgress size={8} sx={{ color: "#64748B" }} />
                  uploading…
                </Typography>
              ) : null}
              {isTranscribing ? (
                <Typography
                  sx={{
                    fontSize: "0.62rem",
                    fontFamily: '"JetBrains Mono", monospace',
                    color: "#64748B",
                    display: "flex",
                    alignItems: "center",
                    gap: 0.5,
                  }}
                >
                  <CircularProgress size={8} sx={{ color: "#64748B" }} />
                  transcribing…
                </Typography>
              ) : null}
              {isRecording ? (
                <Typography
                  sx={{
                    fontSize: "0.62rem",
                    fontFamily: '"JetBrains Mono", monospace',
                    color: "#0052FF",
                    letterSpacing: "0.04em",
                    animation: "pulse 1.5s ease-in-out infinite",
                    "@keyframes pulse": {
                      "0%, 100%": { opacity: 1 },
                      "50%": { opacity: 0.4 },
                    },
                  }}
                >
                  ● recording
                </Typography>
              ) : null}
            </Box>
          </Box>

          <Tooltip title={isTyping ? "Stop generation" : "Send message"}>
            <span>
              <IconButton
                onClick={() => (isTyping ? onStop?.() : handleSend())}
                disabled={(isTyping ? false : !query.trim()) || isUploading}
                aria-label={isTyping ? "Stop generation" : "Send message"}
                size="small"
                sx={{
                  background: isTyping ? "transparent" : (query.trim() ? "linear-gradient(135deg, #0052FF, #4D7CFF)" : "transparent"),
                  color: isTyping ? "#0052FF" : (query.trim() ? "#FFFFFF" : "#94A3B8"),
                  border: isTyping ? "1px solid #0052FF" : (query.trim() ? "none" : "1px solid #E2E8F0"),
                  width: 32,
                  height: 32,
                  borderRadius: "8px",
                  transition: "all 150ms",
                  "&:hover": {
                    background: isTyping ? "rgba(0,82,255,0.08)" : (query.trim() ? "linear-gradient(135deg, #0041CC, #3D6BEE)" : "rgba(0,82,255,0.04)"),
                  },
                  "&.Mui-disabled": {
                    color: "#E2E8F0",
                    border: "1px solid #E2E8F0",
                  },
                }}
              >
                {isTyping ? (
                  <StopIcon sx={{ fontSize: 16 }} />
                ) : (
                  <SendIcon sx={{ fontSize: 16 }} />
                )}
              </IconButton>
            </span>
          </Tooltip>
        </Box>

        {/* Live transcript preview */}
        {partialTranscript ? (
          <Box
            sx={{
              px: 2,
              py: 1,
              borderTop: "1px solid #E2E8F0",
              backgroundColor: "#F8FAFC",
            }}
          >
            <Typography
              sx={{
                fontSize: "0.75rem",
                fontFamily: '"Inter", system-ui, sans-serif',
                color: "#64748B",
                fontStyle: "italic",
              }}
            >
              {partialTranscript}
            </Typography>
          </Box>
        ) : null}

        {/* Recording error */}
        {recordingError ? (
          <Box
            sx={{
              px: 2,
              py: 1,
              borderTop: "1px solid #FECACA",
              backgroundColor: "#FEF2F2",
              borderRadius: "0 0 12px 12px",
            }}
          >
            <Typography
              sx={{
                fontSize: "0.7rem",
                fontFamily: '"JetBrains Mono", monospace',
                color: "#DC2626",
              }}
            >
              {recordingError}
            </Typography>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
};

export default ChatInput;
