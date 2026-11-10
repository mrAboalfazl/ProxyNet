# راهنمای فنی درگاه اتصال پروکسی (ProxyNet HTTP Gateway API)

درگاه خروج HTTP پروکسی‌نت (`HTTP Fetch Gateway`)، به کلاینت‌ها، ربات‌ها، کنترل‌پنل‌ها و وب‌سرویس‌ها اجازه می‌دهد تا کلیه درخواست‌های اینترنتی خود را از بستر نودهای اختصاصی خروج پروکسی‌نت ارسال کنند.

این سرویس کلیه موانع رایج (مانند حذف توکن‌ها، خرابی فایل‌های باینری، تغییر مسیرهای ۳۰۱/۳۰۲ و خطاهای SSL خودامضا) را برطرف کرده و ترافیک خروجی را با هویت و آی‌پی نود موردنظر ارسال می‌نماید.

---

## ۱. نحوه احراز هویت (Authentication)

احراز هویت درگاه با استفاده از مکانیزم استاندارد **HTTP Basic Auth** و کلیدهای اختصاصی کاربر (`UUID` و `Secret`) انجام می‌شود.

```http
POST /api/gateway/fetch HTTP/1.1
Host: your-proxynet-domain.com
Authorization: Basic <base64(UUID:SECRET)>
Content-Type: application/json
```

> **فرمول ساخت هدر:**  
> مقدار رشته‌ای `UUID:SECRET` را به صورت Base64 انکود کرده و عبارت `Basic ` را به ابتدای آن اضافه کنید.  
> *مثال:* اگر UUID برابر `abc-123` و Secret برابر `secret-xyz` باشد، رشته `abc-123:secret-xyz` انکود شده و برابر `YWJjLTEyMzpzZWNyZXQteHl6` خواهد بود:  
> `Authorization: Basic YWJjLTEyMzpzZWNyZXQteHl6`

---

## ۲. مشخصات اندپوینت و پارامترهای ورودی (Request Schema)

* **آدرس اندپوینت:** `POST /api/gateway/fetch`
* **نوع محتوا (Content-Type):** `application/json`

### جدول پارامترهای بدنه درخواست (JSON Body)

| پارامتر | نوع داده | الزامی | پیش‌فرض | توضیحات |
|---|---|---|---|---|
| `url` | `string` | **بله** | - | آدرس کامل مقصد اینترنتی (HTTP یا HTTPS). |
| `method` | `string` | خیر | `GET` | متد ارسال درخواست (`GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`). |
| `headers` | `object` | خیر | `{}` | آبجکت هدرهای سفارشی ارسالی به مقصد. هدر `Authorization` اختصاصی مقصد بدون تغییر تحویل داده می‌شود. |
| `body` | `string` | خیر | `undefined` | بدنه ارسالی برای متدهای POST/PUT (متن خام، JSON یا Base64). |
| `isBase64` | `boolean` | خیر | `false` | چنانچه بدنه ارسالی (`body`) یک فایل یا داده باینری انکودشده با Base64 است، مقدار `true` قرار دهید. |
| `responseEncoding` | `string` | خیر | `auto` | فرمت بازگرداندن پاسخ: `auto` (تشخیص خودکار محتوای باینری)، `utf8` یا `base64`. |
| `followRedirects` | `boolean` | خیر | `true` | تعقیب خودکار ریدایرکت‌های ۳۰۱، ۳۰۲، ۳۰۳، ۳۰۷ و ۳۰۸ تا رسیدن به پاسخ نهایی مقصد. |
| `maxRedirects` | `number` | خیر | `5` | حداکثر دفعات مجاز تعقیب ریدایرکت (بین ۱ تا ۱۰ مرحله). |
| `insecure` | `boolean` | خیر | `false` | در صورتی که مقصد از گواهی SSL خودامضا (Self-Signed) استفاده می‌کند، مقدار `true` خطای SSL را نادیده می‌گیرد. |
| `timeoutMs` | `number` | خیر | `30000` | مهلت پاسخگویی بر حسب میلی‌ثانیه (بازه ۱,۰۰۰ تا ۶۰,۰۰۰ میلی‌ثانیه؛ مناسب برای Long-polling ربات‌های تلگرام). |

