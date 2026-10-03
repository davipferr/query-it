// Registro dos bancos suportados. Um banco novo = um arquivo de driver + uma linha aqui;
// proxy/test/drivers.test.js cobra o resto (dialeto no sql-guard, introspecção, seed, opção na UI).
import * as postgres from './postgres.js';
import * as mysql from './mysql.js';
import * as mssql from './mssql.js';

export const DRIVERS = { postgres, mysql, mssql };
