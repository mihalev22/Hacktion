import sqlite3

import requests

B = "http://127.0.0.1:8000"
s = requests.Session()
r = s.post(f"{B}/api/auth/login", json={"email": "demo@akcion.tech", "password": "xtz-demo"})
assert r.status_code == 200, r.text
for m in s.get(f"{B}/api/meetings").json():
    if m["title"] == "qa_pipe":
        print("delete meeting:", s.delete(f"{B}/api/meetings/{m['id']}").status_code)

db = sqlite3.connect(r"C:\Users\user\Desktop\hackathon\project\backend\requirex.db")
qa = [u[0] for u in db.execute("select id, email from users").fetchall()
      if u[1].startswith("qa_") or u[1].endswith("@test.io")]
db.executemany("delete from users where id=?", [(u,) for u in qa])
db.commit()
print("qa users removed:", len(qa))
print("remaining users:", [e[0] for e in db.execute("select email from users").fetchall()])
print("remaining meetings:", [t[0] for t in db.execute("select title||' / '||status from meetings").fetchall()])
print("remaining projects:", [t[0] for t in db.execute("select name from projects").fetchall()])
