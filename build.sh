#!/bin/bash

# Remove existing zip if it exists
rm -f clipmaster-pro.zip

# Create zip with only the necessary files
zip clipmaster-pro.zip \
    manifest.json \
    popup.html \
    popup.js \
    background.js \
    content.js \
    styles.css \
    config.js \
    icons/* \
    success.html

echo "Extension package created successfully: clipmaster-pro.zip"
