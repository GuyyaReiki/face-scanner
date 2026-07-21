# 🔍 Face Scanner Attendance System

ระบบแสกนใบหน้าสำหรับบันทึกเวลาเข้างาน พร้อม role-based authentication สำหรับ Admin และ Employee

**ทำงานบน Google Colab พร้อม GPU ฟรี** — เหมาะสำหรับ 50-200 users

---

## ✨ Features

### 🎯 Face Recognition
- ใช้ **InsightFace (buffalo_s model)** บน GPU — แม่นยำสูง รวดเร็ว
- เก็บ face embeddings แยกต่างหากต่อ user (ไม่ average) เพื่อความทนทานต่อการเปลี่ยนมุมกล้อง/แสง
- Cosine similarity threshold 0.65 (ปรับได้)
- ป้องกัน duplicate check-in ซ้ำภายใน 8 ชั่วโมง

### 🔐 Authentication & Authorization
- **Admin**: สิทธิ์เต็ม — จัดการ users, ดูข้อมูลทุกคน
- **Employee**: ดูข้อมูลตัวเองเท่านั้น, สแกนหน้าเข้างานได้
- **Kiosk (Scan page)**: เปิดสาธารณะไม่ต้อง login — ใบหน้าคือ authentication
- JWT token (7-day expiry)
- Password: bcrypt hash

### 📊 Admin Panel
- เพิ่ม/ลบ users
- อัปโหลดหลายรูปต่อ user (3-10 รูป) สำหรับ enrollment
- ดูประวัติการเข้างานทั้งหมด พร้อมกรองตามวันที่/user
- Export CSV

### 👤 Employee Portal
- Login เข้าระบบ
- ดูประวัติการเข้างานของตัวเอง
- กรองตามวันที่

### 📱 Kiosk Mode (Scan Page)
- เปิดบนอุปกรณ์ต่างๆ (tablet, PC) ไม่ต้อง login
- แสดงผลสด: วิดีโอจากกล้อง + overlay แสดงชื่อผู้เข้างาน
- สแกนอัตโนมัติทุก 2 วินาที
- Border เปลี่ยนสี: เขียว (พบ), แดง (ไม่พบ), เทา (scanning)
- แสดง 5 การเช็คอินล่าสุด

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────┐
│  Google Colab (T4 GPU)                      │
│  ├─ FastAPI backend                         │
│  │  ├─ InsightFace buffalo_s model          │
│  │  ├─ SQLite (on Google Drive)             │
│  │  └─ JWT auth middleware                  │
│  ├─ React frontend (served as static)       │
│  └─ ngrok tunnel (HTTPS public URL)         │
└─────────────────────────────────────────────┘
          ↓
