# Proxy: só as dependências de produção e o código que roda (sem test/ nem scripts/).
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY api ./api
COPY lib ./lib
# Dentro do container 0.0.0.0 é obrigatório para a porta publicada chegar ao servidor.
# Quem decide se isso fica visível fora da máquina é o `ports` do docker-compose.yml.
ENV HOST=0.0.0.0 PORT=3000 NODE_ENV=production
EXPOSE 3000
USER node
CMD ["node", "server.js"]
