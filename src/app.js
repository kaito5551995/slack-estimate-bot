require('dotenv').config();
const { App, ExpressReceiver } = require('@slack/bolt');
const express = require('express');
const path = require('path');
const { generateDocument } = require('./pdfGenerator');

// ExpressReceiverを使用して、通常のExpressとしても動作するようにする
const receiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET,
});

const app = new App({
    token: process.env.SLACK_BOT_TOKEN,
    receiver: receiver,
});

// 静的ファイルの配信
receiver.app.use('/assets', express.static(path.join(__dirname, '../assets')));
receiver.app.use(express.static(path.join(__dirname, 'public')));

// 調整ツール用のルート
receiver.app.get('/adjust', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/index.html'));
});

// ── 共通モーダル定義 ──
const getModalView = (type, title, callbackId) => ({
    type: 'modal',
    callback_id: callbackId,
    private_metadata: type, // メタデータでタイプを渡す
    title: { type: 'plain_text', text: title },
    submit: { type: 'plain_text', text: 'PDF生成' },
    close: { type: 'plain_text', text: 'キャンセル' },
    blocks: [
        {
            type: 'input',
            block_id: 'client_company',
            label: { type: 'plain_text', text: '宛先（社名）' },
            element: {
                type: 'plain_text_input',
                action_id: 'value',
                placeholder: { type: 'plain_text', text: '例: 株式会社〇〇' }
            }
        },
        {
            type: 'input',
            block_id: 'client_person',
            label: { type: 'plain_text', text: '担当者名' },
            element: {
                type: 'plain_text_input',
                action_id: 'value',
                placeholder: { type: 'plain_text', text: '例: 山田太郎' }
            }
        },
        {
            type: 'input',
            block_id: 'items_input',
            label: { type: 'plain_text', text: '品目（1行に1品目）' },
            element: {
                type: 'plain_text_input',
                action_id: 'value',
                multiline: true,
                placeholder: {
                    type: 'plain_text',
                    text: '例:\nコーン標識, 10, 3500\n諸経費, 7%\n法定福利費'
                }
            },
            hint: {
                type: 'plain_text',
                text: '「法定福利費」や「諸経費, 10%」のような省略入力も可能です'
            }
        },
        {
            type: 'input',
            block_id: 'remarks',
            label: { type: 'plain_text', text: '備考（任意）' },
            optional: true,
            element: {
                type: 'plain_text_input',
                action_id: 'value',
                multiline: true,
                placeholder: { type: 'plain_text', text: '備考を入力（省略時はデフォルト文言）' }
            }
        }
    ]
});

// ── スラッシュコマンド ──
app.command('/見積もり', async ({ ack, body, client }) => {
    await ack();
    await client.views.open({
        trigger_id: body.trigger_id,
        view: getModalView('estimate', '見積書作成', 'doc_creation_modal')
    });
});

app.command('/請求書', async ({ ack, body, client }) => {
    await ack();
    await client.views.open({
        trigger_id: body.trigger_id,
        view: getModalView('invoice', '請求書作成', 'doc_creation_modal')
    });
});

app.command('/領収書', async ({ ack, body, client }) => {
    await ack();
    await client.views.open({
        trigger_id: body.trigger_id,
        view: getModalView('receipt', '領収書作成', 'doc_creation_modal')
    });
});