┌─────────────────────────────────────────────┐
│  Google Drive                               │
│  /MyDrive/face_scanner/                     │
│  ├─ attendance.db (SQLite + WAL)            │
│  └─ photos/ (face enrollment images)        │
└─────────────────────────────────────────────┘
```

### Backend (Python FastAPI)
- **Face recognition**: InsightFace ArcFace embeddings (512-dim)
- **Database**: SQLite with WAL mode
  - `users`: id, name, employee_id
  - `face_embeddings`: user_id → embedding BLOB (multiple per user)
  - `attendance`: user_id, timestamp, confidence
  - `accounts`: username, password_hash, role (admin/employee), linked user_id
- **Routes**:
  - `/api/auth/login` - JWT login
  - `/api/auth/setup` - first-time admin creation
  - `/api/users` - CRUD (admin only)
  - `/api/attendance/check` - face scan (public)
  - `/api/attendance` - list all (admin) / own (employee)

### Frontend (React 18 + Vite + TailwindCSS)
- `/scan` - Kiosk (public, ใช้ webcam API)
- `/login` - Login page
- `/setup` - First-time admin setup
- `/admin/users` - User management (admin only)
- `/admin/add-user` - Multi-photo enrollment wizard (admin only)
- `/attendance` - All records (admin only)
- `/my-attendance` - Own records (employee)

---

## 🚀 Deployment (Google Colab)

### Prerequisites
1. **Google account** with Drive
2. **ngrok account** (free) - get authtoken from https://ngrok.com
3. **GitHub private repository** (สำหรับเก็บ code)

### Step-by-Step

#### 1. Push code to GitHub
```bash
# On your local machine
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/face-scanner.git
git push -u origin main
```

#### 2. Open Colab notebook
- อัปโหลด `face_scanner.ipynb` ไปยัง Google Colab
- หรือ: เปิด Colab ใหม่ → File > Upload notebook → เลือกไฟล์

#### 3. Enable GPU
- Runtime > Change runtime type > Hardware accelerator: **T4 GPU**

#### 4. รัน cells ตามลำดับ

**Cell 1**: Install dependencies (รอ 2-3 นาที)
```python
# ติดตั้ง FastAPI, InsightFace, ngrok, etc.
```

**Cell 2**: Mount Google Drive + ตั้งค่า environment
- ⚠️ **เปลี่ยน `JWT_SECRET`** ก่อนใช้งานจริง:
  ```python
  import secrets
  print(secrets.token_hex(32))  # สร้าง random secret
  ```
- อัปเดต `JWT_SECRET` ใน Cell 2

**Cell 3**: Clone GitHub repo + build React
- แก้ `REPO_URL` เป็น URL repo ของคุณ
- รอ `npm run build` เสร็จ (~1-2 นาที)

**Cell 4**: Start FastAPI server
- รอจนเห็น "✅ Server ทำงานแล้ว"

**Cell 5**: เปิด ngrok tunnel
- ใส่ `NGROK_TOKEN` (จาก https://dashboard.ngrok.com/get-started/your-authtoken)
- คัดลอก URL ที่แสดง (เช่น `https://abc123.ngrok.io`)

**Cell 6** (optional): Keep-alive
- รัน cell นี้ค้างไว้เพื่อป้องกัน Colab idle timeout

---

## 🔐 Initial Setup

### 1. สร้าง Admin account (ทำครั้งแรกเท่านั้น)
1. เปิด `https://YOUR_NGROK_URL/setup`
2. กรอก username + password (อย่างน้อย 8 ตัวอักษร)
3. คลิก "สร้าง Admin Account"
4. ระบบจะ login อัตโนมัติและพาไปหน้า Admin Panel

### 2. เพิ่ม Employee
1. Login ด้วย admin account
2. ไปที่ Admin > Users > "เพิ่มผู้ใช้ใหม่"
3. กรอก:
   - ชื่อ-นามสกุล
   - รหัสพนักงาน (optional)
   - ถ่ายรูปใบหน้า 5 รูป (มุมต่างกัน, แสงต่างกัน)
   - ☑️ เลือก "สร้าง login account" → กรอก username + password สำหรับ employee
4. Submit

### 3. ตั้งค่า Kiosk
- เปิด `https://YOUR_NGROK_URL/scan` บน tablet/PC ที่จุดเช็คอิน
- ไม่ต้อง login — หน้านี้เป็น public
- พนักงานยืนหน้ากล้อง → ระบบจะแสกนและบันทึกเวลาเข้างานอัตโนมัติ

---

## 📖 Usage Guide

### 🎨 Admin Workflow
1. **Login** → admin panel
2. **เพิ่ม user ใหม่**:
   - Admin > Users > เพิ่มผู้ใช้ใหม่
   - Capture 5 photos (หลากหลายมุม/แสง → ความแม่นยำสูงขึ้น)
   - ใส่ username/password ถ้าต้องการให้ employee login ได้
3. **ดูประวัติเข้างาน**:
   - All Attendance → กรองตามวันที่/user
   - Export CSV
4. **ลบ user**: Admin > Users → คลิกไอคอนถังขยะ

### 👥 Employee Workflow
1. **Login** → `/my-attendance`
2. **ดูประวัติของตัวเอง** (กรองตามวันที่ได้)
3. **สแกนหน้าเข้างาน**: ไปที่ kiosk (`/scan`) ไม่ต้อง login

