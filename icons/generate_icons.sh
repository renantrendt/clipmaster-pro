#!/bin/bash

# Este script requer o ImageMagick instalado
# Instale com: brew install imagemagick

# Criar ícone base (um círculo azul com um símbolo de clipboard)
convert -size 128x128 xc:none -fill "#2196F3" -draw "circle 64,64 64,8" \
        -fill white -font Arial -pointsize 60 -gravity center -draw "text 0,0 '📋'" \
        icon128.png

# Redimensionar para outros tamanhos
convert icon128.png -resize 48x48 icon48.png
convert icon128.png -resize 16x16 icon16.png
