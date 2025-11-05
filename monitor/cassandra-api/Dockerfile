FROM node:20-alpine

# Install wget for healthcheck
RUN apk add --no-cache wget

WORKDIR /app

COPY package*.json ./

RUN npm install --only=production

COPY src/ ./src/

EXPOSE 3002

CMD ["npm", "start"]
