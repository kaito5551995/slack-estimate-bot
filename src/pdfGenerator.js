const PDFDocument = require('pdfkit');
const path = require('path');

// フォントパス
const FONT_REGULAR = path.join(__dirname, '..', 'fonts', 'NotoSansJP-Regular.otf');
const FONT_BOLD = path.join(__dirname, '..', 'fonts', 'NotoSansJP-Bold.otf');

/**
 * 数値を3桁カンマ区切り文字列に変換
 */
function formatNumber(num) {
    return Number(num).toLocaleString('ja-JP');
}

/**
 * 見積書PDFを生成する
 * @param {Object} data - 見積書データ
 * @param {string} data.clientCompany - 宛先社名
 * @param {string} data.clientPerson - 担当者名
 * @param {Array<{name: string, quantity: number, unitPrice: number}>} data.items - 品目リスト
 * @param {string} [data.date] - 日付（省略時は当日）
 * @param {string} [data.remarks] - 備考
 * @returns {Promise<Buffer>} PDFバッファ
 */
function generateEstimatePDF(data) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({
                size: 'A4',
                margins: { top: 40, bottom: 40, left: 50, right: 50 },
                info: {
                    Title: '見積書',
                    Author: '株式会社ミナト安全施設',
                }
            });

            const buffers = [];
            doc.on('data', (chunk) => buffers.push(chunk));
            doc.on('end', () => resolve(Buffer.concat(buffers)));
            doc.on('error', reject);

            // フォント登録
            doc.registerFont('NotoSans', FONT_REGULAR);
            doc.registerFont('NotoSansBold', FONT_BOLD);

            // ページ寸法
            const pageWidth = doc.page.width;
            const marginLeft = 50;
            const marginRight = 50;
            const contentWidth = pageWidth - marginLeft - marginRight;

            // 日付
            const dateStr = data.date || new Date().toLocaleDateString('ja-JP', {
                year: 'numeric', month: '2-digit', day: '2-digit'
            });
            doc.font('NotoSans').fontSize(10);
            doc.text(dateStr, marginLeft, 45, {
                width: contentWidth,
                align: 'right'
            });

            // タイトル「見 積 書」
            doc.font('NotoSansBold').fontSize(24);
            doc.text('見  積  書', marginLeft, 75, {
                width: contentWidth,
                align: 'center'
            });

            // 装飾ライン
            const titleLineY = 108;
            doc.moveTo(marginLeft + 150, titleLineY)
                .lineTo(pageWidth - marginRight - 150, titleLineY)
                .lineWidth(2)
                .strokeColor('#2c3e50')
                .stroke();

            // 左側: 宛先情報
            const leftStartY = 130;
            doc.font('NotoSansBold').fontSize(14);
            doc.text(data.clientCompany || '（社名）', marginLeft, leftStartY);

            doc.font('NotoSans').fontSize(11);
            doc.text(`${data.clientPerson || '（担当者）'} 様`, marginLeft, leftStartY + 25);

            // 宛先の下線
            const underlineY = leftStartY + 42;
            doc.moveTo(marginLeft, underlineY)
                .lineTo(marginLeft + 200, underlineY)
                .lineWidth(1)
                .strokeColor('#2c3e50')
                .stroke();

            doc.font('NotoSans').fontSize(9);
            doc.text('下記の通り御見積り申し上げます。', marginLeft, underlineY + 12);

            // 右側: 会社情報
            const rightX = pageWidth - marginRight - 220;
            const rightStartY = 130;
            doc.font('NotoSansBold').fontSize(12);
            doc.text('株式会社ミナト安全施設', rightX, rightStartY);

            doc.font('NotoSans').fontSize(9);
            const companyInfo = [
                '代表取締役　湊崎義美',
                '〒680-0914',
                '鳥取県鳥取市南安長１丁目２０番３６号',
                'TEL: 0857-30-1121',
                'MAIL: info@minato-anzen.com'
            ];
            let infoY = rightStartY + 22;
            companyInfo.forEach(line => {
                doc.text(line, rightX, infoY);
                infoY += 14;
            });

            // 計算
            const items = data.items || [];
            let subtotal = 0;
            items.forEach(item => {
                subtotal += (item.quantity || 0) * (item.unitPrice || 0);
            });
            const tax = Math.floor(subtotal * 0.1);
            const total = subtotal + tax;

            // お見積金額（ハイライトボックス）
            const amountBoxY = 225;
            doc.save();
            doc.roundedRect(marginLeft, amountBoxY, contentWidth, 36, 4)
                .fillColor('#2c3e50')
                .fill();
            doc.font('NotoSansBold').fontSize(13).fillColor('#ffffff');
            doc.text(`お見積金額　　¥${formatNumber(total)}（税込）`, marginLeft + 15, amountBoxY + 10, {
                width: contentWidth - 30,
                align: 'left'
            });
            doc.restore();
            doc.fillColor('#000000');

            // 明細テーブル
            const tableTop = amountBoxY + 52;
            const colWidths = {
                name: contentWidth * 0.45,
                qty: contentWidth * 0.15,
                unitPrice: contentWidth * 0.20,
                amount: contentWidth * 0.20
            };
            const colPositions = {
                name: marginLeft,
                qty: marginLeft + colWidths.name,
                unitPrice: marginLeft + colWidths.name + colWidths.qty,
                amount: marginLeft + colWidths.name + colWidths.qty + colWidths.unitPrice
            };

            // ヘッダー行
            const headerHeight = 28;
            doc.save();
            doc.rect(marginLeft, tableTop, contentWidth, headerHeight)
                .fillColor('#34495e')
                .fill();
            doc.font('NotoSansBold').fontSize(10).fillColor('#ffffff');
            doc.text('品　　名', colPositions.name + 8, tableTop + 8, { width: colWidths.name - 16 });
            doc.text('数　量', colPositions.qty + 4, tableTop + 8, { width: colWidths.qty - 8, align: 'center' });
            doc.text('単　価', colPositions.unitPrice + 4, tableTop + 8, { width: colWidths.unitPrice - 8, align: 'right' });
            doc.text('金　額', colPositions.amount + 4, tableTop + 8, { width: colWidths.amount - 8, align: 'right' });
            doc.restore();
            doc.fillColor('#000000');

            // 明細行
            const rowHeight = 24;
            const maxRows = 17;
            let currentY = tableTop + headerHeight;

            for (let i = 0; i < maxRows; i++) {
                // 行の背景（交互）
                if (i % 2 === 0) {
                    doc.save();
                    doc.rect(marginLeft, currentY, contentWidth, rowHeight)
                        .fillColor('#f8f9fa')
                        .fill();
                    doc.restore();
                    doc.fillColor('#000000');
                }

                // 行の罫線
                doc.moveTo(marginLeft, currentY + rowHeight)
                    .lineTo(marginLeft + contentWidth, currentY + rowHeight)
                    .lineWidth(0.5)
                    .strokeColor('#dee2e6')
                    .stroke();

                if (i < items.length) {
                    const item = items[i];
                    const amount = (item.quantity || 0) * (item.unitPrice || 0);

                    doc.font('NotoSans').fontSize(9);
                    doc.text(item.name || '', colPositions.name + 8, currentY + 7, { width: colWidths.name - 16 });
                    doc.text(String(item.quantity || ''), colPositions.qty + 4, currentY + 7, { width: colWidths.qty - 8, align: 'center' });
                    doc.text(`¥${formatNumber(item.unitPrice || 0)}`, colPositions.unitPrice + 4, currentY + 7, { width: colWidths.unitPrice - 8, align: 'right' });
                    doc.text(`¥${formatNumber(amount)}`, colPositions.amount + 4, currentY + 7, { width: colWidths.amount - 8, align: 'right' });
                }

                currentY += rowHeight;
            }

            // テーブル外枠
            doc.rect(marginLeft, tableTop, contentWidth, headerHeight + rowHeight * maxRows)
                .lineWidth(1)
                .strokeColor('#34495e')
                .stroke();

            // 縦線
            [colPositions.qty, colPositions.unitPrice, colPositions.amount].forEach(x => {
                doc.moveTo(x, tableTop)
                    .lineTo(x, currentY)
                    .lineWidth(0.5)
                    .strokeColor('#34495e')
                    .stroke();
            });

            // 合計エリア
            const summaryX = colPositions.unitPrice;
            const summaryWidth = colWidths.unitPrice + colWidths.amount;
            const summaryTop = currentY + 10;
            const summaryRowH = 24;

            // 小計
            doc.font('NotoSans').fontSize(10);
            doc.text('小　計', summaryX + 4, summaryTop + 5, { width: colWidths.unitPrice - 8, align: 'left' });
            doc.text(`¥${formatNumber(subtotal)}`, colPositions.amount + 4, summaryTop + 5, { width: colWidths.amount - 8, align: 'right' });
            doc.moveTo(summaryX, summaryTop + summaryRowH)
                .lineTo(summaryX + summaryWidth, summaryTop + summaryRowH)
                .lineWidth(0.5)
                .strokeColor('#dee2e6')
                .stroke();

            // 消費税
            doc.text('消費税（10%）', summaryX + 4, summaryTop + summaryRowH + 5, { width: colWidths.unitPrice - 8, align: 'left' });
            doc.text(`¥${formatNumber(tax)}`, colPositions.amount + 4, summaryTop + summaryRowH + 5, { width: colWidths.amount - 8, align: 'right' });
            doc.moveTo(summaryX, summaryTop + summaryRowH * 2)
                .lineTo(summaryX + summaryWidth, summaryTop + summaryRowH * 2)
                .lineWidth(0.5)
                .strokeColor('#dee2e6')
                .stroke();

            // 合計
            doc.save();
            doc.roundedRect(summaryX, summaryTop + summaryRowH * 2 + 2, summaryWidth, summaryRowH + 4, 3)
                .fillColor('#2c3e50')
                .fill();
            doc.font('NotoSansBold').fontSize(11).fillColor('#ffffff');
            doc.text('合　計', summaryX + 6, summaryTop + summaryRowH * 2 + 9, { width: colWidths.unitPrice - 12, align: 'left' });
            doc.text(`¥${formatNumber(total)}`, colPositions.amount + 4, summaryTop + summaryRowH * 2 + 9, { width: colWidths.amount - 8, align: 'right' });
            doc.restore();
            doc.fillColor('#000000');

            // 備考
            const remarksY = summaryTop + summaryRowH * 3 + 20;
            const defaultRemarks = '大変お世話になっております。お手数ですがご確認をお願いいたします。\nご不明な点やご質問等がございましたら、お気軽にお問合せ下さい。';

            doc.font('NotoSansBold').fontSize(10);
            doc.text('［備考］', marginLeft, remarksY);
            doc.font('NotoSans').fontSize(9);
            doc.text(data.remarks || defaultRemarks, marginLeft, remarksY + 16, {
                width: contentWidth * 0.55,
                lineGap: 3
            });

            doc.end();
        } catch (err) {
            reject(err);
        }
    });
}

module.exports = { generateEstimatePDF };
