"""QA IDOR/security probe against running backend (localhost:8000)."""
import io
import sys
import time
import requests

BASE = "http://localhost:8000"
sys.stdout.reconfigure(encoding="utf-8")

fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + (f" [{extra}]" if extra else ""))
    if not cond:
        fails.append(name)


def sess(email, pw="Passw0rd!23"):
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/register", json={"name": email.split("@")[0], "email": email,
                                                  "password": pw, "password_confirm": pw})
    if r.status_code not in (200, 201):
        r = s.post(f"{BASE}/api/auth/login", json={"email": email, "password": pw})
    assert r.status_code in (200, 201), r.text
    return s


A = sess(f"qa_a_{int(time.time())}@test.io")
B = sess(f"qa_b_{int(time.time())}@test.io")

# 1. unauthenticated access must be rejected
r = requests.get(f"{BASE}/api/projects")
check("anon /api/projects -> 401", r.status_code == 401, str(r.status_code))
r = requests.get(f"{BASE}/api/meetings")
check("anon /api/meetings -> 401", r.status_code == 401, str(r.status_code))

# 2. A creates project + meeting (audio wav magic bytes, analyze=false)
r = A.post(f"{BASE}/api/projects", json={"name": "QA Project A", "description": "sec"})
check("A create project 201", r.status_code == 201, r.text[:200])
pid = r.json()["id"]

wav = b"RIFF\x00\x00\x00\x00WAVEfmt " + b"\x00" * 100
r = A.post(f"{BASE}/api/meetings", files={"file": ("t.wav", io.BytesIO(wav), "audio/wav")},
           data={"title": "QA Meet A", "project_id": pid, "analyze": "false"})
check("A create meeting 200", r.status_code == 200, r.text[:200])
mid = r.json()["id"]

# 3. IDOR: B must not read A's project/meeting
r = B.get(f"{BASE}/api/projects/{pid}")
check("B GET A project -> 403", r.status_code == 403, str(r.status_code))
r = B.get(f"{BASE}/api/meetings/{mid}")
check("B GET A meeting -> 403", r.status_code == 403, str(r.status_code))
r = B.get(f"{BASE}/api/meetings/{mid}/transcript")
check("B GET A transcript -> 403", r.status_code == 403, str(r.status_code))
r = B.get(f"{BASE}/api/meetings/{mid}/audio")
check("B GET A audio -> 403/404", r.status_code in (403, 404), str(r.status_code))
r = B.get(f"{BASE}/api/projects/{pid}/meetings")
check("B GET A project meetings -> 403", r.status_code == 403, str(r.status_code))
r = B.get(f"{BASE}/api/projects/{pid}/meetings/{mid}")
check("B GET A project meeting -> 403", r.status_code == 403, str(r.status_code))
r = B.patch(f"{BASE}/api/projects/{pid}", json={"name": "hacked"})
check("B PATCH A project -> 403", r.status_code == 403, str(r.status_code))
r = B.delete(f"{BASE}/api/projects/{pid}")
check("B DELETE A project -> 403", r.status_code == 403, str(r.status_code))
r = B.delete(f"{BASE}/api/meetings/{mid}")
check("B DELETE A meeting -> 403", r.status_code == 403, str(r.status_code))
r = B.post(f"{BASE}/api/meetings/{mid}/requirements", json={"title": "x"})
check("B POST req to A meeting -> 403", r.status_code == 403, str(r.status_code))
r = B.post(f"{BASE}/api/meetings/{mid}/process")
check("B process A meeting -> 403", r.status_code == 403, str(r.status_code))
r = B.get(f"{BASE}/api/meetings/{mid}/export")
check("B export A meeting -> 403", r.status_code == 403, str(r.status_code))

