// In frontend/src/apiClient.js
import axios from 'axios';

// The base URL for all our backend requests
const API_BASE_URL = 'http://localhost:8080/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// --- Authentication Endpoints ---

export const registerUser = (username, password) => {
  return apiClient.post('/auth/register', { username, password });
};

export const loginUser = async (username, password) => {
  const response = await apiClient.post('/auth/login', { username, password });
  // On successful login, we store the token
  if (response.data.token) {
    localStorage.setItem('authToken', response.data.token);
  }
  return response;
};

export const logoutUser = () => {
  localStorage.removeItem('authToken');
};


export const uploadFile = (file) => {
    const formData = new FormData();
    formData.append('file', file);
    // We use the base apiClient to get the proxy URL automatically
    return apiClient.post('/embed-upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  };
  
  export const streamQuery = async (query, documents = [], onTextChunk, onSources, signal) => {
    const response = await fetch('/api/stream-ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, documents: documents.map(d => d.name) }),
      signal,
    });
  
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
  
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
  
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n\n');
  
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataContent = line.substring(6);
          if (dataContent === '[DONE]') break;
  
          try {
            const parsed = JSON.parse(dataContent);
            const delta = parsed.choices[0]?.delta;
  
            if (delta?.content) {
              onTextChunk(delta.content);
            } else if (delta?.custom_meta?.citations) {
              onSources(delta.custom_meta.citations);
            }
          } catch (e) {
            console.error('Error parsing stream data:', e);
          }
        }
      }
    }
};


export default apiClient;