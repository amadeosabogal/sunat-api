import sql from 'mssql';

let pool: sql.ConnectionPool | null = null;

export function getSqlConfig(): sql.config {
  return {
    user: process.env.SQLSERVER_USER || 'sa',
    password: process.env.SQLSERVER_PASSWORD || '',
    server: process.env.SQLSERVER_SERVER || 'localhost',
    port: parseInt(process.env.SQLSERVER_PORT || '1435', 10),
    database: process.env.SQLSERVER_DATABASE || 'WoditekSunat',
    options: {
      encrypt: false,
      trustServerCertificate: true,
      connectTimeout: 15000,
      requestTimeout: 30000
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };
}

export async function getDbPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }

  try {
    const config = getSqlConfig();
    pool = await new sql.ConnectionPool(config).connect();
    console.log(`🗄️ Conectado exitosamente a SQL Server (${config.database} en ${config.server}:${config.port})`);
    return pool;
  } catch (error) {
    console.error('❌ Error conectando a SQL Server:', error);
    throw error;
  }
}
