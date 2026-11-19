import pg from 'pg';
import { readFileSync } from 'node:fs';

/**
 * Conexion a PostgreSQL - Singleton:
 */
export class Database {
  static #instance = null;
  #pool;

  constructor() {
    if (Database.#instance) {
      throw new Error('Usa Database.getInstance() en lugar de new Database()');
    }
    this.#pool = new pg.Pool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'true' ? {
        rejectUnauthorized: true,
        ...(process.env.DB_SSL_CA ? { ca: readFileSync(process.env.DB_SSL_CA, 'utf8') } : {}),
      } : undefined,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
    this.#pool.on('error', (err) => console.error('Error en el pool de PostgreSQL:', err.message));
  }

  static getInstance() {
    if (!Database.#instance) Database.#instance = new Database();
    return Database.#instance;
  }

  query(texto, params) {
    return this.#pool.query(texto, params);
  }

  /** Ejecuta `trabajo(client)` dentro de una transacción (BEGIN/COMMIT/ROLLBACK). */
  async transaccion(trabajo) {
    const client = await this.#pool.connect();
    try {
      await client.query('BEGIN');
      const resultado = await trabajo(client);
      await client.query('COMMIT');
      return resultado;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async probarConexion() {
    const { rows } = await this.#pool.query('SELECT NOW() AS ahora');
    return rows[0].ahora;
  }

  async cerrar() {
    await this.#pool.end();
    Database.#instance = null;
  }
}
