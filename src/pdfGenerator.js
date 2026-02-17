const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * PDFドキュメントを生成する (見積書・請求書・領収書)
 * @param {string} type - 'estimate' | 'invoice' | 'receipt'
 * @param {Object} data
 * @returns {Promise<Buffer>}
 */
function generateDocument(type, data) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 40 });
        const buffers = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => {
            const pdfData = Buffer.concat(buffers);
            resolve(pdfData);
        });

        doc.on('error', (err) => {
            reject(err);
        });

        // フォント設定
        const fontRegularPath = path.join(__dirname, '../fonts/NotoSansJP-Regular.otf');
        const fontSerifPath = path.join(__dirname, '../fonts/NotoSerifJP-Regular.otf');

        if (fs.existsSync(fontRegularPath)) doc.registerFont('Gothic', fontRegularPath);
        else doc.registerFont('Gothic', 'Helvetica');

        if (fs.existsSync(fontSerifPath)) doc.registerFont('Mincho', fontSerifPath);
        else doc.registerFont('Mincho', 'Times-Roman');

        doc.font('Gothic');

        // ── タイプ別設定 ──
        let title = '御 見 積 書';
        let dateLabel = '見積日'; // 今回は日付のみ表示だが、将来用
        let greeting = '下記のとおり御見積申し上げます。';
        let amountLabel = '御見積金額';

        switch (type) {
            case 'invoice':
                title = '御 請 求 書';
                dateLabel = '請求日';
                greeting = '下記のとおりご請求申し上げます。';
                amountLabel = '御請求金額';
                break;
            case 'receipt':
                title = '領  収  書';
                dateLabel = '領収日';
                greeting = '下記正に領収いたしました。';
                amountLabel = '領収金額';
                break;
            case 'estimate':
            default:
                // デフォルト
                break;
        }

        // ── ヘッダー ──
        // タイトル
        doc.font('Mincho').fontSize(22).text(title, { align: 'center' });

        // タイトル下線
        const titleY = doc.y + 5;
        doc.lineWidth(2).moveTo(220, titleY).lineTo(375, titleY).stroke();
        doc.lineWidth(0.5).moveTo(220, titleY + 3).lineTo(375, titleY + 3).stroke();

        doc.moveDown(2);

        // 日付
        const now = new Date();
        const dateStr = `${now.getFullYear()}年 ${now.getMonth() + 1}月 ${now.getDate()}日`;
        doc.font('Gothic').fontSize(10).text(dateStr, { align: 'right' });

        const startY = doc.y + 20;

        // ── 宛先 (左側) ──
        doc.font('Mincho').fontSize(14);
        doc.text(`${data.clientCompany}  御中`, 50, startY);
        doc.fontSize(11).text(`${data.clientPerson}  様`, 50, startY + 25);

        // 宛先下線
        doc.lineWidth(0.5).moveTo(50, startY + 45).lineTo(300, startY + 45).stroke();

        doc.font('Gothic').fontSize(10).text(greeting, 50, startY + 60);

        // 金額 (大きく強調)
        let totalAmount = 0;
        data.items.forEach(item => totalAmount += (item.amount || item.quantity * item.unitPrice));
        const tax = Math.floor(totalAmount * 0.1);
        const grandTotal = totalAmount + tax;

        doc.font('Mincho').fontSize(12).text(amountLabel, 50, startY + 95);
        doc.fontSize(18).text(`¥ ${grandTotal.toLocaleString()} (税込)`, 130, startY + 92);

        // 金額下線
        doc.lineWidth(1).moveTo(50, startY + 115).lineTo(300, startY + 115).stroke();

        // ── 自社情報 (右側) ──
        const companyX = 360;
        const companyY = startY;

        // ロゴ描画
        const logoPath = path.join(__dirname, '../assets/logo.png');
        if (fs.existsSync(logoPath)) {
            try {
                const logoW = 120;
                doc.image(logoPath, companyX + 10, companyY - 25, { width: logoW });
            } catch (e) { console.error(e); }
        }

        // 会社名
        doc.font('Mincho').fontSize(13);
        doc.text('株式会社ミナト安全施設', companyX, companyY + 40);

        // 社印
        const sealX = companyX + 110;
        const sealY = companyY + 25;
        drawSeal(doc, sealX, sealY);

        // 住所等
        doc.font('Gothic').fontSize(9);
        const infoY = companyY + 60;
        doc.text('代表取締役 湊崎義美', companyX, infoY);
        doc.text('〒680-0914', companyX, infoY + 15);
        doc.text('鳥取県鳥取市南安長１丁目２０番３６号', companyX, infoY + 30);
        doc.text('TEL: 0857-30-1121', companyX, infoY + 45);
        doc.text('MAIL: info@minato-anzen.com', companyX, infoY + 60);

        // ── 明細表 ──
        const minTableTop = 280;
        const dynamicTableTop = doc.y + 40;
        const tableTop = Math.max(minTableTop, dynamicTableTop);

        if (tableTop > 600) {
            doc.addPage();
            doc.y = 50;
        } else {
            doc.y = tableTop;
        }

        const currentTableTop = doc.y;

        const colX = { name: 40, quant: 300, price: 380, amount: 470 };
        const colWidth = { name: 250, quant: 60, price: 80, amount: 80 };

        // ヘッダー背景
        doc.rect(40, currentTableTop, 515, 20).fill('#f0f0f0').stroke();

        // ヘッダー文字
        doc.fillColor('black').font('Gothic').fontSize(10);
        const headerTextY = currentTableTop + 6;
        doc.text('品  名  ・  規  格', colX.name + 10, headerTextY);
        doc.text('数  量', colX.quant, headerTextY);
        doc.text('単  価', colX.price, headerTextY);
        doc.text('金  額', colX.amount, headerTextY);

        doc.lineWidth(1).strokeColor('black');

        let y = currentTableTop + 20;
        let pageHeightLimit = 700;

        data.items.forEach((item, index) => {
            doc.font('Gothic').fontSize(10);

            const nameHeight = doc.heightOfString(item.name, { width: colWidth.name, lineGap: 2 });
            const rowHeight = Math.max(30, nameHeight + 16);

            if (y + rowHeight > pageHeightLimit) {
                doc.addPage();
                y = 50;
                doc.rect(40, y, 515, 20).fill('#f0f0f0').stroke();
                doc.fillColor('black').text('品  名  ・  規  格', colX.name + 10, y + 6);
                doc.text('数  量', colX.quant, y + 6);
                doc.text('単  価', colX.price, y + 6);
                doc.text('金  額', colX.amount, y + 6);
                doc.lineWidth(1).strokeColor('black');
                y += 20;
            }

            doc.lineWidth(0.5).moveTo(40, y + rowHeight).lineTo(555, y + rowHeight).strokeColor('#cccccc').stroke();

            doc.fillColor('black').text(item.name, colX.name + 10, y + 8, { width: colWidth.name, lineGap: 2 });

            if (item.isExpense || item.isWelfare) {
                // 空欄
            } else {
                let qtyText = '';
                if (item.unit === '式' || item.unit === '%') {
                    qtyText = '1 式';
                } else {
                    qtyText = `${item.quantity.toLocaleString()} ${item.unit || ''}`;
                }
                doc.text(qtyText, colX.quant, y + 8);
                doc.text(`¥ ${item.unitPrice.toLocaleString()}`, colX.price, y + 8);
            }

            doc.text(`¥ ${item.amount.toLocaleString()}`, colX.amount, y + 8);
            y += rowHeight;
        });

        // ── 合計欄 ──
        if (y + 100 > pageHeightLimit) {
            doc.addPage();
            y = 50;
        }

        y += 20;

        const totalBoxX = 280;
        const totalBoxW = 275;

        doc.text('小  計', totalBoxX + 20, y);
        doc.text(`¥ ${totalAmount.toLocaleString()}`, totalBoxX + 190, y);
        doc.lineWidth(0.5).moveTo(totalBoxX, y + 15).lineTo(totalBoxX + totalBoxW, y + 15).stroke();
        y += 25;

        doc.text('消費税 (10%)', totalBoxX + 20, y);
        doc.text(`¥ ${tax.toLocaleString()}`, totalBoxX + 190, y);
        doc.lineWidth(0.5).moveTo(totalBoxX, y + 15).lineTo(totalBoxX + totalBoxW, y + 15).stroke();
        y += 25;

        doc.font('Mincho').fontSize(12);
        doc.text('合  計', totalBoxX + 20, y + 5);
        doc.text(`¥ ${grandTotal.toLocaleString()}`, totalBoxX + 190, y + 5);

        doc.lineWidth(0.5).moveTo(totalBoxX, y + 25).lineTo(totalBoxX + totalBoxW, y + 25).stroke();
        doc.lineWidth(0.5).moveTo(totalBoxX, y + 28).lineTo(totalBoxX + totalBoxW, y + 28).stroke();

        // ── 備考欄 ──
        if (y + 120 > 750) {
            doc.addPage();
            y = 50;
        } else {
            y += 40;
        }

        const remarksY = y;
        doc.lineWidth(0.5).strokeColor('black');
        doc.rect(40, remarksY, 515, 80).stroke();
        doc.font('Gothic').fontSize(9).text('備  考', 50, remarksY + 5);

        if (data.remarks) {
            doc.text(data.remarks, 50, remarksY + 20);
        } else {
            doc.fontSize(8).fillColor('#666666');
            if (type === 'receipt') {
                doc.text('但し、上記正に領収いたしました。', 50, remarksY + 20);
            } else if (type === 'invoice') {
                doc.text('お振込期限： 翌月末日', 50, remarksY + 20);
                doc.text('振込先： 〇〇銀行 〇〇支店 普通 1234567 カ）ミナトアンゼンシセツ', 50, remarksY + 35);
            } else {
                // estimate
                doc.text('有効期限： 御見積提出日より30日間', 50, remarksY + 20);
                doc.text('支払条件： 弊社指定口座への振り込み・現金', 50, remarksY + 35);
            }
        }

        doc.end();
    });
}

