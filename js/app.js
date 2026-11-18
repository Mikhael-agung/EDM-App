// harus dicek sebelum createClient, karena Supabase membersihkan hash URL
const IS_RECOVERY = /type=recovery/.test(location.hash);
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);
let rows = [],
  customers = [],
  machines = [],
  editId = null;
let page = 1,
  pageSize = 25;

// Terjemahin error Supabase jadi pesan yang jelas
function errMsg(err) {
  const m = String((err && err.message) || err || "").toLowerCase();
  if (m.includes("invalid login credentials"))
    return "Email atau password salah. Kalau yakin bener, pastikan user sudah dibuat di Supabase (Authentication → Users).";
  if (m.includes("email not confirmed"))
    return 'Email belum dikonfirmasi. Buat ulang user dengan centang "Auto Confirm User".';
  if (m.includes("invalid api key") || m.includes("apikey"))
    return "API key salah. Cek SUPABASE_ANON_KEY di js/config.js.";
  if (
    m.includes("failed to fetch") ||
    m.includes("networkerror") ||
    m.includes("load failed")
  )
    return "Gagal konek ke server. Cek internet dan SUPABASE_URL di js/config.js.";
  if (m.includes("rate limit") || m.includes("too many"))
    return "Terlalu banyak percobaan. Tunggu sebentar lalu coba lagi.";
  if (m.includes("row-level security") || m.includes("permission denied"))
    return "Tidak punya akses. Coba login ulang.";
  if (m.includes("could not find the table") || m.includes("does not exist"))
    return "Tabel belum ada. Jalankan schema.sql di Supabase SQL Editor.";
  if (
    m.includes("different from the old password") ||
    m.includes("same password")
  )
    return "Password baru tidak boleh sama dengan yang lama.";
  if (m.includes("at least")) return "Password terlalu pendek.";
  if (m.includes("not authorized") || m.includes("sending recovery"))
    return "Email reset gagal dikirim. Cek pengaturan email/SMTP di Supabase, atau reset manual lewat dashboard.";
  if (m.includes("session missing") || m.includes("expired"))
    return "Link reset sudah kadaluarsa. Minta link baru lewat Lupa password.";
  if (m.includes("duplicate key")) return "Data dengan nama itu sudah ada.";
  if (m.includes("jwt expired")) return "Sesi habis. Silakan login lagi.";
  return "Terjadi kesalahan: " + ((err && err.message) || err);
}
function toast(t) {
  const e = $("toast");
  e.textContent = t;
  e.classList.add("on");
  setTimeout(() => e.classList.remove("on"), 2200);
}
function esc(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
function hm(t) {
  return t ? t.slice(0, 5) : "-";
}
function dur(m) {
  if (m == null) return "-";
  return Math.floor(m / 60) + "j " + String(m % 60).padStart(2, "0") + "m";
}
function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function nowTo(id) {
  const d = new Date();
  $(id).value =
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0");
}

// ---------- AUTH ----------
async function init() {
  if (IS_RECOVERY) {
    showRecover();
    return;
  }
  const {
    data: { session },
  } = await sb.auth.getSession();
  session ? showApp(session.user) : showLogin();
}
function showLogin() {
  $("login").classList.remove("hide");
  $("recover").classList.add("hide");
  $("app").classList.add("hide");
}
function showRecover() {
  $("login").classList.add("hide");
  $("app").classList.add("hide");
  $("recover").classList.remove("hide");
}
sb.auth.onAuthStateChange((ev) => {
  if (ev === "PASSWORD_RECOVERY") showRecover();
});

// ---------- LUPA / RESET PASSWORD ----------
$("lnkForgot").onclick = async (e) => {
  e.preventDefault();
  const msg = $("msg");
  msg.className = "";
  msg.textContent = "";
  const email = $("em").value.trim();
  if (!email) {
    msg.textContent = "Isi email dulu di kolom Email, lalu klik Lupa password.";
    return;
  }
  try {
    const { error } = await sb.auth.resetPasswordForEmail(email, {
      redirectTo: location.origin + location.pathname,
    });
    if (error) {
      msg.textContent = errMsg(error);
      return;
    }
    msg.className = "ok";
    msg.textContent =
      "Kalau email terdaftar, link reset sudah dikirim. Cek inbox (dan folder spam).";
  } catch (err) {
    msg.textContent = errMsg(err);
  }
};
$("btnNewPw").onclick = async () => {
  const m = $("msg2");
  m.className = "";
  m.textContent = "";
  const p1 = $("np1").value,
    p2 = $("np2").value;
  if (p1.length < 8) {
    m.textContent = "Password minimal 8 karakter.";
    return;
  }
  if (p1 !== p2) {
    m.textContent = "Password dan ulangi password tidak sama.";
    return;
  }
  const { data, error } = await sb.auth.updateUser({ password: p1 });
  if (error) {
    m.textContent = errMsg(error);
    return;
  }
  history.replaceState(null, "", location.pathname);
  toast("Password berhasil diganti");
  showApp(data.user);
};
async function showApp(user) {
  $("login").classList.add("hide");
  $("app").classList.remove("hide");
  $("who").textContent = user.email;
  $("f_date").value = today();
  await loadMasters();
  await loadJobs();
}
$("btnLogin").onclick = async () => {
  $("msg").textContent = "";
  const email = $("em").value.trim(),
    password = $("pw").value;
  if (!email || !password) {
    $("msg").textContent = "Email dan password wajib diisi.";
    return;
  }
  const btn = $("btnLogin");
  btn.disabled = true;
  btn.textContent = "Memproses...";
  try {
    const { data, error } = await sb.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      $("msg").textContent = errMsg(error);
      return;
    }
    showApp(data.user);
  } catch (e) {
    $("msg").textContent = errMsg(e);
  } finally {
    btn.disabled = false;
    btn.textContent = "Masuk";
  }
};
$("pw").addEventListener("keydown", (e) => {
  if (e.key === "Enter") $("btnLogin").click();
});
$("btnOut").onclick = async () => {
  await sb.auth.signOut();
  showLogin();
};

