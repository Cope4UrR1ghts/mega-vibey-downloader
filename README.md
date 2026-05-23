# mega-vibey-downloader

Tool to download from mega.nz that ignores bandwith quota.

Is it Vibe-oded? yes!
Does it work? yes!
Should you use it? hell nah!


## What is it?
A POGVCDTUM ( piece of garbage vibe-coded downloader that uses `megajs`.)

- A small electron  MEGA downloader app.
- Built with bad vibes and `megajs` for Mega.nz support.
- Not polished. Not pretty. Just functional enough to work.

## Why it exists

I hate Megas Download Quota so I needed a way to download without a limit. This is the result

## How to use

1. Download from Releases for your operating system 
    - Linux tested
    - Windows untested (can't be bothered to install)
2. Open the program
3. Paste Mega Link
4. Start a download

## Build it yourself

```bash
git clone https://github.com/Cope4UrR1ghts/mega-vibey-downloader.git
cd mega-vibey-downloader/
npm install
npm install --save-dev electron electron-builder megajs
npm run start
```

To create a packaged app instead of running in development mode, run:

```bash
npm run build
```

This installs all dependencies and starts the Electron app. `npm run build` packages the app into `dist/` using `electron-builder`.

## Notes

- This is a throwaway project.
- Expect rough edges, jank, and hacks.
- It uses `megajs` for the Mega download logic.

## Usage

Open the app and paste MEGA links in it.

## License

Do whatever you want with this mess. I do not care.
