// Popula os bancos do docker-compose.yml que estiverem de pé (npm run db:seed).
import { DATABASES, isReachable, seed } from '../test/helpers/databases.js';

let seeded = 0;
for (const dbType of Object.keys(DATABASES)) {
  if (!(await isReachable(dbType))) {
    console.log(`${dbType}: fora do ar, pulando.`);
    continue;
  }
  await seed(dbType);
  seeded++;
  console.log(`${dbType}: populado. Connection string: ${DATABASES[dbType]}`);
}

if (!seeded) {
  console.error('Nenhum banco disponível. Rode `npm run db:up` antes.');
  process.exitCode = 1;
}
