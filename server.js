const express = require("express"), bcrypt = require("bcryptjs"), jwt = require("jsonwebtoken");
const { DatabaseSync } = require("node:sqlite"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const { sendSms, sendEmail } = require("./notify");

const DEV = process.env.NODE_ENV !== "production";
const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
if (!DEV && SECRET === "dev-secret-change-me") throw new Error("Set JWT_SECRET in production.");
const UP = path.join(__dirname, "uploads");
fs.mkdirSync(UP, { recursive: true });

// Node's built-in SQLite (Node 22.13 or newer): nothing to compile or install.
const raw = new DatabaseSync(process.env.DB_FILE || path.join(__dirname, "thulamela.db"));
raw.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
const db = {
  exec: sql => raw.exec(sql),
  prepare(sql) {
    const st = raw.prepare(sql); let one = false;
    const h = { get: (...a) => { const r = st.get(...a); return one && r ? Object.values(r)[0] : r; },
      all: (...a) => st.all(...a), run: (...a) => st.run(...a), pluck: () => (one = true, h) };
    return h;
  }
};
db.exec(fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8"));

const DEFAULT_ADMIN_PW = {
  EducationAdmin: "Educ@2026", AgricultureAdmin: "Agri@2026", HomeAffairsAdmin: "HomeAff@2026",
  HealthAdmin: "Health@2026", WaterSanitationAdmin: "WaterSan@2026", PublicWorksAdmin: "PubWorks@2026",
  TransportAdmin: "Transport@2026", HumanSettlementsAdmin: "HumanSet@2026", MainAdmin: "MainAdmin@2026"
};
{
  const setPw = db.prepare("UPDATE Administrator SET Password=? WHERE UniqueID=? AND Password IS NULL");
  for (const [uid, pw] of Object.entries(DEFAULT_ADMIN_PW)) setPw.run(bcrypt.hashSync(pw, 10), uid);
}

const app = express();
app.use(express.json({ limit: "6mb" }));
app.use((q, s, n) => { s.set("X-Content-Type-Options", "nosniff"); n(); });

/* ---------- helpers ---------- */
const bad = (res, code, msg) => res.status(code).json({ error: msg });
const wrap = fn => (q, s) => Promise.resolve(fn(q, s)).catch(e => { console.error(e); bad(s, 500, "Server error. Try again."); });
const sign = (p, exp = "8h") => jwt.sign(p, SECRET, { expiresIn: exp });
const auth = role => (q, s, next) => {
  try {
    q.u = jwt.verify((q.headers.authorization || "").replace("Bearer ", ""), SECRET);
    if (q.u.role !== role) throw 0;
    next();
  } catch { bad(s, 401, "Please log in again."); }
};
const hits = new Map();                                    // simple brute-force limiter
const limit = (q, s, next) => {
  const k = q.ip, now = Date.now(), h = (hits.get(k) || []).filter(t => now - t < 15 * 60e3);
  if (h.length >= 20) return bad(s, 429, "Too many attempts. Wait 15 minutes and try again.");
  hits.set(k, [...h, now]); next();
};
const str = (v, max = 500) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const deptRow = code => db.prepare("SELECT * FROM Department WHERE Code=?").get(code);

// Sends and records a notification; returns a display string (shown as a pop-up in development).
async function notify(resident, type, text, reportId = null) {
  const status = await (type === "SMS" ? sendSms(resident.PhoneNumber, text)
    : sendEmail(resident.Email, "Thulamela Municipality", text)).catch(e => { console.error(e.message); return "FAILED"; });
  db.prepare("INSERT INTO Notification (ResidentID,ReportID,NotificationType,Message,Status) VALUES (?,?,?,?,?)")
    .run(resident.ResidentID, reportId, type, text, status);
  return type === "SMS" ? `SMS to ${resident.PhoneNumber}: ${text}` : `Email to ${resident.Email}: ${text}`;
}
const out = (res, body, notices = []) => res.json(DEV ? { ...body, notices } : body);

// Evidence photos are stored as files; the database keeps only the file name.
function saveImg(dataUrl) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || "");
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 4e6) return null;
  const name = crypto.randomUUID() + "." + (m[1] === "jpeg" ? "jpg" : m[1]);
  fs.writeFileSync(path.join(UP, name), buf);
  return name;
}
const readImg = f => {
  if (!f) return null;
  try {
    const p = path.join(UP, path.basename(f)), ext = path.extname(p).slice(1);
    return `data:image/${ext === "jpg" ? "jpeg" : ext};base64,` + fs.readFileSync(p).toString("base64");
  } catch { return null; }
};
const delImg = f => { if (f) fs.rm(path.join(UP, path.basename(f)), () => {}); };