// ---------- MASTER ----------
async function loadMasters() {
  const [c, m] = await Promise.all([
    sb.from("customers").select("*").order("name"),
    sb.from("machines").select("*").eq("is_active", true).order("name"),
  ]);
  customers = c.data || [];
  machines = m.data || [];
  fillSel("f_cust", customers, false);
  fillSel("f_mach", machines, false);
  fillSel("fc", customers, true);
  fillSel("fm", machines, true);
}
function fillSel(id, list, withAll) {
  const cur = $(id).value;
  $(id).innerHTML =
    (withAll
      ? '<option value="">Semua</option>'
      : '<option value="">- pilih -</option>') +
    list.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("");
  if (cur) $(id).value = cur;
}
async function addMaster(table) {
  const name = prompt(
    table === "customers" ? "Nama customer baru:" : "Nama mesin baru:",
  );
  if (!name || !name.trim()) return;
  const { data, error } = await sb
    .from(table)
    .insert({ name: name.trim() })
    .select()
    .single();
  if (error) {
    toast(errMsg(error));
    return;
  }
  await loadMasters();
  $(table === "customers" ? "f_cust" : "f_mach").value = data.id;
}

// ---------- JOBS ----------
async function loadJobs() {
  let q = sb
    .from("jobs_view")
    .select("*")
    .order("job_date", { ascending: false })
    .order("start_time", { ascending: false, nullsFirst: false })
    .limit(1000);
  if ($("d1").value) q = q.gte("job_date", $("d1").value);
  if ($("d2").value) q = q.lte("job_date", $("d2").value);
  if ($("fc").value) q = q.eq("customer_id", $("fc").value);
  if ($("fm").value) q = q.eq("machine_id", $("fm").value);
  if ($("fk").value === "1") q = q.eq("needs_check", true);
  const pr = $("q")
    .value.trim()
    .replace(/[,()%*]/g, " ");
  if (pr) q = q.ilike("pr_no", `%${pr}%`);
  const sz = $("fi")
    .value.trim()
    .replace(/[,()%*]/g, " ");
  if (sz) q = q.ilike("item_size", `%${sz}%`);
  const { data, error } = await q;
  if (error) {
    toast(errMsg(error));
    return;
  }
  rows = data || [];
  render();
  loadPieces().then(render);
}
// ---------- SORT (klik header kolom: naik → turun → default) ----------
let sortKey = null,
  sortDir = 1;
