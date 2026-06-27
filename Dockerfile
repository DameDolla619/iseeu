FROM node:22-slim

RUN apt-get update && apt-get install -y python3 python3-pip python3-venv && rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"
RUN pip install --no-cache-dir maigret holehe

COPY package.json package-lock.json ./
RUN npm ci --production

COPY . .

ENV PYTHON_PATH="/app/venv/bin/python3"
ENV SCRIPTS_DIR="/app/venv/bin"
ENV PORT=7860
ENV PYTHONIOENCODING=utf-8

EXPOSE 7860

CMD ["node", "server.js"]
