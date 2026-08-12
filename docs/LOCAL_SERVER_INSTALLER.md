# ALERT-CIA Local Server Installer

This installer packages the office LAN sync server used by ALERT-CIA tablets and dispatcher PCs when cloud access is unavailable.

## What It Installs

- ALERT-CIA Local Server on port `4000`
- Persistent SQLite database at `%ProgramData%\ALERT-CIA\local-server\alert-cia-local.db`
- Server log at `%ProgramData%\ALERT-CIA\local-server\server.log`
- Windows firewall rule for TCP port `4000`
- Windows startup task named `ALERT-CIA Local Server`

## Build the Installer

1. Install Inno Setup 6.
2. Optional: put the Node.js MSI at:

   ```txt
   installer\dependencies\node-v22-x64.msi
   ```

   If this file exists, the installer bundles and silently installs Node.js.

3. Run:

   ```cmd
   build-alert-cia-local-server-installer.cmd
   ```

   This script runs `npm run build` first. The installer must include the generated
   `dist` folder; otherwise `/health` will work but `/admin` will show
   "Local ALERT-CIA endpoint not found."

4. The installer output is created at:

   ```txt
   installer\dist\ALERT-CIA-Local-Server-Installer.exe
   ```

## Office PC Installation

Run the installer as administrator on the office PC.

After installation, test on the office PC:

```txt
http://127.0.0.1:4000/health
```

Then test from a tablet on the same LAN:

```txt
http://OFFICE_PC_IP:4000/health
```

Example:

```txt
http://192.168.100.8:4000/health
```

## Tablet Configuration

In ALERT-CIA Settings > Local Server:

```txt
Protocol: HTTP
Hostname/IP: 192.168.100.8
Port: 4000
Timeout: 2500
```

## Notes

- The office PC must stay powered on and awake for LAN sync to work.
- Vercel deploys the PWA frontend only; it does not host this local LAN server.
- Supabase remains the cloud source of truth after queued local records sync successfully.