---

## ۳. ساختار پاسخ (Response Schema)

کلیه پاسخ‌ها در قالب استاندارد JSON بازگردانده می‌شوند:

```json
{
  "status": 200,
  "headers": {
    "content-type": "application/json",
    "server": "nginx"
  },
  "body": "{\"ip\":\"185.x.x.x\"}",
  "isBase64": false,
  "bytesIn": 412,
  "bytesOut": 94,
  "viaNodeId": 2,
  "viaCountry": "DE",
  "redirectsFollowed": 0,
  "costToman": "5"
}
```

### فیلدهای پاسخ:
* `status`: کد وضعیت HTTP بازگشتی از سرور مقصد (مانند 200، 404، 500).
* `headers`: هدرهای پاسخ سرور مقصد.
* `body`: متن پاسخ مقصد (یا محتوای Base64 در صورت باینری بودن).
* `isBase64`: نشان‌دهنده اینکه آیا محتوای `body` باینری بوده و با Base64 انکود شده است یا خیر.
* `bytesIn` / `bytesOut`: حجم ترافیک مصرفی به بایت.
* `viaCountry`: کد کشور نود خروجی که درخواست از طریق آن ارسال شد (مثلاً `DE`, `NL`, `FR`).
* `redirectsFollowed`: تعداد مراحل ریدایرکت طی‌شده تا پاسخ نهایی.
* `costToman`: هزینه کسر شده از کیف پول بابت این فراخوانی بر حسب تومان.

---

## ۴. نمونه کدهای اجرایی در زبان‌های مختلف

### ۴.۱. cURL

#### فراخوانی استاندارد GET:
```bash
curl -X POST "https://api.yourdomain.com/api/gateway/fetch" \
  -H "Authorization: Basic YWJjLTEyMzpzZWNyZXQteHl6" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://api.ipify.org?format=json"}'
```

#### فراخوانی پیشرفته با هدر اختصاصی و SSL خودامضا:
```bash
curl -X POST "https://api.yourdomain.com/api/gateway/fetch" \
  -H "Authorization: Basic YWJjLTEyMzpzZWNyZXQteHl6" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://192.168.1.100:8443/api/v1/status",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer my-secret-api-token",
      "Content-Type": "application/json"
    },
    "body": "{\"action\":\"sync\"}",
    "insecure": true,
    "followRedirects": true,
    "timeoutMs": 45000
  }'
```

---

### ۴.۲. PHP (cURL)

```php
<?php
$proxynetEndpoint = 'https://api.yourdomain.com/api/gateway/fetch';
$uuid   = 'YOUR_CREDENTIAL_UUID';
$secret = 'YOUR_SECRET';
$basicAuth = base64_encode("$uuid:$secret");

$payload = [
    'url' => 'https://api.telegram.org/bot<TOKEN>/getMe',
    'method' => 'GET',
    'headers' => [
        'User-Agent' => 'MyTelegramBot/1.0',
    ],
    'followRedirects' => true,
    'insecure' => false,
    'timeoutMs' => 30000,
];

$ch = curl_init($proxynetEndpoint);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_HTTPHEADER => [
        "Authorization: Basic $basicAuth",
        "Content-Type: application/json",
    ],
    CURLOPT_POSTFIELDS => json_encode($payload),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 40,
]);

$response = curl_exec($ch);
$httpStatus = curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

$result = json_decode($response, true);
echo "Destination Status: " . $result['status'] . "\n";
echo "Response Body: " . $result['body'] . "\n";
```

---

### ۴.۳. Python (`requests`)

