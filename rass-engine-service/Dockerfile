# Use an official Node.js runtime as a parent image
# Consistent with the embedding-service
FROM node:20-slim

# Install curl for health checks and other utilities
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /usr/src/app/rass-engine-service

# Copy npm manifests first to leverage Docker layer caching.
# This service does not currently commit a package-lock.json, so copy whichever
# matching manifest files are present.
COPY package*.json ./

# Install app dependencies
RUN npm install --omit=dev

# Bundle app source
COPY . .

# Your service listens on port 8000 as per your rass-engine-service/index.js and README.md
EXPOSE 8000

# Define the command to run your app
# This uses the "start" script from your package.json
CMD [ "npm", "run", "start" ]