# 4. requirement-level IDOR: A adds req, B tries patch/delete
r = A.post(f"{BASE}/api/meetings/{mid}/requirements", json={"title": "Req A", "description": "d"})
check("A add requirement", r.status_code == 200, r.text[:200])
rid = r.json()["id"]
r = B.patch(f"{BASE}/api/requirements/{rid}", json={"title": "hijacked"})
check("B PATCH A requirement -> 403", r.status_code == 403, str(r.status_code))
r = B.delete(f"{BASE}/api/requirements/{rid}")
check("B DELETE A requirement -> 403", r.status_code == 403, str(r.status_code))
r = B.post(f"{BASE}/api/requirements/{rid}/question", json={"description": "long enough question"})
check("B ask on A requirement -> 403", r.status_code == 403, str(r.status_code))

# 5. viewer cannot edit
sess_email_B = B.get(f"{BASE}/api/auth/me").json()["email"]
r = A.post(f"{BASE}/api/projects/{pid}/members", json={"email": sess_email_B, "role": "viewer"})
check("A add B as viewer", r is not None and r.status_code == 201, r.text[:200] if r is not None else "")
r = B.get(f"{BASE}/api/meetings/{mid}")
check("B(viewer) GET meeting OK", r.status_code == 200, str(r.status_code))
r = B.patch(f"{BASE}/api/requirements/{rid}", json={"title": "changed"})
check("B(viewer) PATCH requirement -> 403", r.status_code == 403, str(r.status_code))
r = B.delete(f"{BASE}/api/meetings/{mid}")
check("B(viewer) DELETE meeting -> 403", r.status_code == 403, str(r.status_code))

# 6. admin endpoints for normal user
r = B.get(f"{BASE}/api/admin/users")
check("user GET admin/users -> 403", r.status_code == 403, str(r.status_code))

# 7. file upload guards
r = A.post(f"{BASE}/api/meetings", files={"file": ("evil.exe", io.BytesIO(b"MZ" + b"\x00" * 200), "application/octet-stream")},
           data={"title": "evil", "analyze": "false"})
check("upload .exe rejected", r.status_code == 400, r.text[:200])
r = A.post(f"{BASE}/api/meetings", files={"file": ("fake.wav", io.BytesIO(b"NOTAWAREFILE!!!!" * 8), "audio/wav")},
           data={"title": "fake", "analyze": "false"})
check("fake wav magic rejected", r.status_code == 400, r.text[:200])
r = A.post(f"{BASE}/api/meetings", files={"file": ("empty.mp3", io.BytesIO(b""), "audio/mpeg")},
           data={"title": "empty", "analyze": "false"})
check("empty file rejected", r.status_code == 400, r.text[:200])
big = b"RIFF\x00\x00\x00\x00WAVEfmt " + b"\x00" * (3 * 1024 * 1024)
r = A.post(f"{BASE}/api/meetings", files={"file": ("big.wav", io.BytesIO(big), "audio/wav")},
           data={"title": "big", "analyze": "false"})
check("3MB wav accepted (under limit)", r.status_code == 200, str(r.status_code) + r.text[:150])

# 8. login-blocked user cannot use API
# (skip blocking admin-only to avoid destroying demo data)

# 9. /api/config and /api/mock are public-safe (no secrets)
r = requests.get(f"{BASE}/api/config")
check("public config has no secrets", r.status_code == 200 and "api_key" not in r.text.lower() and "secret" not in r.text.lower())
r = requests.get(f"{BASE}/api/mock")
check("mock ok", r.status_code == 200)

# 10. refresh/logout flows
r = B.post(f"{BASE}/api/auth/logout")
check("logout 200", r.status_code == 200)
r = B.get(f"{BASE}/api/auth/me")
check("after logout /me -> 401", r.status_code == 401, str(r.status_code))

# cleanup: delete test project (meeting deletion removes files)
r = A.delete(f"{BASE}/api/projects/{pid}")
check("A delete own project ok", r.status_code == 200, r.text[:200])
r = A.get(f"{BASE}/api/meetings")
leftover = [m["id"] for m in r.json() if m["id"] == mid]
check("meeting gone after project delete (cascade)", not leftover)

print("\nRESULT:", "ALL PASS" if not fails else f"{len(fails)} FAILS: {fails}")
