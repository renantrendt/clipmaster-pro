const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Carrega as variáveis do .env
const env = dotenv.config({ path: path.resolve(__dirname, '../.env') }).parsed;

// Cria o objeto de configuração apenas com as variáveis que queremos expor
const config = {
  SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY,
  // Adicione outras variáveis conforme necessário
};

// Cria o arquivo de configuração
const configContent = `const CONFIG = ${JSON.stringify(config, null, 2)};`;

// Escreve o arquivo
fs.writeFileSync(
  path.resolve(__dirname, '../config.js'),
  configContent,
  'utf-8'
);
