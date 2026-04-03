# Use the official Node.js image as the base image
FROM node:14 AS builder
#FROM node:14
# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./
COPY patches ./patches

# Install dependencies
RUN npm install

# Copy the rest of the application code to the working directory
COPY . .

# Build the React application
RUN npm run build

# Use the official Nginx image to serve the React application
FROM nginx:alpine

# Copy the build output to the Nginx HTML directory
COPY --from=builder /app/build /usr/share/nginx/html

# Expose port 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
