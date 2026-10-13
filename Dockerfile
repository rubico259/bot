FROM node:18-slim

# התקנת כל התלויות והספריות המערכתיות הנדרשות ל-Chrome/Puppeteer
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
    libxfixes3 \
    libxi6 \
    libxcursor1 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    librendertext-stb0 \
    libxtst6 \
    xdg-utils \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["npm", "start"]