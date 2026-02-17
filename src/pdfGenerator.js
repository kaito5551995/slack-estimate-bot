const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * 見積書PDFを生成する (v3: BtoB Construction Style)
 * @param {Object} data
 * @returns {Promise<Buffer>}
 */
function generateEstimatePDF(data) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 40 }); // 余白を少し詰める
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

        // フォント登録 (エイリアス)
        if (fs.existsSync(fontRegularPath)) doc.registerFont('Gothic', fontRegularPath);
        else doc.registerFont('Gothic', 'Helvetica'); // Fallback

        if (fs.existsSync(fontSerifPath)) doc.registerFont('Mincho', fontSerifPath);
        else doc.registerFont('Mincho', 'Times-Roman'); // Fallback

        // デフォルトフォント
        doc.font('Gothic');

        // ── ヘッダー ──
        // タイトル (明朝体で重厚に)
        doc.font('Mincho').fontSize(22).text('御 見 積 書', { align: 'center' });

        // タイトル下線 (二重線風)
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
        doc.font('Mincho').fontSize(14); // 宛先も少しフォーマルに
        doc.text(`${data.clientCompany}  御中`, 50, startY);
        doc.fontSize(11).text(`${data.clientPerson}  様`, 50, startY + 25);

        // 宛先下線
        doc.lineWidth(0.5).moveTo(50, startY + 45).lineTo(300, startY + 45).stroke();

        doc.font('Gothic').fontSize(10).text('下記のとおり御見積申し上げます。', 50, startY + 60);

        // 御見積金額 (大きく強調)
        let totalAmount = 0;
        data.items.forEach(item => totalAmount += (item.amount || item.quantity * item.unitPrice));
        const tax = Math.floor(totalAmount * 0.1);
        const grandTotal = totalAmount + tax;

        doc.font('Mincho').fontSize(12).text('御見積金額', 50, startY + 95);
        doc.fontSize(18).text(`¥ ${grandTotal.toLocaleString()} -`, 130, startY + 92);

        // 金額下線
        doc.lineWidth(1).moveTo(50, startY + 115).lineTo(300, startY + 115).stroke();
        doc.font('Gothic').fontSize(9).text('（消費税込み）', 150, startY + 120);


        // ── 自社情報 (右側) ──
        const companyX = 360;
        const companyY = startY;

        // ロゴ描画
        // 社名の真上に配置
        const logoPath = path.join(__dirname, '../assets/logo.png');
        let logoOffset = 0;

        if (fs.existsSync(logoPath)) {
            try {
                // ロゴサイズ調整 (幅100px程度)
                const logoW = 120;
                // 配置: 社名の中心に合わせるか、左揃えか。ここでは社名に合わせて配置
                doc.image(logoPath, companyX + 10, companyY - 25, { width: logoW });
                logoOffset = 10;
            } catch (e) {
                console.error('ロゴ描画エラー:', e);
            }
        }

        // 会社名 (重厚に)
        doc.font('Mincho').fontSize(13);
        doc.text('株式会社ミナト安全施設', companyX, companyY + 40);

        // 社印 (角印)
        // 社名に被せる
        // 文字の最後の方に被せるとリアル
        const sealX = companyX + 110;
        const sealY = companyY + 25; // ロゴや社名の位置に合わせて調整
        drawSeal(doc, sealX, sealY);

        // 住所等 (ゴシックで読みやすく)
        doc.font('Gothic').fontSize(9);
        const infoY = companyY + 60;
        doc.text('代表取締役 湊崎義美', companyX, infoY);
        doc.text('〒680-0914', companyX, infoY + 15);
        doc.text('鳥取県鳥取市南安長１丁目２０番３６号', companyX, infoY + 30);
        doc.text('TEL: 0857-30-1121', companyX, infoY + 45);
        doc.text('MAIL: info@minato-anzen.com', companyX, infoY + 60);

        // ── 明細表 ──
        const tableTop = 280; // 固定開始位置
        doc.y = tableTop;

        const colX = {
            name: 40,
            quant: 300,
            price: 380,
            amount: 470
        };

        const colWidth = {
            name: 250,
            quant: 60,
            price: 80,
            amount: 80
        };

        // ヘッダー背景
        doc.rect(40, tableTop, 515, 20).fill('#f0f0f0').stroke(); // 薄いグレー

        // ヘッダー文字
        doc.fillColor('black').font('Gothic').fontSize(10);
        // 位置微調整（上下中央寄せ）
        const headerTextY = tableTop + 6;
        doc.text('品  名  ・  規  格', colX.name + 10, headerTextY);
        doc.text('数  量', colX.quant, headerTextY);
        doc.text('単  価', colX.price, headerTextY);
        doc.text('金  額', colX.amount, headerTextY);

        // ヘッダー線 (上下はrectで描画済み)
        doc.lineWidth(1).strokeColor('black');

        let y = tableTop + 20;
        let pageHeightLimit = 730; // フッター余白確保のため少し早めに改ページ

        data.items.forEach((item, index) => {
            doc.font('Gothic').fontSize(10);

            // 品名の高さを計算 (折り返し対応)
            const nameHeight = doc.heightOfString(item.name, { width: colWidth.name });
            const rowHeight = Math.max(25, nameHeight + 10); // 最小25px、文字数に応じて拡張

            // ページネーション
            if (y + rowHeight > pageHeightLimit) {
                doc.addPage();
                y = 50;

                // ヘッダー再描画
                doc.rect(40, y, 515, 20).fill('#f0f0f0').stroke();
                doc.fillColor('black').text('品  名  ・  規  格', colX.name + 10, y + 6);
                doc.text('数  量', colX.quant, y + 6);
                doc.text('単  価', colX.price, y + 6);
                doc.text('金  額', colX.amount, y + 6);
                y += 20;
            }

            // 縞模様（Construction Styleなら白地ですっきりが良いかもだが、読みやすさのため薄い線を入れる）
            doc.lineWidth(0.5).moveTo(40, y + rowHeight).lineTo(555, y + rowHeight).strokeColor('#cccccc').stroke();

            // 品名 (垂直中央寄せは難しいので、上詰め+パディング)
            doc.fillColor('black').text(item.name, colX.name + 10, y + 7, { width: colWidth.name });

            if (item.isExpense) {
                // 諸経費: 数量単価空欄
            } else {
                // 数量
                let qtyText = '';
                if (item.unit === '式' || item.unit === '%') {
                    qtyText = '1 式';
                    if (item.isWelfare) qtyText = '1 式';
                } else {
                    qtyText = `${item.quantity.toLocaleString()} ${item.unit || ''}`;
                }
                doc.text(qtyText, colX.quant, y + 7);
                doc.text(`¥ ${item.unitPrice.toLocaleString()}`, colX.price, y + 7);
            }

            doc.text(`¥ ${item.amount.toLocaleString()}`, colX.amount, y + 7);

            y += rowHeight;
        });

        // ── 合計欄 (表の下) ──
        y += 15; // 少しマージンを空ける

        // 合計ボックス
        const totalBoxX = 280;
        const totalBoxW = 275;

        // 小計
        doc.text('小  計', totalBoxX + 20, y);
        doc.text(`¥ ${totalAmount.toLocaleString()}`, totalBoxX + 190, y);
        doc.lineWidth(0.5).moveTo(totalBoxX, y + 15).lineTo(totalBoxX + totalBoxW, y + totalBoxW, y + 15).stroke();
        y += 25; // 行間広め

        // 消費税
        doc.text('消費税 (10%)', totalBoxX + 20, y);
        doc.text(`¥ ${tax.toLocaleString()}`, totalBoxX + 190, y);
        doc.lineWidth(0.5).moveTo(totalBoxX, y + 15).lineTo(totalBoxX + totalBoxW, y + 15).stroke();
        y += 25;

        // 合計
        doc.font('Mincho').fontSize(12); // 合計は明朝で
        doc.text('合  計', totalBoxX + 20, y + 5);
        doc.text(`¥ ${grandTotal.toLocaleString()}`, totalBoxX + 190, y + 5);

        // 合計二重線
        doc.lineWidth(0.5).moveTo(totalBoxX, y + 25).lineTo(totalBoxX + totalBoxW, y + 25).stroke();
        doc.lineWidth(0.5).moveTo(totalBoxX, y + 28).lineTo(totalBoxX + totalBoxW, y + 28).stroke();


        // ── 備考欄 (枠付き) ──
        const remarksY = Math.max(y + 45, doc.y + 45);
        if (remarksY > 720) { doc.addPage(); } // 簡易チェック

        doc.rect(40, remarksY, 515, 80).stroke();
        doc.font('Gothic').fontSize(9).text('備  考', 50, remarksY + 5);

        if (data.remarks) {
            doc.text(data.remarks, 50, remarksY + 20);
        } else {
            doc.fontSize(8).fillColor('#666666');
            doc.text('有効期限： 御見積提出日より30日間', 50, remarksY + 20);
            doc.text('支払条件： 御社規定による', 50, remarksY + 35);
        }

        doc.end();
    });
}