```python
import base64
import requests

PROXYNET_URL = "https://api.yourdomain.com/api/gateway/fetch"
UUID = "YOUR_CREDENTIAL_UUID"
SECRET = "YOUR_SECRET"
basic_auth = base64.b64encode(f"{UUID}:{SECRET}".encode()).decode()

payload = {
    "url": "https://api.example.com/api/v1/data",
    "method": "POST",
    "headers": {
        "Authorization": "Bearer UPSTREAM_SECRET_TOKEN",
        "Content-Type": "application/json"
    },
    "body": '{"query": "metrics"}',
    "followRedirects": True,
    "insecure": False,
    "timeoutMs": 30000
}

response = requests.post(
    PROXYNET_URL,
    headers={"Authorization": f"Basic {basic_auth}"},
    json=payload,
    timeout=35
)

data = response.json()
print("Exit Country:", data.get("viaCountry"))
print("Target HTTP Status:", data.get("status"))
print("Target Response:", data.get("body"))
```

---

### ۴.۴. Node.js

```javascript
import fetch from 'node-fetch';

const PROXYNET_URL = 'https://api.yourdomain.com/api/gateway/fetch';
const credentials = Buffer.from('YOUR_UUID:YOUR_SECRET').toString('base64');

const response = await fetch(PROXYNET_URL, {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${credentials}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    url: 'https://api.ipify.org?format=json',
    method: 'GET',
    followRedirects: true,
    insecure: false,
    timeoutMs: 30000,
  }),
});

const result = await response.json();
console.log('Target status:', result.status);
console.log('Exit IP:', result.body);
```

---

## ۵. راهنمای داده‌ها و فایل‌های باینری (Binary / Base64)

در هنگام دانلود یا ارسال فایل‌ها (مانند فایل‌های کانفیگ، تصاویر، فایل‌های فشرده ZIP یا پکیج‌ها):

1. **دانلود فایل از مقصد:**  
   اگر مقصد فایل باینری برگرداند (یا پارامتر `responseEncoding: "base64"` ست شده باشد)، گیت‌وی مقدار `isBase64: true` قرار داده و بدنه را در قالب Base64 تحویل می‌دهد. برای بازگرداندن به بایت‌های اصلی:
   * **در PHP:** `$binaryData = base64_decode($result['body']);`
   * **در Python:** `binary_data = base64.b64decode(data['body'])`
   * **در Node.js:** `const binaryBuffer = Buffer.from(result.body, 'base64');`

2. **آپلود فایل به مقصد:**  
   فایل باینری خود را به Base64 تبدیل کرده و در فیلد `body` قرار دهید و پارامتر `"isBase64": true` را اضافه کنید. گیت‌وی به طور خودکار داده‌ها را به بایت‌های خالص تبدیل کرده و به سرور مقصد تحویل می‌دهد.

---

## ۶. کدهای وضعیت و خطاهای درگاه

| کد وضعیت | عنوان خطا | دلیل | راه‌حل |
|---|---|---|---|
| `200` | OK | درخواست با موفقیت توسط نود خروج ارسال و پاسخ دریافت شد. | - |
| `400` | Bad Request | آدرس URL نامعتبر است یا آدرس مقصد جزو شبکه‌های محلی مسدودشده (SSRF) می‌باشد. | فرمت آدرس مقصد را بررسی کنید. |
| `401` | Unauthorized | هدر `Authorization: Basic` ارسال نشده یا UUID و Secret نامعتبر/غیرفعال هستند. | اعتبارنامه خود را از منوی «اعتبارنامه‌ها» بررسی کنید. |
| `402` | Payment Required | موجودی کیف پول کاربر برای ارسال درخواست کافی نیست. | کیف پول را از منوی «کیف پول» شارژ نمایید. |
| `502` | Bad Gateway | نود خروج نتوانست به آدرس سرور مقصد متصل شود (تایم‌اوت مقصد یا قطعی سرور مقصد). | در دسترس بودن سرور مقصد را بررسی کنید. |
| `503` | Service Unavailable | در حال حاضر هیچ نود خروج سالمی در کشور انتخاب‌شده فعال نیست. | از منوی پروفایل کشور خروج را تغییر دهید یا روی «خودکار» بگذارید. |
