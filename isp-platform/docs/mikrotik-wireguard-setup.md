# MikroTik And WireGuard Setup

This is the private road between ISP-OS and your router. Do this only after the admin app and network agent are working.

## What You Need

1. A small Linux server with a public IP address. This is the WireGuard server.
2. A MikroTik running RouterOS v7 with internet access.
3. A laptop on the same network as the MikroTik for the first setup.
4. A dedicated RouterOS user for ISP-OS. Do not use your everyday admin account.

## Step 1: Set Up The WireGuard Server

On Ubuntu or Debian, run these commands on the Linux server:

```bash
sudo apt update
sudo apt install -y wireguard
umask 077
wg genkey | tee server-private.key | wg pubkey > server-public.key
sudo install -m 600 server-private.key /etc/wireguard/server-private.key
sudo install -m 644 server-public.key /etc/wireguard/server-public.key
```

Create `/etc/wireguard/wg0.conf`:

```ini
[Interface]
Address = 10.77.0.1/24
ListenPort = 51820
PrivateKey = PASTE_THE_SERVER_PRIVATE_KEY_HERE
```

Open only UDP port `51820` in the server firewall, then start it:

```bash
sudo systemctl enable --now wg-quick@wg0
sudo wg show
```

## Step 2: Tell ISP-OS Where The Server Is

Put these values in `apps/web/.env`, then restart the web app:

```env
WIREGUARD_SERVER_PUBLIC_KEY="contents of server-public.key"
WIREGUARD_SERVER_ENDPOINT="your-server-public-ip-or-name"
WIREGUARD_SERVER_PORT="51820"
WIREGUARD_SERVER_NETWORK="10.77.0.0/24"
```

## Step 3: Register The Router

1. Sign in to ISP-OS.
2. Open **Routers**, then press **Register Router**.
3. Enter the router's LAN address and API port. Use `8728` only from a trusted local network or through the tunnel.
4. After you submit, ISP-OS shows two code blocks.

## Step 4: Paste Both Pieces

1. Copy the first block into `/etc/wireguard/wg0.conf` on the Linux server, then run `sudo systemctl restart wg-quick@wg0`.
2. Copy the second block into the MikroTik terminal. It creates the router side of the tunnel.
3. Check the tunnel: run `sudo wg show` on Linux. You should see a recent handshake after the MikroTik connects.
4. Return to **Routers** and use **Check connection**.

## Keep It Safe

- Do not expose MikroTik API port `8728` to the public internet.
- Use a dedicated limited RouterOS user, with a strong password.
- Keep the WireGuard private keys private. Never paste them into chat or a ticket.
- Make a backup before pasting router configuration commands.