function sortVal(r, k) {
  return k === "status" ? (r.end_time ? 1 : 0) : r[k];
}
function sortedRows() {
  if (!sortKey) return rows;
  return [...rows].sort((a, b) => {
    const x = sortVal(a, sortKey),
      y = sortVal(b, sortKey);
    if (x == null && y == null) return 0;
    if (x == null) return 1; // data kosong selalu di bawah
    if (y == null) return -1;
    const c =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y), "id", {
            numeric: true,
            sensitivity: "base",
          });
    return c * sortDir;
  });
}
document.querySelectorAll("th[data-k]").forEach((th) => {
  th.onclick = () => {
    const k = th.dataset.k;
    if (sortKey !== k) {
      sortKey = k;
      sortDir = 1;
    } else {
      sortDir = -sortDir;
    }
    page = 1;
    render();
  };
});

function render() {
  document.querySelectorAll("th[data-k]").forEach((th) => {
    const on = th.dataset.k === sortKey;
    th.classList.toggle("on", on);
    th.querySelector(".ar").textContent = on
      ? sortDir === 1
        ? " ▲"
        : " ▼"
      : " ↕";
  });
  const all = sortedRows();
  const pages = Math.max(1, Math.ceil(all.length / pageSize));
  if (page > pages) page = pages;
  const start = (page - 1) * pageSize;
  $("tb").innerHTML =
    all
      .slice(start, start + pageSize)
      .map((r) => {
        const open = openIds.has(r.id);
        return `
    <tr class="${r.needs_check ? "chk" : ""}${open ? " openrow" : ""}" id="row-${r.id}">
      <td><button class="s tg" aria-label="Detail per pcs" aria-expanded="${open}" onclick="togglePcs('${r.id}')"><span class="ch">▸</span></button></td>
      <td>${esc(r.job_date)}</td>
      <td><b>${esc(r.pr_no)}</b>${r.needs_check ? ' <span title="Perlu dicek">⚠</span>' : ""}</td>
      <td>${esc(r.item_size)}</td>
      <td>${r.qty}</td>
      <td>${hm(r.start_time)}</td>
      <td>${hm(r.end_time)}</td>
      <td>${dur(r.duration_min)}</td>
      <td id="st-${r.id}">${pcsStat(r)}</td>
      <td>${esc(r.customer_name)}</td>
      <td>${esc(r.machine_name)}</td>
      <td>${r.end_time ? '<span class="tag done">Selesai</span>' : '<span class="tag run">Jalan</span>'}</td>
      <td>
        ${r.needs_check ? `<button class="s" onclick="markOk('${r.id}')">OK</button>` : ""}
        <button class="s" onclick="editJob('${r.id}')">Edit</button>
        <button class="s d" onclick="delJob('${r.id}')">Hapus</button>
      </td>
    </tr>
    <tr class="det${open ? " open" : ""}" id="det-${r.id}"><td colspan="13"><div class="acc${open ? " open" : ""}"><div class="acc-in" id="acc-${r.id}">${open ? pcsPanel(r) : ""}</div></div></td></tr>`;
      })
      .join("") || '<tr><td colspan="13" class="mut">Belum ada data</td></tr>';
  const tot = rows.reduce((a, r) => a + (r.duration_min || 0), 0);
  const nChk = rows.filter((r) => r.needs_check).length;
  $("sum").textContent =
    `${rows.length} data · total ${dur(tot)} jam mesin` +
    (nChk ? ` · ${nChk} perlu dicek` : "");
  $("pgInfo").textContent = all.length
    ? `${start + 1}–${Math.min(start + pageSize, all.length)} dari ${all.length} · hal ${page}/${pages}`
    : "0 data";
  $("pgFirst").disabled = $("pgPrev").disabled = page <= 1;
  $("pgNext").disabled = $("pgLast").disabled = page >= pages;
}
$("pgFirst").onclick = () => {
  page = 1;
  render();
};
$("pgPrev").onclick = () => {
  page--;
  render();
};
$("pgNext").onclick = () => {
  page++;
  render();
};
$("pgLast").onclick = () => {
  page = Infinity;
  render();
};
$("pgSize").onchange = () => {
  pageSize = parseInt($("pgSize").value);
  page = 1;
  render();
};
["q", "fi", "d1", "d2", "fc", "fm", "fk"].forEach((id) => {
  let t;
  $(id).addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => {
      page = 1;
      loadJobs();
    }, 300);
  });
});
$("btnReset").onclick = () => {
  ["q", "fi", "d1", "d2", "fc", "fm", "fk"].forEach((id) => ($(id).value = ""));
  sortKey = null;
  sortDir = 1;
  page = 1;
  loadJobs();
};

