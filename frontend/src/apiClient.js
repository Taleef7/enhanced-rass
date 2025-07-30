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

// We can add more API functions here later...

export default apiClient;