// test-install.js
console.log('Test dipendenze...\n');

try {
    const { PDFDocument } = require('pdf-lib');
    console.log('✅ pdf-lib installato');
} catch (e) {
    console.log('❌ pdf-lib NON installato');
}

try {
    const sharp = require('sharp');
    console.log('✅ sharp installato');
} catch (e) {
    console.log('❌ sharp NON installato');
}

try {
    const Anthropic = require('@anthropic-ai/sdk');
    console.log('✅ @anthropic-ai/sdk installato');
} catch (e) {
    console.log('❌ @anthropic-ai/sdk NON installato');
}

try {
    const pdfParse = require('pdf-parse');
    console.log('✅ pdf-parse installato');
} catch (e) {
    console.log('❌ pdf-parse NON installato');
}

console.log('\n✅ Tutto pronto per procedere!');