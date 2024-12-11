// Detectar eventos de cópia
document.addEventListener('selectionchange', () => {
    console.log('Seleção alterada');
});

document.addEventListener('copy', async (e) => {
  try {
    // Get the selected text
    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    // Only proceed if there's actual text selected
    if (text) {
      console.log('Text copied:', text);
      
      // Send the copied text to the background script
      const response = await chrome.runtime.sendMessage({
        action: 'newClip',
        text: text
      });
      
      console.log('Background response:', response);
    }
  } catch (error) {
    console.error('Error in copy event handler:', error);
  }
});

// Listener para mensagens do popup
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.action === 'pasteText') {
    try {
      // Verificar se há um elemento focado
      const activeElement = document.activeElement;
      
      if (activeElement && (
          activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          activeElement.isContentEditable
      )) {
        // Para elementos de input/textarea
        const start = activeElement.selectionStart;
        const end = activeElement.selectionEnd;
        const currentValue = activeElement.value || '';
        
        // Substituir o texto selecionado ou inserir na posição do cursor
        const newValue = currentValue.substring(0, start) + 
                        message.text + 
                        currentValue.substring(end);
        
        activeElement.value = newValue;
        
        // Disparar evento de input para notificar mudanças
        activeElement.dispatchEvent(new Event('input', { bubbles: true }));
        activeElement.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Atualizar a posição do cursor
        const newPosition = start + message.text.length;
        activeElement.setSelectionRange(newPosition, newPosition);
      } else if (document.getSelection().rangeCount > 0) {
        // Para elementos contentEditable ou rich text editors
        const selection = document.getSelection();
        const range = selection.getRangeAt(0);
        
        // Deletar conteúdo selecionado se houver
        range.deleteContents();
        
        // Inserir novo texto
        const textNode = document.createTextNode(message.text);
        range.insertNode(textNode);
        
        // Mover o cursor para o final do texto inserido
        range.setStartAfter(textNode);
        range.setEndAfter(textNode);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      
      // Enviar resposta de sucesso
      sendResponse({ success: true });
    } catch (error) {
      console.error('Error pasting text:', error);
      sendResponse({ success: false, error: error.message });
    }
    return true; // Manter a conexão aberta para resposta assíncrona
  }
});
