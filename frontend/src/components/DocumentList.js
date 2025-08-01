import React from 'react';
import { Box, Typography, Grid } from '@mui/material';
import DocumentCard from './DocumentCard';

const DocumentList = ({ documents }) => {
  if (!documents || documents.length === 0) return null;

  return (
    <Box sx={{ flex: 1, mt: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Uploaded Documents ({documents.length})
      </Typography>
      <Grid container spacing={2}>
        {documents.map((doc, index) => (
          <Grid item xs={12} sm={6} md={4} key={index}>
            <DocumentCard doc={doc} index={index} />
          </Grid>
        ))}
      </Grid>
    </Box>
  );
};

export default DocumentList;