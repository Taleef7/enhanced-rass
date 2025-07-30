// In frontend/src/components/AuthPage.js

import React, { useState } from 'react';
import { Box, Paper, Typography, TextField, Button, Tabs, Tab, CircularProgress } from '@mui/material';
import { loginUser, registerUser } from '../apiClient';
import { useAuth } from '../context/AuthContext';


const AuthForm = ({ isLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      if (isLogin) {
        const response = await loginUser(username, password);
        login(response.data.token);
      } else {
        await registerUser(username, password);
        const response = await loginUser(username, password);
        login(response.data.token);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'An unexpected error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
      <TextField
        label="Username"
        variant="outlined"
        fullWidth
        margin="normal"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        disabled={isLoading}
      />
      <TextField
        label="Password"
        type="password"
        variant="outlined"
        fullWidth
        margin="normal"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={isLoading}
      />
      {error && (
        <Typography color="error" variant="body2" sx={{ mt: 1 }}>
          {error}
        </Typography>
      )}
      <Button
        type="submit"
        variant="contained"
        fullWidth
        sx={{ mt: 2, py: 1.5 }}
        disabled={isLoading}
      >
        {isLoading ? <CircularProgress size={24} color="inherit" /> : (isLogin ? 'Login' : 'Register')}
      </Button>
    </Box>
  );
};

const AuthPage = () => {
  const [value, setValue] = useState(0);

  const handleChange = (event, newValue) => {
    setValue(newValue);
  };

  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', backgroundColor: '#0f0f23' }}>
      <Paper elevation={6} sx={{ p: 4, width: '100%', maxWidth: 400 }}>
        <Typography variant="h4" component="h1" gutterBottom sx={{ textAlign: 'center' }}>
          {value === 0 ? 'Welcome Back' : 'Create Account'}
        </Typography>
        <Tabs value={value} onChange={handleChange} centered>
          <Tab label="Login" />
          <Tab label="Register" />
        </Tabs>
        {value === 0 && <AuthForm isLogin={true} />}
        {value === 1 && <AuthForm isLogin={false} />}
      </Paper>
    </Box>
  );
};

export default AuthPage;