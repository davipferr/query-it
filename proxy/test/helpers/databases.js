// Bancos do docker-compose.yml: connection strings, checagem de disponibilidade e seed.
// O seed usa as libs direto (não o proxy), porque o proxy só aceita SELECT.
import pg from 'pg';
import mysql from 'mysql2/promise';
import mssql from 'mssql';

// Cada worktree de agente tem seu próprio banco (npm run agent:setup grava o .env.test na raiz
// do checkout). Sem isso, dois agentes rodando testes ao mesmo tempo apagam o seed um do outro.
try {
  process.loadEnvFile(new URL('../../../.env.test', import.meta.url));
} catch {
  // checkout principal: usa os bancos padrão
}

export const DATABASES = {
  postgres: process.env.QUERYIT_TEST_POSTGRES || 'postgres://queryit:queryit@localhost:55432/queryit',
  mysql: process.env.QUERYIT_TEST_MYSQL || 'mysql://queryit:queryit@localhost:53306/queryit',
  mssql:
    process.env.QUERYIT_TEST_MSSQL ||
    'Server=localhost,51433;Database=master;User Id=sa;Password=QueryIt_Test_2026;',
};

// Gera mais linhas que o teto do proxy (1000), em cada dialeto.
export const MANY_ROWS = {
  postgres: 'select n from generate_series(1, 1500) as n',
  mysql:
    'with recursive s(n) as (select 1 union all select n + 1 from s where n < 900) ' +
    'select a.n from s a cross join (select 1 union all select 2) b',
  mssql: 'select a.object_id from sys.all_objects a cross join (select 1 as x union all select 2) b',
};

const CUSTOMERS = [
  [1, 'Ana Souza', 'ana@example.com', 'BR'],
  [2, 'Bruno Lima', 'bruno@example.com', 'BR'],
  [3, 'Carla Mendes', null, 'PT'],
  [4, 'David Kim', 'david@example.com', 'US'],
];
const ORDERS = [
  [1, 1, 120.5, 'paid'],
  [2, 1, 35, 'paid'],
  [3, 2, 99.9, 'pending'],
  [4, 4, 410, 'refunded'],
];
// Nome com espaço: caso real que o botão SELECT do schema explorer precisa citar corretamente.
const ORDER_ITEMS = [
  [1, 'Teclado', 1],
  [1, 'Mouse', 2],
  [3, 'Monitor', 1],
];

const DDL = {
  postgres: [
    'drop table if exists "order items", orders, customers',
    'create table customers (id int primary key, name text not null, email text, country char(2))',
    'create table orders (id int primary key, customer_id int references customers(id), total numeric(10,2), status text)',
    'create table "order items" (order_id int references orders(id), product text, qty int)',
    // nextval() escreve sem ser INSERT/UPDATE: prova que a transação read-only segura o que o guard deixa passar.
    'drop sequence if exists order_seq',
    'create sequence order_seq',
  ],
  mysql: [
    'drop table if exists `order items`, orders, customers',
    'create table customers (id int primary key, name varchar(100) not null, email varchar(100), country char(2))',
    'create table orders (id int primary key, customer_id int, total decimal(10,2), status varchar(20), foreign key (customer_id) references customers(id))',
    'create table `order items` (order_id int, product varchar(100), qty int, foreign key (order_id) references orders(id))',
  ],
  mssql: [
    "if object_id('[order items]') is not null drop table [order items]",
    "if object_id('orders') is not null drop table orders",
    "if object_id('customers') is not null drop table customers",
    'create table customers (id int primary key, name nvarchar(100) not null, email nvarchar(100), country char(2))',
    'create table orders (id int primary key, customer_id int references customers(id), total decimal(10,2), status nvarchar(20))',
    'create table [order items] (order_id int references orders(id), product nvarchar(100), qty int)',
  ],
};

const QUOTE = { postgres: (n) => `"${n}"`, mysql: (n) => `\`${n}\``, mssql: (n) => `[${n}]` };

function inserts(dbType) {
  const q = QUOTE[dbType];
  const literal = (v) => (v === null ? 'null' : typeof v === 'number' ? String(v) : `'${v}'`);
  const rows = (table, data) =>
    `insert into ${q(table)} values ${data.map((r) => `(${r.map(literal).join(', ')})`).join(', ')}`;
  return [rows('customers', CUSTOMERS), rows('orders', ORDERS), rows('order items', ORDER_ITEMS)];
}

async function withConnection(dbType, fn, url = DATABASES[dbType]) {
  if (dbType === 'postgres') {
    const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 });
    await client.connect();
    try {
      return await fn((sql) => client.query(sql));
    } finally {
      await client.end();
    }
  }
  if (dbType === 'mysql') {
    const conn = await mysql.createConnection({ uri: url, connectTimeout: 2000 });
    try {
      return await fn((sql) => conn.query(sql));
    } finally {
      await conn.end();
    }
  }
  const [, host, port] = /Server=([^,;]+),(\d+)/i.exec(url);
  const pool = await mssql.connect({
    server: host,
    port: Number(port),
    user: 'sa',
    password: /Password=([^;]+)/i.exec(url)[1],
    database: 'master',
    options: { trustServerCertificate: true },
    connectionTimeout: 2000,
  });
  try {
    return await fn((sql) => pool.request().query(sql));
  } finally {
    await pool.close();
  }
}

export async function isReachable(dbType) {
  try {
    await withConnection(dbType, (run) => run('select 1'));
    return true;
  } catch {
    return false;
  }
}

// url explícita: o agent:setup semeia o banco do worktree antes de o .env.test existir.
export async function seed(dbType, url = DATABASES[dbType]) {
  await withConnection(dbType, async (run) => {
    for (const sql of [...DDL[dbType], ...inserts(dbType)]) await run(sql);
  }, url);
}
