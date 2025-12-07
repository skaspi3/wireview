FROM node:20-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application (includes .env)
COPY . .

# Port is configured via VITE_DEV_PORT in .env or environment variable
# Default expose for documentation (actual port read from .env)
EXPOSE 5173

# Start Vite dev server
CMD ["npm", "run", "dev"]