### 🖥️ Kiosk (Scan Page)
- เปิดบน device ถาวร (tablet mounted ที่ประตู)
- พนักงาน walk up → ยืนหน้ากล้อง → auto-scan
- เห็นชื่อของตัวเอง + timestamp → เดินเข้าได้

---

## ⚠️ Colab Limitations & Workarounds

### Session Expiry
- **Colab Free**: session หมดอายุ ~12 ชั่วโมง
- **Colab Pro+**: ~24 ชั่วโมง
- **Workaround**: รัน Cell 6 (keep-alive) ค้างไว้, ใช้ Colab Pro+ สำหรับ uptime ที่ดีขึ้น
- **Long-term solution**: Deploy บน AWS EC2 / GCP Cloud Run / DigitalOcean

### ngrok URL เปลี่ยนทุกครั้ง
- ทุกครั้งที่รัน session ใหม่ → URL ngrok ใหม่
- **ไม่กระทบ**: React ใช้ relative URL (`/api/...`) จึงไม่ต้อง rebuild
- **ต้องทำ**: อัปเดต URL ใน bookmark/QR code สำหรับ kiosk

### Data Persistence
- ✅ SQLite + photos เก็บบน Google Drive → ไม่หายเมื่อ session รีสตาร์ท
- ✅ Embeddings + attendance records ถาวร

### Performance
- T4 GPU: face recognition ~50-100ms per frame
- Scalable ถึง 200 users (linear scan cosine similarity <1ms บน GPU)
- ถ้ามากกว่า 200 users → พิจารณา vector database (Faiss, Milvus)

---

## 🔧 Troubleshooting

### "ไม่พบ GPU"
- Runtime > Change runtime type > T4 GPU
- Restart runtime

### "Server ยังไม่พร้อม"
- ตรวจสอบ Cell 4 มี error หรือไม่
- ลอง restart runtime แล้วรันใหม่ทั้งหมด

### "Token หมดอายุหรือไม่ถูกต้อง"
- JWT หมดอายุใน 7 วัน → login ใหม่
- ถ้า logout แล้วยัง error → ลบ localStorage:
  ```javascript
  // ใน browser console (F12)
  localStorage.clear()
  ```

### Face recognition ไม่แม่นยำ
1. **เพิ่มรูป enrollment** → ลบ user เดิม → สร้างใหม่พร้อมรูป 5-10 รูปที่หลากหลาย
2. **ปรับ threshold**: แก้ `backend/face_service.py`:
   ```python
   # threshold=0.65 เริ่มต้น
   # ลดเป็น 0.60 ถ้า false-negative มาก (คนจริงไม่ผ่าน)
   # เพิ่มเป็น 0.70 ถ้า false-positive มาก (คนอื่นผ่าน)
   ```
3. **แสงสว่าง**: kiosk ควรมีแสงเพียงพอ, ไม่ backlight
4. **ระยะ**: ยืนห่างจากกล้อง 50-100cm

### "มี admin account อยู่แล้ว" แต่ลืมรหัสผ่าน
รัน cell นี้ใน Colab เพื่อ reset admin:
```python
import sqlite3, os
from backend.auth_service import hash_password

db_path = os.environ.get('DB_PATH', '/content/drive/MyDrive/face_scanner/attendance.db')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# เปลี่ยนรหัสผ่าน admin
new_password = "newpassword123"  # เปลี่ยนเป็นรหัสผ่านใหม่
cursor.execute(
    "UPDATE accounts SET password_hash = ? WHERE role = 'admin'",
    (hash_password(new_password),)
)
conn.commit()
print("✅ Reset admin password สำเร็จ")
```

---

## 🛡️ Security Recommendations

### ⚠️ สำคัญมาก
1. **เปลี่ยน `JWT_SECRET`** ใน Cell 2 เป็น random 64-char hex string
   ```python
   import secrets
   secrets.token_hex(32)  # คัดลอกผลลัพธ์ไปใส่
   ```

2. **Password policy**: ระบบบังคับอย่างน้อย 8 ตัวอักษร แต่แนะนำให้ใช้รหัสผ่านยาวกว่า 12 ตัว