const REPORT_SQL = `SELECT r.*, d.Code, s.FirstName, s.LastName, s.PhoneNumber FROM Report r
  JOIN Department d ON d.DepartmentID=r.DepartmentID JOIN Resident s ON s.ResidentID=r.ResidentID`;
const R = (r, img = true) => ({
  id: r.ReportID, rid: r.ResidentID, dept: r.Code, cat: r.Category, desc: r.Description,
  vil: r.VillageName, loc: r.SpecificLocation, dt: r.AccidentDate, st: r.Status,
  sub: r.SubmissionDate.replace(" ", "T") + "Z", img: img ? readImg(r.ImagePath) : null,
  who: { fn: r.FirstName, ln: r.LastName, ph: r.PhoneNumber }
});
const DRAFT_SQL = `SELECT k.*, d.Code FROM Draft k JOIN Department d ON d.DepartmentID=k.DepartmentID`;
const K = k => ({ id: k.DraftID, dept: k.Code, cat: k.Category, desc: k.Description, vil: k.VillageName,
  loc: k.SpecificLocation, dt: k.AccidentDate, img: readImg(k.ImagePath), upd: k.LastUpdated.replace(" ", "T") + "Z" });

/* ---------- public ---------- */
app.get("/api/departments", (q, s) => s.json(db.prepare("SELECT Code code, DepartmentName name FROM Department").all()));

