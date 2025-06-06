# Use an official Node.js runtime as a parent image
# We'll use Node.js 20 as a recent LTS version.
FROM node:20-slim

# Set the working directory in the container
WORKDIR /usr/src/app/embedding-service

# Copy package.json and package-lock.json (or npm-shrinkwrap.json)
# These are copied first to leverage Docker's layer caching.
# If these files don't change, Docker won't re-run npm install.
COPY package.json ./
COPY package-lock.json ./

# Install app dependencies
# Using --omit=dev if you have devDependencies you don't want in production
RUN npm install --omit=dev

# Bundle app source
COPY . .

# Create the necessary directories for uploads and temp files
# These paths are relative to the WORKDIR and based on your embedding-service/README.md and index.js
# UPLOAD_DIR is ./uploads and TEMP_DIR is ./temp in your .env example
RUN mkdir -p ./uploads ./temp

# Your service listens on port 8001 as per your embedding-service/index.js
EXPOSE 8001

# Define the command to run your app
# This uses the "start" script from your package.json
CMD [ "npm", "run", "start" ]