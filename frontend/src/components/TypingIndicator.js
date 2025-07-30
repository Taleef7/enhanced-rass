import React from 'react';
import { Box, Avatar } from '@mui/material';
import { motion } from 'framer-motion';

const TypingIndicator = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          p: 2,
          borderRadius: 3,
          backgroundColor: 'background.paper',
          maxWidth: '85%',
          border: 1,
          borderColor: 'divider'
        }}
      >
        <Avatar sx={{ bgcolor: 'primary.main', width: 32, height: 32, fontSize: '0.875rem' }}>
          AI
        </Avatar>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.2 }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: 'primary.main'
                }}
              />
            </motion.div>
          ))}
        </Box>
      </Box>
    </motion.div>
);

export default TypingIndicator;