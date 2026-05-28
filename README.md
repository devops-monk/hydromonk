# 💧 HydroMonk — Drink Water Reminder

> Smart hydration reminders with streak tracking, water benefits & daily goals — by [DevOps-Monk](https://github.com/devops-monk)

[![Build & Package](https://github.com/devops-monk/hydromonk/actions/workflows/build.yml/badge.svg)](https://github.com/devops-monk/hydromonk/actions/workflows/build.yml)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![Version](https://img.shields.io/badge/version-1.0.0-brightgreen)

---

## 🌊 What is HydroMonk?

HydroMonk is a lightweight Chrome extension that reminds you to drink water throughout the day. It tracks your daily intake, shows your progress with a beautiful animated water circle, rewards consistent hydration with streaks, and teaches you why water matters — all without leaving your browser.

---

## ✨ Features

- **Animated water circle** — Visual fill that rises as you log each glass
- **Smart reminders** — Chrome notifications on your schedule (20 / 30 / 45 / 60 / 90 min)
- **Active hours window** — Reminders only fire between your set hours (e.g. 8am–8pm)
- **One-click logging** — Quick-add buttons for 200 / 250 / 350 / 500ml or a custom amount
- **Streak tracking** — Badge on the extension icon tracks consecutive days hitting your goal
- **Science-backed facts** — 14 rotating hydration facts shown in every notification
- **Snooze support** — "Snooze 10 min" button directly on the notification
- **Weight-based goal calculator** — Enter your weight to get a personalised daily target
- **Benefits panel** — 8 evidence-based benefits of staying hydrated
- **Drink sound** — Satisfying water drop sound plays when you log (Web Audio API)
- **Privacy first** — 100% local storage, no account, no analytics, no ads

---

## 🚀 Installation

### From Chrome Web Store
*(Coming soon)*

### Load as unpacked extension (development)

```bash
git clone git@github.com:devops-monk/hydromonk.git
cd hydromonk
npm install
npm run build
```

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `dist/` folder

---

## 🛠 Development

```bash
# Install dependencies
npm install

# Build once
npm run build

# Watch mode (rebuilds on file change)
npm run dev
```

**Tech stack:**
- Chrome Extension Manifest V3
- TypeScript + Vite
- `vite-plugin-web-extension`
- Pure CSS — custom wave animations, no UI framework

**Project structure:**
```
src/
├── background/
│   └── service-worker.ts   # Alarms, notifications, badge, streak
├── popup/
│   ├── popup.html           # Extension popup UI
│   ├── popup.ts             # All popup logic
│   └── popup.css            # Styles & animations
└── utils/
    └── storage.ts           # chrome.storage helpers & types
```

---

## 📦 CI / CD

Every push to `main` automatically:

1. Installs dependencies
2. Builds the extension
3. Packages `dist/` as `hydromonk-X.X.X.zip`
4. Uploads it as a downloadable workflow artifact (30-day retention)

**To publish a release**, push a version tag:

```bash
git tag v1.0.1
git push origin v1.0.1
```

This triggers a GitHub Release with the zip attached — ready to upload to the Chrome Web Store.

---

## ⚙️ Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Reminder interval | 60 min | How often to show a reminder |
| Daily goal | 8 glasses | Target number of glasses per day |
| Glass size | 250 ml | Volume counted per glass |
| Active hours | 08:00 – 20:00 | Only remind within this window |
| Weekdays only | Off | Skip reminders on weekends |
| Sound | On | Play sound with notifications |
| Reminders enabled | On | Master toggle to pause all reminders |

---

## 💡 Why Water Matters

| Fact | Source |
|------|--------|
| 73% of your brain is water | Scientific consensus |
| 1% dehydration = 12% productivity drop | Workplace studies |
| Morning water boosts metabolism by up to 24% | Clinical research |
| 75% of headaches are caused by mild dehydration | Medical literature |
| Only 23% of desk workers drink enough water daily | Workplace surveys |

---

## 📄 License

MIT © [DevOps-Monk](https://github.com/devops-monk)
