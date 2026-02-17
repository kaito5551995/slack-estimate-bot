const path = require('path');
const fs = require('fs');
const { generateEstimatePDF } = require('./pdfGenerator');

async function main() {
    console.log('テスト見積書PDFを生成中...');

    const testData = {
        clientCompany: '株式会社テスト商事',
        clientPerson: '山田太郎',
        items: [
            { name: 'コーン標識（赤白）', quantity: 10, unitPrice: 3500 },
            { name: '安全ベスト（反射付き）', quantity: 20, unitPrice: 2800 },
            { name: 'LED回転灯', quantity: 5, unitPrice: 12000 },
            { name: 'バリケードフェンス 1800mm', quantity: 8, unitPrice: 8500 },
            { name: '工事看板「工事中」', quantity: 3, unitPrice: 15000 },
        ]
    };

    try {
        const pdfBuffer = await generateEstimatePDF(testData);

        // 出力ディレクトリ作成
        const outputDir = path.join(__dirname, '..', 'output');
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const outputPath = path.join(outputDir, 'test_estimate.pdf');
        fs.writeFileSync(outputPath, pdfBuffer);
        console.log(`✅ PDF生成成功: ${outputPath}`);
        console.log(`   ファイルサイズ: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
    } catch (err) {
        console.error('❌ PDF生成エラー:', err);
        process.exit(1);
    }
}

main();
