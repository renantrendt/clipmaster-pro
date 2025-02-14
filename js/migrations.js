// Versão atual do schema de dados
export const CURRENT_VERSION = '1.0.4';

// Função para migrar dados de versões anteriores
export async function migrateData() {
    try {
        // Verificar a versão atual dos dados
        const { dataVersion } = await chrome.storage.local.get('dataVersion');
        
        if (!dataVersion) {
            // Primeira instalação ou versão antiga sem controle de versão
            await initializeFirstVersion();
            return;
        }

        // Adicionar novas migrações aqui conforme necessário
        if (dataVersion !== CURRENT_VERSION) {
            console.log(`Migrando dados da versão ${dataVersion} para ${CURRENT_VERSION}`);
            
            // Backup dos dados atuais
            const currentData = await chrome.storage.local.get(null);
            await chrome.storage.local.set({
                dataBackup: {
                    version: dataVersion,
                    data: currentData,
                    timestamp: new Date().toISOString()
                }
            });

            // Atualizar a versão
            await chrome.storage.local.set({ dataVersion: CURRENT_VERSION });
        }
    } catch (error) {
        console.error('Erro durante migração:', error);
    }
}

// Inicializar primeira versão
async function initializeFirstVersion() {
    try {
        // Verificar se já existem clips salvos (de uma versão anterior)
        const { recentClips, favoriteClips } = await chrome.storage.local.get(['recentClips', 'favoriteClips']);
        
        // Se existirem dados, preservá-los e apenas adicionar o controle de versão
        if (recentClips || favoriteClips) {
            await chrome.storage.local.set({
                dataVersion: CURRENT_VERSION,
                recentClips: recentClips || [],
                favoriteClips: favoriteClips || []
            });
        } else {
            // Inicializar com arrays vazios
            await chrome.storage.local.set({
                dataVersion: CURRENT_VERSION,
                recentClips: [],
                favoriteClips: []
            });
        }
    } catch (error) {
        console.error('Erro ao inicializar primeira versão:', error);
    }
}
