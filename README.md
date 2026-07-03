# 足球大聯盟 HTML 原型

這是純 HTML/CSS/Canvas 的第一版原型，可以直接用瀏覽器開啟 `index.html` 遊玩。

## GitHub Pages 發布

這個專案已加入 GitHub Pages 自動部署設定。推送到 GitHub 的 `main` 分支後，GitHub Actions 會直接部署目前目錄中的靜態檔案，不需要額外建置步驟。

第一次使用時：

1. 在 GitHub 建立 repository。
2. 將本機專案推送到該 repository 的 `main` 分支。
3. 到 repository 的 Settings > Pages，將 Source 設為 GitHub Actions。
4. 等待 Actions 跑完後，即可在 Pages 提供的網址開啟遊戲。

## 已完成內容

- 一人 / 兩人遊玩流程
- 兩隊可同隊或不同隊
- 一人模式可選電腦強度
- 守門員 / 一般球員職位選擇
- 玩家姓名顯示
- 固定全場俯視角 2D 畫面
- 4v4 比賽
- 3 分鐘計時
- 比分系統
- 開場倒數
- 長按蓄力射門
- 傳球、搶球、自動吸球、帶球
- AI 跑位、防守、傳球、射門
- 簡化越位規則

## 操作

- 玩家一：WASD 移動，R 蓄力射門，E 傳球，Q 搶球，F 切換球員
- 玩家二：IJKL 移動，P 蓄力射門，O 傳球，U 搶球

## 未來轉 Unity 的保留彈性

目前 `game.js` 已刻意用接近遊戲系統的方式切分：

- `TEAM_DEFS`、`DIFFICULTIES`、`ROLE_LABELS`：可轉成 Unity 的 ScriptableObject 或 JSON 設定。
- `createPlayers`、`resetPositions`：可轉成球員生成與重置系統。
- `updateHumanControllers`：可轉成 Unity Input System。
- `updateAI`、`getAITarget`、`maybeAIUseBall`：可轉成 AI Controller。
- `updateBall`、`tryAutoPickup`、`shootBall`、`performPass`：可轉成球與互動規則系統。
- `isOffside`：可獨立成規則判定模組。
- `drawField`、`drawPlayers`、`drawBall`：未來在 Unity 中會被 Sprite、粒子、材質與攝影機取代。

下一階段若要擴充，建議先把球場資料、隊伍資料、球員能力值拆成外部 JSON，這樣未來 Unity 版可以直接沿用同一份設計資料。

## 2026-07-03 更新

- 降低電腦球員速度，保留玩家操作速度。
- 兩人遊玩也會進入電腦強度選擇頁面。
- 守門員的 R / P 不再射門，改為擋球。
- 球撞到球員時會依照碰撞法線與反彈係數彈開，降低穿人問題。
- 比賽右上角玩家資訊移除蓄力百分比與蓄力條，蓄力只顯示在球員身上的圓形進度。
