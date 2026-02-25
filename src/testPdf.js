const path = require('path');
const fs = require('fs');
const { generateDocument } = require('./pdfGenerator');

async function main() {
    console.log('テスト見積書PDFを生成中...');

    const testItems = [
        { name: 'コーン標識（赤白）', quantity: 10, unit: '', unitPrice: 3500 },
        { name: '安全ベスト（反射付き）', quantity: 20, unit: '', unitPrice: 2800 },
        { name: 'LED回転灯', quantity: 5, unit: '', unitPrice: 12000 },
        { name: 'バリケードフェンス 1800mm', quantity: 8, unit: '', unitPrice: 8500 },
        { name: '工事看板「工事中」', quantity: 3, unit: '', unitPrice: 15000 },
    ].map(item => ({ ...item, amount: item.quantity * item.unitPrice }));

    const testData = {
        clientCompany: '株式会社テスト商事',
        clientPerson: '山田太郎',
        items: testItems,
    };

    const types = [
        { type: 'estimate', label: '見積書' },
        { type: 'invoice', label: '請求書' },
        { type: 'receipt', label: '領収書' },
    ];

    // 出力ディレクトリ作成
    const outputDir = path.join(__dirname, '..', 'output');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    for (const { type, label } of types) {
        try {
            const pdfBuffer = await generateDocument(type, testData);
            const outputPath = path.join(outputDir, `test_${type}.pdf`);
            fs.writeFileSync(outputPath, pdfBuffer);
            console.log(`✅ ${label}PDF生成成功: ${outputPath}`);
            console.log(`   ファイルサイズ: ${(pdfBuffer.length / 1024).toFixed(1)} KB`);
        } catch (err) {
            console.error(`❌ ${label}PDF生成エラー:`, err);
            process.exit(1);
        }
    }
}

main();
