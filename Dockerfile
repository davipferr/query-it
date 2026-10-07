# Frontend: o server.js só usa módulos nativos do Node, então não há npm install.
FROM node:22-alpine
WORKDIR /app
# package.json só pelo "type": "module".
COPY package.json server.js index.html ./
COPY css ./css
COPY js ./js
# Dentro do container 0.0.0.0 é obrigatório para a porta publicada chegar ao servidor.
# Quem decide se isso fica visível fora da máquina é o `ports` do docker-compose.yml.
ENV HOST=0.0.0.0 PORT=5500
EXPOSE 5500
USER node
CMD ["node", "server.js"]