function resetForm() {
  editId = null;
  ["f_pr", "f_item", "f_start", "f_end", "f_notes"].forEach(
    (i) => ($(i).value = ""),
  );
  $("f_qty").value = 1;
  $("f_chk").checked = false;
  $("f_date").value = today();
  $("formTitle").textContent = "Tambah pengerjaan";
  $("btnCancel").classList.add("hide");
  $("formCard").classList.remove("modal");
  $("backdrop").classList.add("hide");
}
$("btnCancel").onclick = resetForm;
$("backdrop").onclick = resetForm;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && editId) resetForm();
});

$("btnSave").onclick = async () => {
  const pr = $("f_pr").value.trim();
  if (!pr) {
    toast("PR wajib diisi");
    return;
  }
  const payload = {
    job_date: $("f_date").value || today(),
    pr_no: pr,
    item_size: $("f_item").value.trim() || null,
    qty: parseInt($("f_qty").value) || 1,
    start_time: $("f_start").value || null,
    end_time: $("f_end").value || null,
    customer_id: $("f_cust").value || null,
    machine_id: $("f_mach").value || null,
    notes: $("f_notes").value.trim() || null,
    needs_check: $("f_chk").checked,
  };
  const old = editId ? rows.find((x) => x.id === editId) : null;
  const res = editId
    ? await sb.from("jobs").update(payload).eq("id", editId).select().single()
    : await sb.from("jobs").insert(payload).select().single();
  if (res.error) {
    toast(errMsg(res.error));
    return;
  }
  await syncPieces(res.data, old);
  toast(editId ? "Data diupdate" : "Data tersimpan");
  resetForm();
  loadJobs();
};

function editJob(id) {
  const r = rows.find((x) => x.id === id);
  if (!r) return;
  editId = id;
  $("f_date").value = r.job_date;
  $("f_pr").value = r.pr_no;
  $("f_item").value = r.item_size || "";
  $("f_qty").value = r.qty;
  $("f_start").value = r.start_time ? r.start_time.slice(0, 5) : "";
  $("f_end").value = r.end_time ? r.end_time.slice(0, 5) : "";
  $("f_cust").value = r.customer_id || "";
  $("f_mach").value = r.machine_id || "";
  $("f_notes").value = r.notes || "";
  $("f_chk").checked = !!r.needs_check;
  $("formTitle").textContent = "Edit pengerjaan";
  $("btnCancel").classList.remove("hide");
  $("formCard").classList.add("modal");
  $("backdrop").classList.remove("hide");
  $("f_pr").focus();
}
async function markOk(id) {
  const { error } = await sb
    .from("jobs")
    .update({ needs_check: false })
    .eq("id", id);
  if (error) {
    toast(errMsg(error));
    return;
  }
  toast("Ditandai sudah dicek");
  loadJobs();
}
async function delJob(id) {
  if (!confirm("Hapus data ini?")) return;
  const { error } = await sb.from("jobs").delete().eq("id", id);
  if (error) {
    toast(errMsg(error));
    return;
  }
  delete piecesByJob[id];
  openIds.delete(id);
  toast("Terhapus");
  loadJobs();
}

