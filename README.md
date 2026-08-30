# ProxyNet — شبکه پراکسی خصوصی

A self-hosted, censorship-resistant proxy network built on **VLESS + REALITY**, designed to work reliably in heavily filtered networks.

> **راهنما به فارسی در پایین صفحه موجود است ↓**

---

## 🔗 Quick Links

| | |
|---|---|
| 🌐 **Panel / پنل** | http://108.61.99.207 |
| 📦 **Agent Downloads** | [GitHub Releases → v1.0.0](https://github.com/mrAboalfazl/ProxyNet/releases/tag/v1.0.0) |
| 🐧 **Linux agent** | [agent-linux](https://github.com/mrAboalfazl/ProxyNet/releases/download/v1.0.0/agent-linux) |
| 🪟 **Windows agent** | [agent.exe](https://github.com/mrAboalfazl/ProxyNet/releases/download/v1.0.0/agent.exe) |

---

## 👤 For Users — How to Connect

### Step 1 — Register
Go to the panel and create an account with your email and a password.  
You can optionally add your phone number to enable SMS OTP login.

### Step 2 — Create a Proxy Credential
1. Log in → go to **My Credentials**
2. Click **+ New credential**, give it a label (e.g. "Phone")
3. Copy the **VLESS URI** that appears

### Step 3 — Connect
Import the VLESS URI into any compatible client:

| Client | Platform | Link |
|---|---|---|
| **v2rayNG** | Android | [Play Store](https://play.google.com/store/apps/details?id=com.v2ray.ang) |
| **Shadowrocket** | iOS | App Store |
| **v2rayN** | Windows | [GitHub](https://github.com/2dust/v2rayN) |
| **Nekoray** | Windows/Linux | [GitHub](https://github.com/MatsuriDayo/nekoray) |
| **Hiddify** | All platforms | [GitHub](https://github.com/hiddify/hiddify-app) |

In your client, use **Import from clipboard** or **Add from URI**, paste the VLESS URI, and connect.

---

## 🖥️ For Node Operators — How to Add Your Server to the Network

Anyone with an account can contribute a server (node) to the network. Nodes go through a quick admin review before going live.

### Requirements
- A Linux VPS (Ubuntu 20.04+ or Debian 11+ recommended)
- Root or sudo access
- Port 443 open (for VLESS/REALITY traffic)
- At least 1 vCPU / 512 MB RAM

---

### Step 1 — Register and log in to the panel

Go to **http://108.61.99.207** and create an account.

---

### Step 2 — Add your node in the panel

1. In the sidebar click **My Nodes** (نودهای من)
2. Click **+ Add Node**
3. Fill in:
   - **Label** — a nickname for your server (e.g. `germany-vps-01`)
   - **Country Code** — ISO 3166-1 alpha-2 code (e.g. `DE`, `NL`, `US`, `TR`)
4. Click **Add Node**
5. You will see an **enrollment command** — **copy it**, you'll need it in Step 4

The node starts in **Pending** state. The enrollment command is valid for **7 days**.

---

### Step 3 — Download the agent on your server

SSH into your Linux server and download the agent binary:

```bash
# Download
wget -O agent https://github.com/mrAboalfazl/ProxyNet/releases/download/v1.0.0/agent-linux

# Make executable
chmod +x agent
```

Or with curl:
```bash
curl -L -o agent https://github.com/mrAboalfazl/ProxyNet/releases/download/v1.0.0/agent-linux
chmod +x agent
```

---

### Step 4 — Run the enrollment command

The enrollment command was shown in the panel after you added your node. It looks like this:

```bash
./agent -enroll -endpoint https://api.civonex.ir/api -token YOUR_TOKEN_HERE
```

Run it on your server. You should see:

```
enrollment successful
```

If it succeeds, your node's status in the panel will change to show **Agent Connected** (ایجنت متصل است).

---

### Step 5 — Run the agent as a service

After enrollment, run the agent in the background so it keeps sending heartbeats and serving traffic once approved:

#### Option A — systemd (recommended)

```bash
# Create agent config directory
sudo mkdir -p /etc/proxy-agent

# Create systemd service
sudo tee /etc/systemd/system/proxy-agent.service > /dev/null << 'EOF'
[Unit]
Description=ProxyNet Agent
After=network.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/root/agent
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable proxy-agent
sudo systemctl start proxy-agent

# Check status
sudo systemctl status proxy-agent
```

#### Option B — screen / tmux (quick test)

```bash
screen -S agent
./agent
# Press Ctrl+A then D to detach
```

---

### Step 6 — Wait for admin approval

Your node will appear as **Pending Approval** in the admin panel. An admin will review it and approve it. Once approved:
- Status changes to **Active** → then **Healthy** after the first heartbeat
- Your node starts receiving traffic from users

You'll see the status update in **My Nodes** when you refresh the page.

---

### Troubleshooting

| Problem | Solution |
|---|---|
| `enrollment failed: invalid token` | Token expired (7 days) — generate a new one from the panel |
| `enrollment failed: connection refused` | Check firewall — make sure the agent can reach `api.civonex.ir` port 443 |
| Agent crashes immediately | Check logs: `journalctl -u proxy-agent -f` |
| Node stuck in Pending | Admin hasn't approved yet — wait or contact the admin |
| Token already used | Each token can only be used once — generate a new one |

---

### How it works (technical overview)

```
User device
    │  VLESS + REALITY (looks like normal HTTPS)
    ▼
Your Node (edge/exit)
    │  Forwards encrypted traffic
    ▼
Destination website
```

- The agent connects to the control plane to receive configuration
- xray-core handles actual traffic forwarding with REALITY camouflage
- Traffic logs are **disabled** — node operators cannot see user destinations or content
- The control plane pushes routing config to approved nodes automatically

---

---

# راهنمای فارسی — اضافه کردن نود به شبکه

هر کاربری که حساب کاربری دارد می‌تواند سرور خود را به عنوان نود به شبکه اضافه کند.  
نودها پس از بررسی توسط ادمین فعال می‌شوند.

## پیش‌نیازها
- یک VPS لینوکسی (ترجیحاً Ubuntu 20.04+ یا Debian 11+)
- دسترسی root یا sudo
- پورت 443 باز باشد
- حداقل 1 vCPU و 512 مگابایت RAM

---

## مرحله ۱ — ثبت‌نام و ورود به پنل

به آدرس **http://108.61.99.207** بروید و حساب کاربری بسازید.

---

## مرحله ۲ — افزودن نود در پنل

۱. از منوی کناری روی **نودهای من** کلیک کنید  
۲. روی **+ افزودن نود** کلیک کنید  
۳. اطلاعات را وارد کنید:  
   - **برچسب**: یک نام برای سرورتان (مثلاً `germany-01`)  
   - **کد کشور**: کد ISO دو حرفی کشور سرور (مثلاً `DE`, `NL`, `TR`, `US`)  
۴. روی **افزودن نود** کلیک کنید  
۵. **دستور ثبت‌نام** که نمایش داده می‌شود را کپی کنید — در مرحله ۴ نیاز است

توکن ثبت‌نام **۷ روز** اعتبار دارد.

---

## مرحله ۳ — دانلود ایجنت روی سرور

وارد سرور لینوکسی خود شوید و ایجنت را دانلود کنید:

```bash
wget -O agent https://github.com/mrAboalfazl/ProxyNet/releases/download/v1.0.0/agent-linux
chmod +x agent
```

---

## مرحله ۴ — اجرای دستور ثبت‌نام

دستوری که از پنل کپی کردید را روی سرور اجرا کنید:

```bash
./agent -enroll -endpoint https://api.civonex.ir/api -token TOKEN_شما
```

پیام `enrollment successful` نشان می‌دهد که ثبت‌نام موفق بوده است.

---

## مرحله ۵ — اجرای دائمی ایجنت

```bash
sudo tee /etc/systemd/system/proxy-agent.service > /dev/null << 'EOF'
[Unit]
Description=ProxyNet Agent
After=network.target

[Service]
Type=simple
ExecStart=/root/agent
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable proxy-agent
sudo systemctl start proxy-agent
```

---

## مرحله ۶ — انتظار برای تایید ادمین

نود شما در حالت **در انتظار تایید** قرار می‌گیرد. پس از تایید ادمین، نود شما فعال می‌شود و ترافیک کاربران از طریق آن هدایت می‌شود.

---

## نکات امنیتی

- **لاگ ترافیک غیرفعال است** — به عنوان اپراتور نود، شما نمی‌توانید ببینید کاربران به کجا متصل می‌شوند
- هر توکن فقط یک بار قابل استفاده است
- اگر سرور شما مشکل داشت، نود به صورت خودکار از شبکه خارج می‌شود

---

## لینک‌های مفید

- 🌐 پنل: http://108.61.99.207
- 📦 [دانلود ایجنت لینوکس](https://github.com/mrAboalfazl/ProxyNet/releases/download/v1.0.0/agent-linux)
- 📦 [دانلود ایجنت ویندوز](https://github.com/mrAboalfazl/ProxyNet/releases/download/v1.0.0/agent.exe)
- 🐛 [گزارش مشکل](https://github.com/mrAboalfazl/ProxyNet/issues)
