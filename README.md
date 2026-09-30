# MX Files

Private upload dashboard + public direct links, built for Cloudflare Pages Functions and R2.

## What this project does

- Uploads files in 10 MiB multipart chunks, so large files are not forced through one oversized Worker request.
- Stores files in a private R2 bucket.
- Generates stable short links such as `/f/a1b2c3d4e5`.
- Previews images, video, audio and PDF inline when possible.
- Downloads other file types as attachments.
- Includes an admin-only file manager with search, rename, delete and copy-link actions.
- Uses only a Pages project, one R2 bucket and one secret admin token. No custom domain is required.

## Cloudflare setup

### 1. Create the R2 bucket

Create an R2 bucket named:

`mx-files-storage`

The repository already binds it as `FILES` in `wrangler.toml`.

### 2. Create the Pages project

Connect this GitHub repository:

`mazenmix/uploader`

Use:

- Production branch: `main`
- Build command: leave blank
- Build output directory: `public`

The project can use its free `*.pages.dev` address. A custom domain is optional.

### 3. Add the admin secret

In Cloudflare Pages > Settings > Variables and Secrets, add a secret named:

`ADMIN_TOKEN`

Use a long random value. Do not commit it to GitHub.

### 4. Deploy

After the bucket exists and `ADMIN_TOKEN` is configured, deploy the Pages project. The Functions directory will provide the API automatically.

## Local development

```bash
npm install
npm run dev
```

For local R2 development Wrangler uses its local storage simulation unless you configure a remote binding.

## Storage architecture

```text
Browser
  -> Cloudflare Pages UI
  -> Pages Function multipart API
  -> private R2 bucket

Public link
  /f/<short-id>
  -> Pages Function
  -> R2 object stream
```

## Security model

Uploading and file-management API routes require the bearer value stored in the `ADMIN_TOKEN` secret. The browser stores the entered key only in `sessionStorage`, so closing the browser session clears it. Public `/f/<id>` links intentionally do not require authentication so they can be shared.

## Notes

- This build has a 10 GiB per-file application guardrail. You can change `MAX_FILE_SIZE` in `functions/api/upload.js`.
- R2 multipart parts are 10 MiB in the browser; this is above R2's 5 MiB minimum for non-final parts.
- The UI shows 10 GB as a free-tier storage reference; actual billing and account limits are controlled by your Cloudflare account.
