const SUPABASE_URL = "https://tqfocdktvjuwoiyfgesb.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxZm9jZGt0dmp1d29peWZnZXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk5MDg0NTIsImV4cCI6MjEwNTQ4NDQ1Mn0.8TW4fQCQHc4c_xTNBEwOK3lSC9HYCbkTbfXuYQB-S8g";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

const $ = (id) => document.getElementById(id);
const views = ["desk", "board", "booth", "auth"];
let user = null;
let signupMode = false;

function show(name) {
  views.forEach((v) => $(`view-${v}`).classList.toggle("active", v === name));
}

document.querySelectorAll("[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const next = btn.dataset.view;
    if (next === "booth" && !user) return show("auth");
    show(next);
  });
});

$("authBtn").addEventListener("click", async () => {
  if (user) {
    await sb.auth.signOut();
    return;
  }
  show("auth");
});

$("toggleMode").addEventListener("click", () => {
  signupMode = !signupMode;
  $("authTitle").textContent = signupMode ? "Open a booth" : "Sign in";
  $("authSubmit").textContent = signupMode ? "Create lock" : "Enter";
  $("toggleMode").textContent = signupMode ? "Have a key?" : "Need an account?";
  $("handleRow").hidden = !signupMode;
});

$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("authErr").textContent = "";
  const fd = new FormData(e.target);
  const email = String(fd.get("email"));
  const password = String(fd.get("password"));
  const handle = String(fd.get("handle") || "").replace(/[^a-z0-9_]/gi, "").slice(0, 24);
  try {
    if (signupMode) {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
      if (data.user) {
        await sb.from("profiles").upsert({
          id: data.user.id,
          handle: handle || `operator_${data.user.id.slice(0, 6)}`,
          display_name: handle || email.split("@")[0],
        });
      }
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (err) {
    $("authErr").textContent = err.message || "Could not open the lock.";
  }
});

$("noteForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!user) return show("auth");
  const fd = new FormData(e.target);
  const { error } = await sb.from("notes").insert({
    user_id: user.id,
    title: String(fd.get("title")).trim(),
    body: String(fd.get("body")).trim(),
    is_public: Boolean(fd.get("is_public")),
  });
  if (error) {
    alert(error.message);
    return;
  }
  e.target.reset();
  await loadNotes();
});

function card(note, i = 0) {
  const el = document.createElement("article");
  el.className = "note";
  el.style.setProperty("--tilt", `${((i % 5) - 2) * 0.6}deg`);
  const when = new Date(note.created_at).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  el.innerHTML = `<h3></h3><p></p><div class="meta"></div>`;
  el.querySelector("h3").textContent = note.title;
  el.querySelector("p").textContent = note.body;
  el.querySelector(".meta").textContent = `${note.is_public ? "public" : "private"} · ${when}`;
  return el;
}

async function loadNotes() {
  const { data: pub } = await sb
    .from("notes")
    .select("*")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(60);

  const publicNotes = pub || [];
  $("publicGrid").innerHTML = "";
  $("fullBoard").innerHTML = "";
  publicNotes.slice(0, 8).forEach((n, i) => $("publicGrid").append(card(n, i)));
  publicNotes.forEach((n, i) => $("fullBoard").append(card(n, i)));

  const titles = publicNotes.map((n) => n.title).filter(Boolean);
  const loop = titles.length ? [...titles, ...titles] : ["waiting for a public note"];
  $("ticker").textContent = loop.join("   ·   ");

  const { data: hours } = await sb
    .from("hours")
    .select("*")
    .order("slot", { ascending: false })
    .limit(1);

  const featured =
    (hours && hours[0] && publicNotes.find((n) => n.id === hours[0].featured_note_id)) ||
    publicNotes.find((n) => n.featured_at) ||
    publicNotes[0];

  if (featured) {
    $("featureTitle").textContent = featured.title;
    $("featureBody").textContent = featured.body;
    $("featureBy").textContent = hours?.[0]?.headline
      ? `hour ${new Date(hours[0].slot).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · ${hours[0].headline}`
      : "from the public board";
    $("hourStamp").textContent = new Date(featured.featured_at || featured.created_at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    $("nowPlaying").textContent = featured.title;
  }

  $("mineGrid").innerHTML = "";
  if (user) {
    const { data: mine } = await sb
      .from("notes")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    (mine || []).forEach((n, i) => $("mineGrid").append(card(n, i)));
  }
}

async function refreshSession() {
  const { data } = await sb.auth.getSession();
  user = data.session?.user || null;
  $("authBtn").textContent = user ? "Sign out" : "Sign in";
  $("sessionLine").textContent = user ? user.email : "unsigned";
  if (user) {
    const { data: profile } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (!profile) {
      await sb.from("profiles").upsert({
        id: user.id,
        handle: `op_${user.id.slice(0, 6)}`,
        display_name: user.email.split("@")[0],
      });
    }
  }
}

sb.auth.onAuthStateChange(async () => {
  await refreshSession();
  await loadNotes();
  if (user) show("booth");
});

(async function boot() {
  await refreshSession();
  await loadNotes();
  setInterval(loadNotes, 60_000);
})();
