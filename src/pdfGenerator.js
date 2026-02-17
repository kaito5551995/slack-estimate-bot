const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * 見積書PDFを生成する
 * @param {Object} data
 * @returns {Promise<Buffer>}
 */
function generateEstimatePDF(data) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
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
        const fontPath = path.join(__dirname, '../fonts/NotoSansJP-Regular.otf');
        if (fs.existsSync(fontPath)) {
            doc.font(fontPath);
        } else {
            doc.font('Helvetica');
            console.warn('日本語フォントが見つかりません。');
        }

        // ── ヘッダー ──
        // タイトル
        doc.fontSize(20).text('御 見 積 書', { align: 'center', underline: true });
        doc.moveDown();

        // 日付
        const now = new Date();
        const dateStr = `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日`;
        doc.fontSize(10).text(dateStr, { align: 'right' });

        // 宛先
        const startY = doc.y + 10;
        doc.fontSize(12).text(`${data.clientCompany} 御中`, 50, startY);
        doc.text(`${data.clientPerson} 様`, 50, startY + 20);
        doc.text('下記のとおり御見積申し上げます。', 50, startY + 50);

        // ── 自社情報（右側）──
        const companyX = 350;
        const companyY = startY;

        // ロゴ描画（あれば）
        // ユーザーがアップロードした assets/logo.png を優先して使用
        const logoPath = path.join(__dirname, '../assets/logo.png');
        let logoHeight = 0;

        if (fs.existsSync(logoPath)) {
            try {
                // ロゴのサイズ調整（幅150pxに収める）
                doc.image(logoPath, companyX, companyY - 10, { width: 150 });
                logoHeight = 60; // ロゴ分のスペースを確保
            } catch (e) {
                console.error('ロゴ描画エラー:', e);
            }
        }

        // 社印描画
        // 会社名に少し重なるように配置
        const sealX = companyX + 110;
        const sealY = companyY + logoHeight + 10;
        drawSeal(doc, sealX, sealY);

        // 会社情報のテキスト
        const infoY = companyY + logoHeight;
        doc.fontSize(12).text('株式会社ミナト安全施設', companyX, infoY);

        doc.fontSize(10);
        doc.text('代表取締役 湊崎義美', companyX, infoY + 20);
        doc.text('〒680-0914', companyX, infoY + 35);
        doc.text('鳥取県鳥取市南安長１丁目２０番３６号', companyX, infoY + 50);
        doc.text('TEL: 0857-30-1121', companyX, infoY + 65);
        doc.text('MAIL: info@minato-anzen.com', companyX, infoY + 80);

        doc.moveDown(4);

        // ── 合計金額表示 ──
        // 合計計算（まだ計算されていないインスタンス用）
        let totalAmount = 0;
        data.items.forEach(item => totalAmount += (item.amount || item.quantity * item.unitPrice));
        const tax = Math.floor(totalAmount * 0.1);
        const grandTotal = totalAmount + tax;

        // 位置調整: 会社情報の下あたり
        const totalY = Math.max(doc.y, infoY + 110);
        doc.y = totalY;

        doc.fontSize(16)
            .text(`御見積金額  ¥${grandTotal.toLocaleString()} -`, 50, totalY, { underline: true });

        doc.moveDown(1.5);

        // ── 明細表 ──
        const tableTop = doc.y + 10;
        const itemX = 50;
        const quantityX = 300;
        const unitPriceX = 380;
        const amountX = 480;

        // テーブルヘッダー
        doc.fontSize(10);
        doc.text('品  名', itemX, tableTop);
        doc.text('数  量', quantityX, tableTop);
        doc.text('単  価', unitPriceX, tableTop);
        doc.text('金  額', amountX, tableTop);

        // ヘッダー下線
        doc.lineWidth(1).moveTo(itemX, tableTop + 15).lineTo(550, tableTop + 15).stroke();

        let y = tableTop + 25;

        data.items.forEach(item => {
            // ページネーション（1ページ収め努力はするが、あふれる場合は改ページ）
            if (y > 700) {
                doc.addPage();
                y = 50;
                // 改ページ後のヘッダー再描画などのロジックは省略（1ページ収め要望のため）
            }

            doc.text(item.name, itemX, y);

            if (item.isExpense) {
                // 諸経費の場合、要望により数量・単価は空欄にして金額のみ表示
                // 数量欄に%を出したい場合は `${item.quantity}${item.unit}` だが、空欄にする
            } else {
                // 通常品目または法定福利費
                let qtyText = '';
                if (item.unit === '式' || item.unit === '%') {
                    qtyText = '1 式';
                    if (item.isWelfare) qtyText = '1 式';
                } else {
                    qtyText = `${item.quantity.toLocaleString()} ${item.unit || ''}`;
                }

                doc.text(qtyText, quantityX, y);
                doc.text(`¥${item.unitPrice.toLocaleString()}`, unitPriceX, y);
            }

            doc.text(`¥${item.amount.toLocaleString()}`, amountX, y);

            // 明細下線
            doc.lineWidth(0.5).moveTo(itemX, y + 15).lineTo(550, y + 15).stroke();
            y += 25;
        });

        // ── 合計欄 ──
        y += 10;
        const totalLabelX = 350;
        const totalValueX = 480;

        doc.text('小  計', totalLabelX, y);
        doc.text(`¥${totalAmount.toLocaleString()}`, totalValueX, y);
        y += 20;

        doc.text('消費税 (10%)', totalLabelX, y);
        doc.text(`¥${tax.toLocaleString()}`, totalValueX, y);
        y += 20;

        // フォントを太くする（疑似）
        doc.fontSize(12);
        // もし太字フォントがあれば切り替えるが、なければサイズアップで対応

        doc.text('合  計', totalLabelX, y);
        doc.text(`¥${grandTotal.toLocaleString()}`, totalValueX, y);

        // ── 備考 ──
        // ページ下部に固定、あるいはフロー配置
        y += 50;
        // ページあふれチェック
        if (y > 720) {
            doc.addPage();
            y = 50;
        }

        if (data.remarks) {
            doc.fontSize(10).text('【備考】', 50, y);
            doc.text(data.remarks, 50, y + 15);
        } else {
            doc.fontSize(9).text('［備考］\n大変お世話になっております。お手数ですがご確認をお願いいたします。\nご不明な点やご質問等がございましたら、お気軽にお問合せ下さい。', 50, y);
        }

        doc.end();
    });
}

// 社印を描画する関数（PDFKitのベクター描画）
function drawSeal(doc, x, y) {
    const size = 50; // 少し小さめに
    const color = '#d9333f'; // 朱色

    doc.save();
    doc.strokeColor(color).lineWidth(1.5);

    // 外枠
    doc.roundedRect(x, y, size, size, 2).stroke();

    // 文字（株式会社ミナト安全施設之印）
    // 簡易的に配置
    doc.fillColor(color).fontSize(8);

    const textStartX = x + 2;
    const textStartY = y + 8;
    const lineHeight = 12;

    // 中央揃えの計算は面倒なので固定配置
    doc.text('㈱ミナト', textStartX, textStartY, { width: size - 4, align: 'center' });
    doc.text('安全施設', textStartX, textStartY + lineHeight, { width: size - 4, align: 'center' });
    doc.text('之印', textStartX, textStartY + lineHeight * 2 + 2, { width: size - 4, align: 'center' });

    doc.restore();
}

module.exports = { generateEstimatePDF };
