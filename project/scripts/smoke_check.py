import json
import sys

import requests

B = "http://127.0.0.1:8000"
s = requests.Session()
fails = []


def check(name, cond, extra=""):
    print(("PASS " if cond else "FAIL ") + name + ((" | " + str(extra)[:200]) if extra else ""))
    if not cond:
        fails.append(name)


# 0. public endpoints without auth
r = s.get(f"{B}/api/health")
check("health", r.status_code == 200)
r = s.get(f"{B}/api/config")
check("config public", r.status_code == 200 and "demo_hint" in r.json())
r = s.get(f"{B}/api/mock")
check("mock public", r.status_code == 200 and len(r.json()["requirements"]) == r.json()["meeting"]["requirements_count"])
r = s.get(f"{B}/api/meetings")
check("meetings requires auth", r.status_code == 401)

# 1. openapi has new endpoints
spec = s.get(f"{B}/openapi.json").json()
check("process endpoint exists", "/api/meetings/{meeting_id}/process" in spec["paths"])
check("open-question patch exists", "/api/open-questions/{q_id}" in spec["paths"])

# 2. login demo (now must be plain user)
r = s.post(f"{B}/api/auth/login", json={"email": "demo@akcion.tech", "password": "xtz-demo"})
check("demo login", r.status_code == 200, r.text[:120])
check("demo is not admin", r.status_code == 200 and r.json()["system_role"] == "user")
check("admin api forbidden for demo", s.get(f"{B}/api/admin/users").status_code == 403)

# 3. meetings + TZ date suffix Z
for junk in s.get(f"{B}/api/meetings").json():
    if junk["title"] == "Встреча" and junk["status"] != "done":  # хвосты прошлых smoke-прогонов
        s.delete(f"{B}/api/meetings/{junk['id']}")
r = s.get(f"{B}/api/meetings")
ms = r.json()
check("meetings list", r.status_code == 200 and len(ms) > 0)
done = [m for m in ms if m["status"] == "done"]
check("created_at has Z", all(m["created_at"].endswith("Z") for m in ms), ms[0]["created_at"] if ms else "")
mid = done[0]["id"]

r = s.get(f"{B}/api/projects")
check("projects visible to demo", r.status_code == 200 and len(r.json()) >= 1)
check("project dates Z", all(p["created_at"].endswith("Z") for p in r.json()))

d = s.get(f"{B}/api/meetings/{mid}").json()
check("detail created_at Z", d["meeting"]["created_at"].endswith("Z"))

# 4. manual requirement save + delete (keep demo data intact)
r = s.post(f"{B}/api/meetings/{mid}/requirements", json={"title": "SMOKE manual req", "description": "", "priority": "low", "type": "functional"})
check("manual req create", r.status_code == 200 and r.json()["manual"] is True, r.text[:200])
rid = r.json()["id"]
r2 = s.get(f"{B}/api/meetings/{mid}").json()
check("manual req persisted", any(x["id"] == rid for x in r2["requirements"]))
r = s.delete(f"{B}/api/requirements/{rid}")
check("manual req delete", r.status_code == 200)

# 5. question close/reopen roundtrip
qs = d["open_questions"]
if qs:
    q0 = qs[0]["id"]; was = qs[0]["resolved"]
    r = s.patch(f"{B}/api/open-questions/{q0}")
    toggled = r.json()["resolved"]
    r2 = s.patch(f"{B}/api/open-questions/{q0}")
    check("question toggle roundtrip", r.status_code == 200 and toggled != was and r2.json()["resolved"] == was)
else:
    print("SKIP question toggle (no questions on this meeting)")

# 6. contradiction resolve roundtrip
xs = d["contradictions"]
if xs:
    x0 = xs[0]["id"]
    r = s.patch(f"{B}/api/contradictions/{x0}/resolve")
    r2 = s.patch(f"{B}/api/contradictions/{x0}/resolve")
    check("contradiction toggle", r.status_code == 200 and r2.json()["resolved"] == xs[0]["resolved"])
    # ids of contradiction must match requirement public_ids
    pubs = {x["public_id"] for x in d["requirements"]} | {x["public_id"] for x in d["constraints"]}
    for x in xs:
        parts = [p.strip() for p in x["requirement_public_ids"].split(";")]
        check("contra ids match requirements", all(p in pubs for p in parts), x["requirement_public_ids"])
else:
    print("SKIP contradiction toggle (none on this meeting)")

# 7. upload validation: bad ext, empty file, process guard on done meeting
r = s.post(f"{B}/api/meetings", files={"file": ("x.txt", b"hello", "text/plain")})
check("reject .txt", r.status_code == 400)
r = s.post(f"{B}/api/meetings", files={"file": ("x.mp3", b"RIFFfakefakefakefakefake", "audio/mpeg")})
check("reject fake mp3 container", r.status_code in (400, 413), r.text[:120])
r = s.post(f"{B}/api/meetings/{mid}/process")
check("process refuses while done", r.status_code == 409)

# 8. login rate limit on failing pair
t = requests.Session()
codes = [t.post(f"{B}/api/auth/login", json={"email": "nobody@x.io", "password": "wrongpass1"}).status_code for _ in range(10)]
check("login rate limit kicks in", codes.count(401) <= 8 and 429 in codes, codes)
r = s.post(f"{B}/api/auth/login", json={"email": "demo@akcion.tech", "password": "xtz-demo"})
check("demo relogin still ok", r.status_code == 200)

# 9. MemberIn owner rejected
pj = s.get(f"{B}/api/projects").json()
pid = pj[0]["id"]
r = s.post(f"{B}/api/projects/{pid}/members", json={"email": "nobody@x.io", "role": "owner"})
check("member owner role rejected", r.status_code == 422, r.text[:120])

print("\n" + ("ALL OK" if not fails else f"FAILURES: {fails}"))
sys.exit(1 if fails else 0)
