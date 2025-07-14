const fs = require('fs');
const path = require('path');
const { PDFExtract } = require('pdf.js-extract');
const sharp = require('sharp');

// Minimal re-implementation of extractImages from enhanced_pdf_parser.js
async function extractImages(pdfBuffer, pageNum) {
    const pdfExtract = new PDFExtract();
    const extractOptions = {};
    const images = [];
    const data = await pdfExtract.extractBuffer(pdfBuffer, extractOptions);
    if (data.pages[pageNum - 1] && data.pages[pageNum - 1].content) {
        for (const content of data.pages[pageNum - 1].content) {
            if (content.image) {
                const optimizedImage = await sharp(content.image)
                    .jpeg({ quality: 90 })
                    .resize({ width: Math.min(content.width, 800) })
                    .toBuffer();
                images.push({
                    data: optimizedImage.toString('base64'),
                    type: 'image/jpeg',
                    position: {
                        x: content.x,
                        y: content.y,
                        width: content.width,
                        height: content.height
                    }
                });
            }
        }
    }
    return images;
}

async function main() {
    const pdfPath = path.join(__dirname, 'PDF_files', 'Unit1.pdf');
    const pdfBuffer = fs.readFileSync(pdfPath);
    const { PDFExtract } = require('pdf.js-extract');
    const pdfExtract = new PDFExtract();
    const extractOptions = {};
    const data = await pdfExtract.extractBuffer(pdfBuffer, extractOptions);
    let foundImage = null;
    for (let pageNum = 1; pageNum <= data.pages.length; pageNum++) {
        const images = await extractImages(pdfBuffer, pageNum);
        if (images.length > 0) {
            foundImage = images[0];
            console.log(`Found image on page ${pageNum}`);
            break;
        }
    }
    if (!foundImage) {
        console.log('No images found in any page.');
        return;
    }
    const outPath = path.join(__dirname, 'sample_extracted_image.jpg');
    fs.writeFileSync(outPath, Buffer.from(foundImage.data, 'base64'));
    console.log('Image saved as:', outPath);
    console.log('Base64 string for API:');
    console.log(foundImage.data);
}

main().catch(console.error);
