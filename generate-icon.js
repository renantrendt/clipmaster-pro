const sharp = require('sharp');

async function generateIcon() {
    try {
        // Criar um SVG com nosso ícone
        const svgIcon = `
        <svg width="128" height="128" xmlns="http://www.w3.org/2000/svg">
            <!-- Círculo de fundo com gradiente -->
            <defs>
                <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#64B5F6;stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#2196F3;stop-opacity:1" />
                </linearGradient>
            </defs>
            
            <!-- Círculo principal -->
            <circle cx="64" cy="64" r="60" fill="url(#grad)" />
            
            <!-- Clipboard -->
            <rect x="44" y="34" width="40" height="60" fill="white" rx="4" />
            <rect x="54" y="29" width="20" height="10" fill="white" rx="2" />
            
            <!-- Linhas de texto -->
            <rect x="52" y="49" width="24" height="3" fill="#E3F2FD" rx="1.5" />
            <rect x="52" y="64" width="24" height="3" fill="#E3F2FD" rx="1.5" />
            <rect x="52" y="79" width="24" height="3" fill="#E3F2FD" rx="1.5" />
        </svg>`;

        // Gerar os diferentes tamanhos
        const sizes = [16, 48, 128];
        
        for (const size of sizes) {
            await sharp(Buffer.from(svgIcon))
                .resize(size, size)
                .png()
                .toFile(`icons/icon${size}.png`);
        }
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
