const Jimp = require('jimp');

async function generateIcon() {
    // Criar uma nova imagem 16x16
    const image = new Jimp(16, 16, '#FFFFFF00'); // Transparente

    // Desenhar um fundo azul
    for (let x = 0; x < 16; x++) {
        for (let y = 0; y < 16; y++) {
            if (Math.sqrt(Math.pow(x - 8, 2) + Math.pow(y - 8, 2)) <= 8) {
                image.setPixelColor(Jimp.cssColorToHex('#2196F3'), x, y);
            }
        }
    }

    // Salvar as diferentes versões
    await image.writeAsync('icons/icon16.png');
    await image.resize(48, 48).writeAsync('icons/icon48.png');
    await image.resize(128, 128).writeAsync('icons/icon128.png');
}

generateIcon().catch(console.error);
