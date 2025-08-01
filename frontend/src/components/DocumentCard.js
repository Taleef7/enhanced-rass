import React from 'react';
import { Card, CardContent, CardActions, Typography, Box, IconButton, Tooltip } from '@mui/material';
import { Delete as DeleteIcon, Download as DownloadIcon, Visibility as ViewIcon } from '@mui/icons-material';
import { motion } from 'framer-motion';

const getFileIcon = (fileName) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    switch (extension) {
        case 'pdf': return '📄';
        case 'txt': return '📝';
        case 'md': return '📋';
        case 'doc': case 'docx': return '📄';
        default: return '📁';
    }
};
const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + ['Bytes', 'KB', 'MB', 'GB'][i];
};
const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

const DocumentCard = ({ doc, index }) => (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: index * 0.1 }}>
        <Card sx={{ height: '100%' }}>
            <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                    <Typography variant="h5">{getFileIcon(doc.name)}</Typography>
                    <Box sx={{ flex: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{doc.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                            {formatFileSize(doc.size)} • {formatDate(doc.uploadedAt)}
                        </Typography>
                    </Box>
                </Box>
            </CardContent>
            <CardActions sx={{ pt: 0 }}>
                <Tooltip title="View document"><IconButton size="small"><ViewIcon /></IconButton></Tooltip>
                <Tooltip title="Download"><IconButton size="small"><DownloadIcon /></IconButton></Tooltip>
                <Tooltip title="Remove"><IconButton size="small" color="error"><DeleteIcon /></IconButton></Tooltip>
            </CardActions>
        </Card>
    </motion.div>
);

export default DocumentCard;