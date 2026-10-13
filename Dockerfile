FROM node:18-slim

# התקנת כל התלויות הנדרשות עבור דפדפן Chrome/Puppeteer בסביבת לינוקס
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    procps \
    libxss1 \
    libgconf-2-4 \
    libnss3 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpango-1.0-0 \
    libc6 \
    libxkbcommon0 \
    libpangoft2-1.0-0 \
    libatk1.0-0 \
    libcairo2 \
    libglib2.0-0 \
    libnspr4 \
    libx11-xcb1 \
    libxcb1 \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["npm", "start"]