/**
 * 社印を描画する関数 (v3.1: 透過・位置調整)
 * @param {PDFKit.PDFDocument} doc 
 * @param {number} x 
 * @param {number} y 
 */
function drawSeal(doc, x, y) {
    const size = 56;
    const color = '#b22222'; // FireBrick

    doc.save();

    // ちょっと透けさせる（文字の上に乗っても読めるように）
    doc.opacity(0.85);

    // 回転させて手押し感を出す (-2度)
    doc.rotate(-2, { origin: [x + size / 2, y + size / 2] });

    // ── 外枠 (二重枠) ──
    doc.strokeColor(color);

    // 太い外枠
    doc.lineWidth(2.5);
    doc.rect(x, y, size, size).stroke();

    // 細い内枠
    doc.lineWidth(1); // 細く
    doc.rect(x + 3, y + 3, size - 6, size - 6).stroke();

    // ── 文字 (縦書き 3行) ──
    doc.fillColor(color);
    doc.font('Mincho'); // 明朝体必須

    // フォントサイズ計算
    const fontSize = 11;
    doc.fontSize(fontSize);

    // 行間
    const lineHeight = fontSize;
    const charSpacing = 3;

    // 1行目: 株式会社
    // 2行目: ミナト安全
    // 3行目: 施設之印

    // ただし、文字数に合わせて調整
    // 「㈱ミナト」
    // 「安全施設」
    // 「 之 印 」

    // 座標計算
    const colWidth = (size - 6) / 3;
    const startX = x + 3 + colWidth * 2.1; // 右から書くのが正式だが、横書き3行で縦に見せるのが簡単
    // いや、角印は通常「右列→左列」の縦書き

    const rightColX = x + size - colWidth - 2;
    const centerColX = x + size / 2 - 5;
    const leftColX = x + 6;

    const startTextY = y + 6;

    // 右列: 株式 (株)
    doc.text('株', rightColX, startTextY);
    doc.text('式', rightColX, startTextY + lineHeight + charSpacing);
    doc.text('会', rightColX, startTextY + (lineHeight + charSpacing) * 2);
    // 社が溢れるので、
    // 「株式会社」を右列に詰めるのが難しい。
    // 一般的には「株式会社」で1行、「ミナト安全」で1行、「施設之印」で1行。
    // 右から左へ。

    // リセットして描画
    // 右列
    drawVerticalText(doc, '株式', rightColX, startTextY + 5, fontSize, charSpacing);
    drawVerticalText(doc, '会社', rightColX, startTextY + 25, fontSize, charSpacing);
    // うまくいかないので、シンプルに「横書きの改行」でそれっぽく見せる

    // 配置リセット
    // 1行目 (上段): 株 式 会 社
    // 2行目 (中段): ミナト安全
    // 3行目 (下段): 施設之印
    // これだと横書きに見える。

    // やはり縦書き風に自力配置
    // 右列: 株式会社 (4文字はきついので、詰める)
    // 中列: ミナト安全 (5文字はきつい)
    // 左列: 施設之印 (4文字)

    // バランス調整:
    // 右: (株)ミナト
    // 中: 安全施設
    // 左: 之印

    // これを右から配置
    const col1X = x + size - 16; // 右
    const col2X = x + size / 2 - 6; // 中
    const col3X = x + 6;         // 左

    // 右: (株)ミナト
    const textY = y + 5;
    const spacing = 12; // 文字送り

    doc.text('㈱', col1X, textY);
    doc.text('ミ', col1X, textY + spacing);
    doc.text('ナ', col1X, textY + spacing * 2);
    doc.text('ト', col1X, textY + spacing * 3);

    // 中: 安全施設
    doc.text('安', col2X, textY);
    doc.text('全', col2X, textY + spacing);
    doc.text('施', col2X, textY + spacing * 2);
    doc.text('設', col2X, textY + spacing * 3);

    // 左: 之印
    // 中央寄せしたい
    const stampY = textY + spacing + 6;
    doc.text('之', col3X, stampY);
    doc.text('印', col3X, stampY + spacing);

    // かすれ処理 (ノイズを描画して古めかしく)
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

/**
 * 縦書きヘルパー (簡易)
 */
function drawVerticalText(doc, text, x, y, size, spacing) {
    let currentY = y;
    for (let i = 0; i < text.length; i++) {
        doc.text(text[i], x, currentY);
        currentY += size + spacing;
    }
}

module.exports = { generateEstimatePDF };