// ---------- PER PCS (dropdown di tiap baris) ----------
let piecesByJob = {};
const openIds = new Set();
const ensuring = new Set();
function pmin(p) {
  if (!p.start_time || !p.end_time) return null;
  const t = (x) => {
    const [h, m] = x.split(":");
    return parseInt(h) * 60 + parseInt(m);
  };
  let d = t(p.end_time) - t(p.start_time);
  if (d < 0) d += 1440; // lewat tengah malam
  return d;
}
function pcsNums(r) {
  const d = (piecesByJob[r.id] || []).map(pmin).filter((x) => x != null);
  return {
    n: d.length,
    avg: d.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length) : null,
  };
}
function pcsStat(r) {
  const s = pcsNums(r);
  return s.n ? `${dur(s.avg)} · ${s.n}/${r.qty}` : "-";
}
function hm0(t) {
  return t ? t.slice(0, 5) : "";
}
async function loadPieces() {
  const all = [];
  let from = 0;
  for (;;) {
    const { data, error } = await sb
      .from("job_pieces")
      .select("*")
      .order("job_id")
      .order("piece_no")
      .range(from, from + 999);
    if (error) {
      toast(errMsg(error));
      return;
    }
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  piecesByJob = {};
  all.forEach((p) => (piecesByJob[p.job_id] ||= []).push(p));
}
function pcsPanel(r) {
  const list = piecesByJob[r.id] || [];
  if (!list.length) return '<div class="pc-box mut">Memuat...</div>';
  const head = `<div class="pc-head mut">Waktu per pcs · isi manual tiap pcs selesai, lalu Simpan</div>`;
  return (
    '<div class="pc-box">' +
    head +
    list
      .map((p) => {
        const k = `${r.id}_${p.piece_no}`;
        const m = pmin(p);
        return `<div class="pc">
      <b class="pn">Pcs ${p.piece_no}</b>
      <input id="ps_${k}" type="time" aria-label="Mulai pcs ${p.piece_no}" value="${hm0(p.start_time)}" />
      <button type="button" class="s" onclick="nowTo('ps_${k}')">Now</button>
      <span class="mut">→</span>
      <input id="pe_${k}" type="time" aria-label="Selesai pcs ${p.piece_no}" value="${hm0(p.end_time)}" />
      <button type="button" class="s" onclick="nowTo('pe_${k}')">Now</button>
      <span class="pd" id="pd_${k}">${m == null ? "-" : dur(m)}</span>
      <button type="button" class="s p" onclick="savePcs('${r.id}',${p.piece_no})">Simpan</button>
    </div>`;
      })
      .join("") +
    "</div>"
  );
}
async function ensurePieces(r) {
  if (ensuring.has(r.id)) return false;
  ensuring.add(r.id);
  try {
    const have = new Set((piecesByJob[r.id] || []).map((p) => p.piece_no));
    const add = [];
    const qty = r.qty || 1;
    for (let i = 1; i <= qty; i++)
      if (!have.has(i))
        add.push({
          job_id: r.id,
          piece_no: i,
          // pcs 1 ikut jam mulai pekerjaan, pcs terakhir ikut jam selesai
          start_time: i === 1 ? r.start_time || null : null,
          end_time: i === qty ? r.end_time || null : null,
        });
    if (add.length) {
      const { data, error } = await sb.from("job_pieces").insert(add).select();
      if (error) {
        toast(errMsg(error));
        return false;
      }
      piecesByJob[r.id] = (piecesByJob[r.id] || [])
        .concat(data)
        .sort((a, b) => a.piece_no - b.piece_no);
    }
    return true;
  } finally {
    ensuring.delete(r.id);
  }
}
// dipanggil setelah pekerjaan disimpan: buat pcs, lalu ikutkan jam mulai/selesai
async function syncPieces(job, old) {
  if (!job) return;
  if (!(await ensurePieces(job))) return;
  const list = piecesByJob[job.id] || [];
  const first = list.find((p) => p.piece_no === 1);
  const last = list.find((p) => p.piece_no === (job.qty || 1));
  const upd = [];
  // hanya ikut kalau pcs masih kosong atau sama dengan nilai lama (belum diubah manual)
  if (
    old &&
    first &&
    hm0(job.start_time) !== hm0(first.start_time) &&
    (!first.start_time || hm0(first.start_time) === hm0(old.start_time))
  )
    upd.push([first, { start_time: job.start_time || null }]);
  if (
    old &&
    last &&
    hm0(job.end_time) !== hm0(last.end_time) &&
    (!last.end_time || hm0(last.end_time) === hm0(old.end_time))
  )
    upd.push([last, { end_time: job.end_time || null }]);
  for (const [p, patch] of upd) {
    const { data, error } = await sb
      .from("job_pieces")
      .update(patch)
      .eq("id", p.id)
      .select()
      .single();
    if (!error) Object.assign(p, data);
  }
}
async function togglePcs(id) {
  const r = rows.find((x) => x.id === id);
  const row = $("row-" + id),
    det = $("det-" + id);
  if (!r || !row || !det) return;
  const acc = det.querySelector(".acc"),
    btn = row.querySelector(".tg");
  if (openIds.has(id)) {
    openIds.delete(id);
    acc.classList.remove("open");
    det.classList.remove("open");
    row.classList.remove("openrow");
    btn.setAttribute("aria-expanded", "false");
    return;
  }
  openIds.add(id);
  row.classList.add("openrow");
  det.classList.add("open");
  btn.setAttribute("aria-expanded", "true");
  $("acc-" + id).innerHTML = '<div class="pc-box mut">Memuat...</div>';
  requestAnimationFrame(() => acc.classList.add("open"));
  const ok = await ensurePieces(r);
  if (!ok) {
    openIds.delete(id);
    render();
    return;
  }
  if (openIds.has(id)) $("acc-" + id).innerHTML = pcsPanel(r);
}
async function savePcs(jobId, no) {
  const k = `${jobId}_${no}`;
  const s = $("ps_" + k).value || null,
    e = $("pe_" + k).value || null;
  const { data, error } = await sb
    .from("job_pieces")
    .update({ start_time: s, end_time: e })
    .eq("job_id", jobId)
    .eq("piece_no", no)
    .select()
    .single();
  if (error) {
    toast(errMsg(error));
    return;
  }
  const list = piecesByJob[jobId] || [];
  const i = list.findIndex((p) => p.piece_no === no);
  if (i >= 0) list[i] = data;
  const m = pmin(data);
  $("pd_" + k).textContent = m == null ? "-" : dur(m);
  const r = rows.find((x) => x.id === jobId);
  if (r && $("st-" + jobId)) $("st-" + jobId).textContent = pcsStat(r);
  const jp = {};
  if (r) {
    if (no === 1 && s && !r.start_time) jp.start_time = s;
    if (no === (r.qty || 1) && e && hm0(r.end_time) !== e) jp.end_time = e;
  }
  if (Object.keys(jp).length) {
    const { error: e2 } = await sb.from("jobs").update(jp).eq("id", jobId);
    if (!e2) {
      toast(
        jp.end_time
          ? "Pcs terakhir selesai, pekerjaan ditandai Selesai"
          : `Pcs ${no} tersimpan`,
      );
      loadJobs();
      return;
    }
  }
  toast(`Pcs ${no} tersimpan`);
}

// ---------- EXPORT CSV ----------
$("btnCsv").onclick = () => {
  const head = [
    "Tanggal",
    "PR",
    "Item",
    "Qty",
    "Mulai",
    "Selesai",
    "Durasi (menit)",
    "Customer",
    "Mesin",
    "Catatan",
    "Pcs selesai",
    "Rata-rata per pcs (menit)",
  ];
  const cell = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
  const lines = [head.map(cell).join(",")].concat(
    rows.map((r) =>
      [
        r.job_date,
        r.pr_no,
        r.item_size,
        r.qty,
        hm(r.start_time),
        hm(r.end_time),
        r.duration_min,
        r.customer_name,
        r.machine_name,
        r.notes,
        pcsNums(r).n,
        pcsNums(r).avg,
      ]
        .map(cell)
        .join(","),
    ),
  );
  const blob = new Blob(["\ufeff" + lines.join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `log-wedm-${today()}.csv`;
  a.click();
};

init();
