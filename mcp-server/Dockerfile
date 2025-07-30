# In mcp-server/Dockerfile (Revised Structure)

# Use an official Node.js runtime as a parent image
FROM node:18-slim

# Add this line to install openssl and prevent the prisma warning
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /usr/src/app/mcp-server

# Copy package.json and package-lock.json to leverage Docker cache
COPY package*.json ./

# Install all production dependencies
RUN npm ci --only=production

# Copy the rest of your application code, including the prisma directory
COPY . .

# Copy the Prisma schema into the container
RUN npx prisma generate

# Your app binds to port 8080
EXPOSE 8080

# Define the command to run your app
CMD [ "node", "index.js" ]