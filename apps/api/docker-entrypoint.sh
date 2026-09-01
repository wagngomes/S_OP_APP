#!/bin/sh
# Entrypoint da API — migra antes de servir.
#
# As migrações rodam aqui para que a stack suba com um único `docker compose up`,
# sem passo manual. A API só começa a atender depois que o schema está no lugar.
#
# ATENÇÃO: isto pressupõe UMA réplica migradora. Se a API escalar para mais de
# uma réplica, `migrate deploy` precisa sair daqui e virar um job próprio — caso
# contrário as réplicas competem pela mesma migração no boot.
set -eu

echo "[entrypoint] aguardando o banco…"
until node -e "
  const net = require('net');
  const url = new URL(process.env.DATABASE_URL);
  const socket = net.connect(Number(url.port || 5432), url.hostname);
  socket.on('connect', () => { socket.end(); process.exit(0); });
  socket.on('error', () => process.exit(1));
" 2>/dev/null; do
  sleep 1
done

echo "[entrypoint] aplicando migrações…"
npx prisma migrate deploy

echo "[entrypoint] iniciando a API…"
exec "$@"
