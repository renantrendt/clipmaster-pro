// Detectar eventos de cópia
document.addEventListener('selectionchange', () => {
    console.log('Seleção alterada');
});

// Listen for copy events
document.addEventListener('copy', () => {
  // Get selected text
  const selectedText = window.getSelection().toString();
  if (selectedText) {
    chrome.runtime.sendMessage({
      action: 'copyToClipboard',
      text: selectedText
    });
  }
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

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'paste') {
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.isContentEditable)) {
      // For input/textarea elements
      const start = activeElement.selectionStart;
      const end = activeElement.selectionEnd;
      const text = activeElement.value;
      activeElement.value = text.slice(0, start) + message.text + text.slice(end);
      activeElement.selectionStart = activeElement.selectionEnd = start + message.text.length;
    }
  }
});
