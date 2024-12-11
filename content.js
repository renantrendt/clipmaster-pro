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
