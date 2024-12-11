// Inicializar storage quando a extensão é instalada
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extensão instalada/atualizada');
  chrome.storage.local.get(['recentClips', 'favoriteClips'], function(result) {
    if (!result.recentClips) {
      chrome.storage.local.set({ recentClips: [] });
      console.log('Storage inicializado: recentClips');
    }
    if (!result.favoriteClips) {
      chrome.storage.local.set({ favoriteClips: [] });
      console.log('Storage inicializado: favoriteClips');
    }
  });
});

// Listener para mensagens do content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Mensagem recebida no background:', message);
  
  if (message.action === 'newClip') {
    handleNewClip(message.text).then(() => {
      sendResponse({ success: true });
    }).catch(error => {
      console.error('Error handling new clip:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    // Importante: retornar true para indicar que a resposta será assíncrona
    return true;
  }
});

async function handleNewClip(text) {
  console.log('Handling new clip:', text);
  
  // Buscar clips existentes
  const data = await chrome.storage.local.get(['recentClips', 'favoriteClips']);
  let recentClips = data.recentClips || [];
  
  // Remover duplicatas
  recentClips = recentClips.filter(clip => clip.text !== text);
  
  // Adicionar novo clip no início
  recentClips.unshift({
    text: text,
    timestamp: Date.now()
  });
  
  // Salvar clips atualizados
  await chrome.storage.local.set({ recentClips });
  console.log('Clips salvos:', recentClips);
  
  // Notificar popup se estiver aberto
  try {
    chrome.runtime.sendMessage({ 
      action: 'updateClips',
      clips: recentClips
    });
  } catch (error) {
    console.log('Popup não está aberto para atualização');
  }
}
