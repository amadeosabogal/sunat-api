# sunat-api

API REST para Facturación Electrónica SUNAT (Perú) con soporte Multi-Empresa, autenticación por API Key y UBL 2.1.

## 🚀 Características
- **Emisión de Comprobantes:** Facturas (01), Boletas (03) y Notas de Crédito (07).
- **Boleta Rápida / Consumidor Final:** Emisión sin DNI/RUC para montos menores a S/ 700.00.
- **Multi-Tenant / Multi-Empresa:** Conexión a base de datos SQL Server centralizada con llaves independientes (`X-API-KEY`).
- **Seguridad:** Límite de peticiones (`express-rate-limit`) a 60 req/min por IP y exclusión estricta de credenciales en Git.
- **Almacenamiento Local:** Generación de XML firmado y almacenamiento de Constancia de Recepción (CDR ZIP) de SUNAT.

## 🛠️ Instalación y Despliegue

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
nano .env

# 3. Colocar certificados SUNAT
# Copiar cert.pem y key.pem en la carpeta certs/

# 4. Compilar TypeScript
npm run build

# 5. Ejecutar en desarrollo o producción
npm run dev
# o con PM2 en producción:
pm2 start dist/server.js --name "sunat-api"
```

## 🛡️ Variables de Entorno (.env)
Consulta `.env.example` para ver la lista completa de variables necesarias para SUNAT y SQL Server.