3. **ngrok HTTPS**: ngrok จะให้ HTTPS ฟรี → ไม่ต้องกังวลเรื่อง TLS

4. **Biometric data**: Face embeddings เก็บบน Google Drive ของคุณเท่านั้น — ไม่ไปที่ third-party cloud

5. **Access control**: ใช้ ngrok free authtoken → URL เป็น random subdomain ยากเดา แต่ไม่ควรแชร์ URL สาธารณะ

### Production Deployment
สำหรับใช้งานจริง ควร deploy บน:
- **AWS EC2** / **GCP Compute Engine**: full control, persistent
- **Railway** / **Render** / **Fly.io**: managed PaaS, $10-20/month
- **On-premise server**: Raspberry Pi 4 + USB webcam + Coral Edge TPU

---

## 🧪 Tech Stack

### Backend
- **FastAPI** 0.111.0 - Modern Python web framework
- **InsightFace** 0.7.3 - Face recognition (ArcFace)
- **onnxruntime-gpu** 1.17.0 - GPU inference
- **SQLite** + WAL mode - Lightweight database
- **python-jose** - JWT
- **passlib[bcrypt]** - Password hashing
- **pyngrok** - ngrok tunnel client

### Frontend
- **React** 18 - UI library
- **Vite** 5 - Build tool
- **React Router** 6 - SPA routing
- **Axios** - HTTP client
- **TailwindCSS** (CDN) - Styling

### Infrastructure
- **Google Colab** - Free T4 GPU runtime
- **Google Drive** - Persistent storage
- **ngrok** - HTTPS tunnel

---

## 📁 Project Structure

```
face-scanner/
├── backend/
│   ├── main.py                  # FastAPI app entry
│   ├── database.py              # SQLite init + connection
│   ├── face_service.py          # InsightFace wrapper
│   ├── auth_service.py          # JWT + password hashing
│   ├── dependencies.py          # Auth dependencies
│   ├── models.py                # Pydantic models
│   ├── requirements.txt         # Python packages
│   └── routers/
│       ├── auth.py              # /api/auth/* endpoints
│       ├── users.py             # /api/users/* endpoints
│       └── attendance.py        # /api/attendance/* endpoints
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx             # React entry
│       ├── App.jsx              # Router + layout
│       ├── api.js               # Axios client
│       ├── components/
│       │   ├── WebcamCapture.jsx
│       │   └── ProtectedRoute.jsx
│       └── pages/
│           ├── LoginPage.jsx
│           ├── SetupPage.jsx
│           ├── ScanPage.jsx          # Kiosk
│           ├── AdminUsersPage.jsx
│           ├── AddUserPage.jsx
│           ├── AttendancePage.jsx    # Admin: all
│           └── MyAttendancePage.jsx  # Employee: own
├── face_scanner.ipynb           # Colab deployment notebook
└── README.md
```

---

## 🎯 Roadmap

### Planned Features
- [ ] Multi-kiosk support (multiple scan stations)
- [ ] Real-time dashboard (WebSocket)
- [ ] Report generation (daily/weekly/monthly)
- [ ] Email notifications (late arrival)
- [ ] Mobile app (React Native)
- [ ] Face mask detection
- [ ] Temperature screening integration

### Performance Improvements
- [ ] Vector database (Faiss) for 500+ users
- [ ] Redis caching for embeddings
- [ ] Batch inference optimization

---

## 📄 License

MIT License - ใช้งานได้ฟรี สำหรับ personal และ commercial projects

---

## 🙏 Credits

- **InsightFace** - https://github.com/deepinsight/insightface
- **FastAPI** - https://fastapi.tiangolo.com
- **React** - https://react.dev

---

## 📞 Support

หากพบปัญหาหรือมีคำถาม:
1. เช็ค Troubleshooting section ด้านบน
2. ตรวจสอบ logs ใน Cell 4 (FastAPI startup)
3. Browser console (F12) สำหรับ frontend errors

**Happy scanning!** 🎉