/* ---------- authentication ---------- */
app.post("/api/auth/register", limit, wrap(async (q, s) => {
  const b = { fn: str(q.body.fn, 60), ln: str(q.body.ln, 60), ph: str(q.body.ph, 10), em: str(q.body.em, 120).toLowerCase() }, pw = q.body.pw;
  if (!b.fn || !b.ln || !b.ph || !b.em || !pw) return bad(s, 400, "Fill in every field.");
  if (!/^0\d{9}$/.test(b.ph)) return bad(s, 400, "Enter a 10-digit phone number starting with 0.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(b.em)) return bad(s, 400, "Enter a valid email address.");
  if (typeof pw !== "string" || pw.length < 6) return bad(s, 400, "Use a password with at least 6 characters.");
  if (db.prepare("SELECT 1 FROM Resident WHERE PhoneNumber=? OR Email=?").get(b.ph, b.em))
    return bad(s, 409, "An account with this phone number or email already exists.");
  db.prepare("INSERT INTO Resident (FirstName,LastName,PhoneNumber,Email,Password) VALUES (?,?,?,?,?)")
    .run(b.fn, b.ln, b.ph, b.em, bcrypt.hashSync(pw, 10));
  s.status(201).json({ ok: true });
}));

app.post("/api/auth/login", limit, wrap(async (q, s) => {
  const r = db.prepare("SELECT * FROM Resident WHERE PhoneNumber=?").get(str(q.body.ph, 10));
  if (!r || !bcrypt.compareSync(String(q.body.pw || ""), r.Password)) return bad(s, 401, "Phone number or password is incorrect.");
  s.json({ token: sign({ role: "resident", id: r.ResidentID }),
    user: { id: r.ResidentID, fn: r.FirstName, ln: r.LastName, ph: r.PhoneNumber, em: r.Email } });
}));

app.post("/api/auth/forgot", limit, wrap(async (q, s) => {          // step 1: send OTP
  const r = db.prepare("SELECT * FROM Resident WHERE PhoneNumber=?").get(str(q.body.ph, 10));
  const notices = [];
  if (r) {                                                            // same reply either way, so numbers cannot be probed
    const code = String(crypto.randomInt(100000, 1000000));
    db.prepare("UPDATE OtpRequest SET Used=1 WHERE ResidentID=?").run(r.ResidentID);
    db.prepare("INSERT INTO OtpRequest (ResidentID,CodeHash,ExpiresAt) VALUES (?,?,?)")
      .run(r.ResidentID, bcrypt.hashSync(code, 8), Date.now() + 10 * 60e3);
    notices.push(await notify(r, "SMS", `Your OTP is ${code}. It expires in 10 minutes.`));
  }
  out(s, { ok: true }, notices);
}));

app.post("/api/auth/verify-otp", limit, wrap(async (q, s) => {      // step 2: check OTP
  const r = db.prepare("SELECT * FROM Resident WHERE PhoneNumber=?").get(str(q.body.ph, 10));
  const o = r && db.prepare("SELECT * FROM OtpRequest WHERE ResidentID=? AND Used=0 ORDER BY OtpID DESC").get(r.ResidentID);
  if (!o || o.ExpiresAt < Date.now() || o.Attempts >= 5) return bad(s, 400, "This OTP has expired. Request a new one.");
  db.prepare("UPDATE OtpRequest SET Attempts=Attempts+1 WHERE OtpID=?").run(o.OtpID);
  if (!bcrypt.compareSync(str(q.body.otp, 6), o.CodeHash)) return bad(s, 400, "That OTP is incorrect. Check the SMS and try again.");
  db.prepare("UPDATE OtpRequest SET Verified=1 WHERE OtpID=?").run(o.OtpID);
  s.json({ resetToken: sign({ role: "reset", otp: o.OtpID, id: r.ResidentID }, "10m") });
}));

app.post("/api/auth/reset", limit, wrap(async (q, s) => {           // step 3: new password
  let t; try { t = jwt.verify(String(q.body.resetToken), SECRET); if (t.role !== "reset") throw 0; } catch { return bad(s, 401, "Reset session expired. Start again."); }
  const pw = q.body.pw;
  if (typeof pw !== "string" || pw.length < 6) return bad(s, 400, "Use a password with at least 6 characters.");
  const o = db.prepare("SELECT 1 FROM OtpRequest WHERE OtpID=? AND Verified=1 AND Used=0").get(t.otp);
  if (!o) return bad(s, 400, "Reset session expired. Start again.");
  db.prepare("UPDATE Resident SET Password=? WHERE ResidentID=?").run(bcrypt.hashSync(pw, 10), t.id);
  db.prepare("UPDATE OtpRequest SET Used=1 WHERE OtpID=?").run(t.otp);
  s.json({ ok: true });
}));

app.post("/api/auth/admin", limit, wrap(async (q, s) => {
  const a = db.prepare("SELECT a.*, d.Code FROM Administrator a LEFT JOIN Department d ON d.DepartmentID=a.DepartmentID WHERE UniqueID=?")
    .get(str(q.body.uid, 40));
  if (!a || !a.Password || !bcrypt.compareSync(String(q.body.pw || ""), a.Password)) return bad(s, 401, "ID or password is incorrect.");
  const main = a.AdminType === "MAIN";
  s.json({ token: sign({ role: main ? "main" : "dept", id: a.AdminID, dept: a.DepartmentID }), admin: { main, dept: a.Code } });
}));

/* ---------- resident: reports and drafts ---------- */
const res_ = auth("resident");
app.post("/api/reports", res_, wrap(async (q, s) => {
  const b = q.body, d = deptRow(str(b.dept, 10));
  const v = { cat: str(b.cat, 100), desc: str(b.desc, 2000), vil: str(b.vil, 100), loc: str(b.loc, 200), dt: str(b.dt, 10) };
  if (!d) return bad(s, 400, "Choose a department.");
  if (Object.values(v).some(x => !x) || !b.img) return bad(s, 400, "Fill in every compulsory field and add a photo.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.dt) || v.dt > new Date().toISOString().slice(0, 10)) return bad(s, 400, "Enter a valid date that is not in the future.");
  const img = saveImg(b.img);
  if (!img) return bad(s, 400, "The photo must be a JPEG, PNG or WebP under 4 MB.");
  const id = db.prepare(`INSERT INTO Report (ResidentID,DepartmentID,Category,Description,ImagePath,VillageName,SpecificLocation,AccidentDate)
    VALUES (?,?,?,?,?,?,?,?)`).run(q.u.id, d.DepartmentID, v.cat, v.desc, img, v.vil, v.loc, v.dt).lastInsertRowid;
  if (b.draftId) {
    const k = db.prepare("SELECT ImagePath FROM Draft WHERE DraftID=? AND ResidentID=?").get(b.draftId, q.u.id);
    if (k) { db.prepare("DELETE FROM Draft WHERE DraftID=?").run(b.draftId); delImg(k.ImagePath); }
  }
  const r = db.prepare("SELECT * FROM Resident WHERE ResidentID=?").get(q.u.id);
  const notices = [await notify(r, "SMS", "Your report has been submitted", id), await notify(r, "EMAIL", "Your report has been submitted", id)];
  out(s, { id }, notices);
}));

app.get("/api/reports/mine", res_, (q, s) =>
  s.json({ reports: db.prepare(REPORT_SQL + " WHERE r.ResidentID=? ORDER BY r.ReportID DESC").all(q.u.id).map(r => R(r)) }));

app.get("/api/drafts", res_, (q, s) =>
  s.json({ drafts: db.prepare(DRAFT_SQL + " WHERE k.ResidentID=? ORDER BY k.LastUpdated DESC").all(q.u.id).map(K) }));

app.post("/api/drafts", res_, wrap(async (q, s) => {
  const b = q.body, d = deptRow(str(b.dept, 10));
  if (!d) return bad(s, 400, "Choose a department.");
  const old = b.id && db.prepare("SELECT * FROM Draft WHERE DraftID=? AND ResidentID=?").get(b.id, q.u.id);
  if (b.id && !old) return bad(s, 404, "Draft not found.");
  const img = b.img ? saveImg(b.img) : null;
  const f = [str(b.cat, 100), str(b.desc, 2000), str(b.vil, 100), str(b.loc, 200), str(b.dt, 10)].map(x => x || null);
  if (old) {
    db.prepare(`UPDATE Draft SET Category=?,Description=?,VillageName=?,SpecificLocation=?,AccidentDate=?,ImagePath=?,LastUpdated=CURRENT_TIMESTAMP WHERE DraftID=?`)
      .run(...f, img, old.DraftID);
    delImg(old.ImagePath);
  } else {
    db.prepare(`INSERT INTO Draft (ResidentID,DepartmentID,Category,Description,VillageName,SpecificLocation,AccidentDate,ImagePath) VALUES (?,?,?,?,?,?,?,?)`)
      .run(q.u.id, d.DepartmentID, ...f, img);
  }
  s.json({ ok: true });
}));

app.delete("/api/drafts/:id", res_, (q, s) => {
  const k = db.prepare("SELECT ImagePath FROM Draft WHERE DraftID=? AND ResidentID=?").get(q.params.id, q.u.id);
  if (!k) return bad(s, 404, "Draft not found.");
  db.prepare("DELETE FROM Draft WHERE DraftID=?").run(q.params.id); delImg(k.ImagePath);
  s.json({ ok: true });
});

/* ---------- department administrator (sees only their own department) ---------- */
const dep_ = auth("dept");
app.get("/api/admin/reports", dep_, (q, s) =>
  s.json({ reports: db.prepare(REPORT_SQL + " WHERE r.DepartmentID=? ORDER BY r.ReportID DESC").all(q.u.dept).map(r => R(r)) }));

const NEXT = { Submitted: ["Approved", "Declined"], Approved: ["Resolved"] };
app.patch("/api/admin/reports/:id", dep_, wrap(async (q, s) => {
  const r = db.prepare("SELECT * FROM Report WHERE ReportID=? AND DepartmentID=?").get(q.params.id, q.u.dept);
  if (!r) return bad(s, 404, "Report not found in your department.");
  const to = str(q.body.status, 20);
  if (!(NEXT[r.Status] || []).includes(to)) return bad(s, 400, `This report is ${r.Status} and cannot become ${to}.`);
  db.prepare("UPDATE Report SET Status=?, UpdatedAt=CURRENT_TIMESTAMP WHERE ReportID=?").run(to, r.ReportID);
  const notices = [];
  if (to === "Approved") {
    const u = db.prepare("SELECT * FROM Resident WHERE ResidentID=?").get(r.ResidentID);
    notices.push(await notify(u, "SMS", "Expect the problem to be attended in the 1-7 working days", r.ReportID));
  }
  out(s, { ok: true }, notices);
}));

/* ---------- main / municipality administrator ---------- */
const main_ = auth("main");
const scope = c => (c && c !== "all" ? (deptRow(c)?.DepartmentID ?? -1) : null);
app.get("/api/main/stats", main_, (q, s) => {
  const d = scope(q.query.dept), o = { Submitted: 0, Approved: 0, Declined: 0, Resolved: 0 };
  db.prepare("SELECT Status, COUNT(*) n FROM Report WHERE (@d IS NULL OR DepartmentID=@d) GROUP BY Status").all({ d })
    .forEach(x => o[x.Status] = x.n);
  s.json({ ...o, total: Object.values(o).reduce((a, b) => a + b, 0), residents: db.prepare("SELECT COUNT(*) FROM Resident").pluck().get() });
});
app.get("/api/main/reports", main_, (q, s) => {
  const d = scope(q.query.dept);
  s.json({ reports: db.prepare(REPORT_SQL + " WHERE (@d IS NULL OR r.DepartmentID=@d) ORDER BY r.ReportID DESC").all({ d }).map(r => R(r, false)) });
});
app.get("/api/main/breakdown", main_, (q, s) => {
  const by = {};
  db.prepare("SELECT d.Code, r.Status, COUNT(*) n FROM Report r JOIN Department d ON d.DepartmentID=r.DepartmentID GROUP BY d.Code, r.Status").all()
    .forEach(x => { const b = by[x.Code] ||= { total: 0 }; b[x.Status] = x.n; b.total += x.n; });
  s.json({ by });
});

/* ---------- static front end and errors ---------- */
app.use(express.static(path.join(__dirname, "public")));
app.use("/api", (q, s) => bad(s, 404, "Not found."));
app.use((e, q, s, n) => bad(s, e.status || 500, e.type === "entity.too.large" ? "The photo is too large." : "Invalid request."));

if (require.main === module) {
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Thulamela system running at http://localhost:${port}`));
}
module.exports = app;