/**
 * 社印を描画する関数
 * @param {PDFKit.PDFDocument} doc 
 * @param {number} x 
 * @param {number} y 
 */
function drawSeal(doc, x, y) {
    const size = 56;
    const color = '#b22222';

    doc.save();
    doc.opacity(0.85);
    doc.rotate(-2, { origin: [x + size / 2, y + size / 2] });

    // 枠
    doc.strokeColor(color);
    doc.lineWidth(2.5);
    doc.rect(x, y, size, size).stroke();
    doc.lineWidth(1);
    doc.rect(x + 3, y + 3, size - 6, size - 6).stroke();

    // 文字
    doc.fillColor(color);
    doc.font('Mincho');
    doc.fontSize(11);

    // 座標定義: 縦書き3行 (右: ㈱ミナト, 中: 安全施設, 左: 之印)
    const col1X = x + size - 16;
    const col2X = x + size / 2 - 6;
    const col3X = x + 6;

    const textY = y + 5;
    const spacing = 12;

    // 右
    doc.text('㈱', col1X, textY);
    doc.text('ミ', col1X, textY + spacing);
    doc.text('ナ', col1X, textY + spacing * 2);
    doc.text('ト', col1X, textY + spacing * 3);

    // 中
    doc.text('安', col2X, textY);
    doc.text('全', col2X, textY + spacing);
    doc.text('施', col2X, textY + spacing * 2);
    doc.text('設', col2X, textY + spacing * 3);

    // 左
    const stampY = textY + spacing + 6;
    doc.text('之', col3X, stampY);
    doc.text('印', col3X, stampY + spacing);

    // ノイズ
    doc.save();
    doc.fillColor('white');
    for (let i = 0; i < 50; i++) {
        const nx = x + Math.random() * size;
        const ny = y + Math.random() * size;
        const r = Math.random() * 1.5;
        doc.circle(nx, ny, r).fill();
    }
    doc.restore();

    doc.restore();
}

module.exports = { generateDocument };
