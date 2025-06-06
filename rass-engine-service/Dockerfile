# Use an official Node.js runtime as a parent image
# Consistent with the embedding-service
FROM node:20-slim

# Set the working directory in the container
WORKDIR /usr/src/app/rass-engine-service

# Copy package.json and package-lock.json
# The rass-engine-service also has a package-lock.json
COPY package.json ./
COPY package-lock.json ./
# Although there's a pnpm-lock.yaml, the original README and package.json scripts use npm.
# If pnpm is preferred, this section would need to be adjusted to install and use pnpm.

# Install app dependencies
RUN npm install --omit=dev

# Bundle app source
COPY . .

# Your service listens on port 8000 as per your rass-engine-service/index.js and README.md
EXPOSE 8000

# Define the command to run your app
# This uses the "start" script from your package.json
CMD [ "npm", "run", "start" ]