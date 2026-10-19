# opencode-router demo video

This folder contains the source of the demo video in the main README. It is a
[Remotion](https://www.remotion.dev) project. It is not part of the npm package.

| Scene | File |
| :-- | :-- |
| 1. Problem: the agent stops at a rate limit | `src/scenes/ProblemScene.tsx` |
| 2. Title | `src/scenes/TitleScene.tsx` |
| 3. Scorecard: `/refresh-routing` | `src/scenes/ScorecardScene.tsx` |
| 4. Failover at 85% of the 5-hour limit | `src/scenes/FailoverScene.tsx` |
| 5. Install | `src/scenes/InstallScene.tsx` |

`src/RouterDemo.tsx` puts the scenes in sequence. `src/Root.tsx` registers the full
video (`RouterDemo`) and each scene.

## Preview

Run these commands in this folder (PowerShell, CMD, or Git Bash):

```bash
npm install
npm run dev
```

Open `http://localhost:3000/RouterDemo`.

## Render

```bash
npx remotion render RouterDemo out/router-demo.mp4
npx remotion render RouterDemo out/router-demo.gif --codec=gif --scale=0.5 --every-nth-frame=2
```

Copy both files from `out/` to `../docs/`, because the main README uses them from there.

### Social preview

The social preview is the image that GitHub shows when someone shares a link to the
repo. It is a still image of 1280 × 640 pixels (`src/SocialPreview.tsx`).

```bash
npx remotion still SocialPreview out/social-preview.png
```

Copy it to `../docs/social-preview.png`.

## License

Remotion has its own license. It is free for teams of up to 3 people. Read
<https://www.remotion.dev/license> before you use it in a larger company.