// ── モーダル送信処理 ──
app.view('doc_creation_modal', async ({ ack, view, body, client }) => {
    await ack();

    const type = view.private_metadata || 'estimate';

    let prefix = 'Estimate';
    let docName = '見積書';
    if (type === 'invoice') { prefix = 'Invoice'; docName = '請求書'; }
    if (type === 'receipt') { prefix = 'Receipt'; docName = '領収書'; }

    const values = view.state.values;
    const clientCompany = values.client_company.value.value;
    const clientPerson = values.client_person.value.value;
    const itemsText = values.items_input.value.value;
    const remarks = values.remarks?.value?.value || '';

    const rawItems = itemsText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => {
            let normalizedLine = line
                .replace(/、/g, ',')
                .replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));

            const parts = normalizedLine.split(/[,，\t]+/).map(p => p.trim());
            const name = parts[0] || '';
            let quantityStr = parts[1] || '0';
            let unitPrice = parseInt(parts[2], 10) || 0;
            let quantity = 0;
            let unit = '';

            if (name.includes('法定福利費')) {
                return { name: '法定福利費', quantity: 1, unit: '式', unitPrice: 0, originalQuantity: '1' };
            } else if (name.includes('諸経費')) {
                if (quantityStr.endsWith('%') || !isNaN(parseFloat(quantityStr))) {
                    quantity = parseFloat(quantityStr.replace('%', ''));
                    unit = '%';
                    return { name: '諸経費', quantity, unit, unitPrice: 0, originalQuantity: quantityStr };
                }
            }

            if (quantityStr === '一式') {
                quantity = 1;
                unit = '式';
            } else {
                const match = quantityStr.match(/^([\d.]+)(.*)$/);
                if (match) {
                    quantity = parseFloat(match[1]);
                    unit = match[2].trim();
                } else {
                    quantity = 0;
                }
            }

            return { name, quantity, unit, unitPrice, originalQuantity: quantityStr };
        })
        .filter(item => item.name);

    if (rawItems.length === 0) {
        await client.chat.postMessage({
            channel: body.user.id,
            text: `⚠️ 品目が正しく入力されていません。「品名, 数量, 単価」の形式で入力してください。`
        });
        return;
    }

    const items = [];
    let taxableSubtotal = 0;

    rawItems.forEach(item => {
        if (!item.name.includes('法定福利費') && !item.name.includes('諸経費')) {
            const amount = Math.floor(item.quantity * item.unitPrice);
            items.push({ ...item, amount });
            taxableSubtotal += amount;
        }
    });

    rawItems.forEach(item => {
        if (item.name.includes('諸経費')) {
            const rate = item.quantity / 100;
            const amount = Math.floor(taxableSubtotal * rate);
            items.push({ ...item, unitPrice: 0, amount, isExpense: true });
        } else if (item.name.includes('法定福利費')) {
            const amount = Math.floor(taxableSubtotal * 0.165);
            items.push({ ...item, quantity: 1, unit: '式', unitPrice: amount, amount, isWelfare: true });
        }
    });

    try {
        const pdfBuffer = await generateDocument(type, {
            clientCompany,
            clientPerson,
            items,
            remarks: remarks || undefined
        });

        const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
        const total = subtotal + Math.floor(subtotal * 0.1);

        const now = new Date();
        const dateStr = `${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}`;
        const fileName = `${prefix}_${dateStr}.pdf`;

        const { channel } = await client.conversations.open({
            users: body.user.id
        });

        const targetChannelId = String(channel.id);

        const { WebClient } = require('@slack/web-api');
        const web = new WebClient(process.env.SLACK_BOT_TOKEN);

        await web.files.uploadV2({
            channel_id: targetChannelId,
            initial_comment: `📄 *${docName}を作成しました*\n\n` +
                `• 宛先: ${clientCompany} / ${clientPerson} 様\n` +
                `• 品目数: ${items.length}件\n` +
                `• 合計金額: ¥${total.toLocaleString('ja-JP')}（税込）`,
            file_uploads: [
                {
                    file: pdfBuffer,
                    filename: fileName,
                }
            ]
        });
    } catch (err) {
        console.error('PDF生成エラー:', err);
        await client.chat.postMessage({
            channel: body.user.id,
            text: `❌ ${docName}の生成中にエラーが発生しました。\n\`\`\`${err.message}\`\`\``
        });
    }
});

// ── サーバー起動 ──
(async () => {
    const port = process.env.PORT || 3000;
    await app.start(port);
    console.log(`⚡ 見積書Botが起動しました (port: ${port})`);
})();
