import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const config = {
  user: process.env.SQLSERVER_USER || 'sa',
  password: process.env.SQLSERVER_PASSWORD || 'Parangaricutirimicuaro.2026',
  server: process.env.SQLSERVER_SERVER || 'localhost',
  port: parseInt(process.env.SQLSERVER_PORT || '1435', 10),
  database: 'master',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    requestTimeout: 60000
  }
};

async function runBackup() {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  const backupFilename = `/var/opt/mssql/data/WoditekSunat_${dateStr}_${timeStr}.bak`;

  console.log(`[${new Date().toISOString()}] 🚀 Iniciando respaldo diario de WoditekSunat en SQL Server...`);
  
  try {
    const pool = await sql.connect(config);
    
    const backupQuery = `
      BACKUP DATABASE [WoditekSunat]
      TO DISK = N'${backupFilename}'
      WITH FORMAT, COMPRESSION, CHECKSUM, STATS = 10,
      NAME = N'WoditekSunat Daily Backup ${dateStr}_${timeStr}';
    `;
    
    await pool.request().query(backupQuery);
    console.log(`[${new Date().toISOString()}] ✅ Respaldo completado exitosamente: ${backupFilename}`);
    
    const sizeRes = await pool.request().query(`
      SELECT TOP 1
        CAST(backup_size / 1024.0 / 1024.0 AS DECIMAL(10,2)) as original_size_mb,
        CAST(compressed_backup_size / 1024.0 / 1024.0 AS DECIMAL(10,2)) as compressed_size_mb
      FROM msdb.dbo.backupset
      WHERE database_name = 'WoditekSunat'
      ORDER BY backup_finish_date DESC;
    `);
    
    if (sizeRes.recordset.length > 0) {
      const { original_size_mb, compressed_size_mb } = sizeRes.recordset[0];
      console.log(`[${new Date().toISOString()}] 📦 Tamaño Original: ${original_size_mb} MB | Tamaño Comprimido: ${compressed_size_mb} MB`);
    }

    await pool.close();
    process.exit(0);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Error en respaldo:`, err.message);
    process.exit(1);
  }
}

runBackup();
