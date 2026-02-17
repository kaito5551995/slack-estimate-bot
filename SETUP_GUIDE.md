# 見積書PDF自動生成 Slack Bot セットアップガイド

## 目次
1. [Slack Appの作成](#1-slack-appの作成)
2. [Botの権限設定](#2-botの権限設定)
3. [スラッシュコマンドの登録](#3-スラッシュコマンドの登録)
4. [Render.comへのデプロイ](#4-rendercomへのデプロイ)
5. [Interactivityの設定](#5-interactivityの設定)
6. [ワークスペースへのインストール](#6-ワークスペースへのインストール)
7. [使い方](#7-使い方)

---

## 1. Slack Appの作成

1. [Slack API](https://api.slack.com/apps) にアクセス
2. **「Create New App」** をクリック
3. **「From scratch」** を選択
4. App Name: `見積書Bot`（任意の名前）
5. ワークスペースを選択して **「Create App」**

## 2. Botの権限設定

1. 左メニューの **「OAuth & Permissions」** をクリック
2. **「Scopes」** セクションまでスクロール
3. **Bot Token Scopes** に以下を追加:
   - `commands` - スラッシュコマンド
   - `chat:write` - メッセージ送信
   - `files:write` - ファイルアップロード

## 3. スラッシュコマンドの登録

1. 左メニューの **「Slash Commands」** をクリック
2. **「Create New Command」** をクリック
3. 以下を入力:
   - **Command**: `/見積もり`
   - **Request URL**: `https://あなたのRenderURL.onrender.com/slack/events`
   - **Short Description**: `見積書PDFを作成します`
   - **Usage Hint**: （空欄でOK）
4. **「Save」** をクリック

## 4. Render.comへのデプロイ

### 4.1 GitHubリポジトリの準備

1. このプロジェクトをGitHubリポジトリにプッシュ:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/あなた/見積書bot.git
   git push -u origin main
   ```

### 4.2 Renderでデプロイ

1. [Render.com](https://render.com) にサインアップ/ログイン
2. **「New +」** → **「Web Service」** をクリック
3. GitHubリポジトリを接続
4. 設定:
   - **Name**: `slack-estimate-bot`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node src/app.js`
5. **Environment Variables** に以下を追加:
   - `SLACK_BOT_TOKEN`: Slack Appの **OAuth & Permissions** ページにある **Bot User OAuth Token**（`xoxb-` で始まる）
   - `SLACK_SIGNING_SECRET`: Slack Appの **Basic Information** ページにある **Signing Secret**
6. **「Deploy」** をクリック

### 4.3 デプロイ後のURL確認

デプロイ完了後、Renderが提供するURL（例: `https://slack-estimate-bot.onrender.com`）をメモしてください。

## 5. Interactivityの設定

1. Slack Appの設定ページに戻る
2. 左メニューの **「Interactivity & Shortcuts」** をクリック
3. **Interactivity** を **「On」** に切り替え
4. **Request URL** に `https://あなたのRenderURL.onrender.com/slack/events` を入力
5. **「Save Changes」** をクリック

## 6. ワークスペースへのインストール

1. 左メニューの **「Install App」** をクリック
2. **「Install to Workspace」** をクリック
3. 権限を確認して **「許可する」**

## 7. 使い方

### 基本操作

1. Slackの任意のチャンネルで `/見積もり` を入力
2. 表示されるフォームに以下を入力:
   - **宛先（社名）**: お客様の会社名
   - **担当者名**: 担当者のお名前
   - **品目**: 1行に1品目ずつ `品名, 数量, 単価` の形式で入力

### 入力例

```
コーン標識（赤白）, 10, 3500
安全ベスト（反射付き）, 20, 2800
LED回転灯, 5, 12000
```

3. **「PDF生成」** ボタンをクリック
4. 見積書PDFがSlack DMに送信されます

### 自動計算

- **金額** = 数量 × 単価（品目ごとに自動計算）
- **小計** = 全品目の金額合計
- **消費税** = 小計 × 10%
- **合計** = 小計 + 消費税

---

## トラブルシューティング

| 問題 | 解決方法 |
|------|----------|
| コマンドが反応しない | Render.comのサービスが起動しているか確認。無料プランは15分無通信でスリープします |
| モーダルが表示されない | Interactivityが有効か、Request URLが正しいか確認 |
| PDFが届かない | Bot Token Scopesに `files:write` が含まれているか確認 |
