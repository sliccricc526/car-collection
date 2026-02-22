import { useState, useEffect } from "react";
import { supabase } from "./supabase";

const CONDITIONS = ["Concours", "Excellent", "Good", "Fair", "Project"];
const SORT_OPTIONS = [
  { label: "Make / Model", value: "make" },
  { label: "Year", value: "year" },
  { label: "Value", value: "current_value" },
  { label: "Date Acquired", value: "purchase_date" },
];

const fmt = (n) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";
const fmtMiles = (n) => n ? parseInt(n).toLocaleString() + " mi" : "—";
const todayStr = () => new Date().toISOString().split("T")[0];
const emptyForm = () => ({
  year: "", make: "", model: "", color: "", vin: "", mileage: "", condition: "Good",
  purchase_price: "", current_value: "", purchase_date: "", location: "",
  insurance: "", policy_number: "", registration_expiry: "", next_service_date: "",
  last_driven: "", notes: "", photos: [], maintenance_log: [],
});

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr + "T12:00:00") - new Date()) / 86400000);
}

function WarningBadge({ days, label, dark }) {
  if (days === null) return null;
  if (days < 0) return <span className={`text-xs rounded px-2 py-0.5 border ${dark ? "bg-red-900/60 text-red-300 border-red-700/50" : "bg-red-100 text-red-700 border-red-300"}`}>{label} overdue</span>;
  if (days <= 30) return <span className={`text-xs rounded px-2 py-0.5 border ${dark ? "bg-amber-900/60 text-amber-300 border-amber-700/50" : "bg-amber-100 text-amber-700 border-amber-300"}`}>{label} in {days}d</span>;
  return null;
}

function PhotoViewer({ photos, startIndex, onClose, dark }) {
  const [idx, setIdx] = useState(startIndex);
  const photo = photos[idx];

  function prev(e) { e.stopPropagation(); setIdx(i => (i - 1 + photos.length) % photos.length); }
  function next(e) { e.stopPropagation(); setIdx(i => (i + 1) % photos.length); }

  useEffect(() => {
    function onKey(e) {
      if (e.key === "ArrowLeft") setIdx(i => (i - 1 + photos.length) % photos.length);
      if (e.key === "ArrowRight") setIdx(i => (i + 1) % photos.length);
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function download() {
    try {
      const response = await fetch(photo.url);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = photo.name || "photo";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      window.open(photo.url, "_blank");
    }
  }

  return (
    <div className="fixed inset-0 bg-black/95 flex flex-col items-center justify-center z-50" onClick={onClose}>
      <div className="absolute top-0 left-0 right-0 flex justify-between items-center px-4 py-3" onClick={e => e.stopPropagation()}>
        <p className="text-sm text-stone-400 truncate max-w-xs">
          {photo.name} <span className="text-stone-600">({idx + 1} / {photos.length})</span>
        </p>
        <div className="flex gap-2">
          <button onClick={download} className="text-xs bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold px-3 py-1.5 rounded-md transition-colors">⬇ Download</button>
          <button onClick={onClose} className="text-xs bg-stone-800 hover:bg-stone-700 text-stone-200 px-3 py-1.5 rounded-md transition-colors">✕ Close</button>
        </div>
      </div>
      {photos.length > 1 && (
        <button onClick={prev} className="absolute left-3 top-1/2 -translate-y-1/2 bg-stone-800/80 hover:bg-stone-700 text-white w-10 h-10 rounded-full flex items-center justify-center text-xl transition-colors z-10">‹</button>
      )}
      <img src={photo.url} alt={photo.name} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
      {photos.length > 1 && (
        <button onClick={next} className="absolute right-3 top-1/2 -translate-y-1/2 bg-stone-800/80 hover:bg-stone-700 text-white w-10 h-10 rounded-full flex items-center justify-center text-xl transition-colors z-10">›</button>
      )}
      {photos.length > 1 && (
        <div className="absolute bottom-6 flex gap-2" onClick={e => e.stopPropagation()}>
          {photos.map((_, i) => (
            <button key={i} onClick={() => setIdx(i)} className={`w-2 h-2 rounded-full transition-colors ${i === idx ? "bg-amber-500" : "bg-stone-600 hover:bg-stone-400"}`} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [dark, setDark] = useState(true);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authView, setAuthView] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authMsg, setAuthMsg] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  const [garage, setGarage] = useState(null);
  const [garageView, setGarageView] = useState("loading");
  const [joinCode, setJoinCode] = useState("");
  const [joinError, setJoinError] = useState("");
  const [showShare, setShowShare] = useState(false);

  const [cars, setCars] = useState([]);
  const [carsLoading, setCarsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("make");
  const [sortDir, setSortDir] = useState("asc");
  const [view, setView] = useState("list");
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("details");
  const [form, setForm] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newLog, setNewLog] = useState({ date: "", description: "", cost: "", shop: "", photo: null });
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [viewingPhotoIndex, setViewingPhotoIndex] = useState(null);

  const t = {
    bg: dark ? "bg-stone-950" : "bg-stone-50",
    card: dark ? "bg-stone-900 border-stone-800" : "bg-white border-stone-200",
    text: dark ? "text-stone-200" : "text-stone-800",
    muted: dark ? "text-stone-500" : "text-stone-400",
    subtle: dark ? "text-stone-400" : "text-stone-600",
    input: dark ? "bg-stone-800 border-stone-700 text-stone-200 placeholder-stone-600 focus:border-amber-600" : "bg-white border-stone-300 text-stone-800 placeholder-stone-400 focus:border-amber-500",
    border: dark ? "border-stone-800" : "border-stone-200",
    divider: dark ? "border-stone-800/60" : "border-stone-200",
    hover: dark ? "hover:bg-stone-800" : "hover:bg-stone-50",
    strip: dark ? "bg-stone-900" : "bg-stone-100",
  };
  const inputCls = `w-full border rounded-md px-3 py-2 text-sm focus:outline-none font-sans ${t.input}`;

  // Auth
  useEffect(() => {
    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
      } catch (e) {
        console.error(e);
      } finally {
        setAuthLoading(false);
      }
    };
    init();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadGarage();
    else { setGarage(null); setGarageView("setup"); }
  }, [session]);

  async function loadGarage() {
    setGarageView("loading");
    try {
      const { data, error } = await supabase
        .from("garage_members")
        .select("garage_id, garages(id, name)")
        .eq("user_id", session.user.id)
        .single();
      if (error || !data) { setGarageView("setup"); return; }
      setGarage(data.garages);
      setGarageView("app");
    } catch { setGarageView("setup"); }
  }

  async function createGarage() {
    try {
      const { data: g, error: ge } = await supabase.from("garages").insert([{ name: "My Garage" }]).select().single();
      if (ge) throw ge;
      const { error: me } = await supabase.from("garage_members").insert([{ garage_id: g.id, user_id: session.user.id, role: "owner" }]);
      if (me) throw me;
      setGarage(g);
      setGarageView("app");
    } catch (err) { alert("Error creating garage: " + err.message); }
  }

  async function joinGarage() {
    if (!joinCode.trim()) return setJoinError("Please enter a share code.");
    setJoinError("");
    try {
      const { data: g, error: ge } = await supabase.from("garages").select("*").eq("id", joinCode.trim()).single();
      if (ge || !g) return setJoinError("Garage not found. Check the code and try again.");
      const { error: me } = await supabase.from("garage_members").insert([{ garage_id: g.id, user_id: session.user.id, role: "member" }]);
      if (me) return setJoinError("Could not join garage. You may already be a member.");
      setGarage(g);
      setGarageView("app");
    } catch (err) { setJoinError(err.message); }
  }

  useEffect(() => {
    if (garage) fetchCars();
  }, [garage]);

  async function fetchCars() {
    setCarsLoading(true);
    try {
      const { data, error } = await supabase.from("cars").select("*")
        .eq("garage_id", garage.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCars(data || []);
    } catch (err) { console.error(err); }
    finally { setCarsLoading(false); }
  }

  async function signInWithGoogle() {
    setAuthBusy(true); setAuthError("");
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google" });
    if (error) { setAuthError(error.message); setAuthBusy(false); }
  }

  async function sendMagicLink() {
    if (!authEmail) return setAuthError("Please enter your email.");
    setAuthBusy(true); setAuthError("");
    const { error } = await supabase.auth.signInWithOtp({ email: authEmail });
    if (error) { setAuthError(error.message); setAuthBusy(false); }
    else { setAuthMsg("Check your email for a login link!"); setAuthBusy(false); }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setCars([]); setGarage(null); setView("list");
  }

  async function saveCar() {
    if (!form.year || !form.make || !form.model) return alert("Year, make, and model are required.");
    setSaving(true);
    try {
      const payload = {
        ...form,
        garage_id: garage.id,
        year: parseInt(form.year) || null,
        mileage: parseInt(form.mileage) || null,
        purchase_price: parseFloat(form.purchase_price) || null,
        current_value: parseFloat(form.current_value) || null,
        purchase_date: form.purchase_date || null,
        last_driven: form.last_driven || null,
        next_service_date: form.next_service_date || null,
        registration_expiry: form.registration_expiry || null,
      };
      if (isEditing) {
        const { error } = await supabase.from("cars").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cars").insert([payload]);
        if (error) throw error;
      }
      await fetchCars();
      setView("list");
    } catch (err) { alert("Error saving: " + err.message); }
    finally { setSaving(false); }
  }

  async function deleteCar() {
    const { error } = await supabase.from("cars").delete().eq("id", selectedId);
    if (!error) { await fetchCars(); setDeleteModal(false); setView("list"); }
  }

  async function updateCar(id, updates) {
    const { error } = await supabase.from("cars").update(updates).eq("id", id);
    if (!error) setCars(p => p.map(c => c.id === id ? { ...c, ...updates } : c));
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const path = `${garage.id}/${selectedId}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from("car-photos").upload(path, file);
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("car-photos").getPublicUrl(path);
      const updated = [...(car.photos || []), { url: publicUrl, name: file.name, path }];
      await updateCar(selectedId, { photos: updated });
    } catch (err) { alert("Upload failed: " + err.message); }
    finally { setUploadingPhoto(false); }
  }

  async function removePhoto(idx) {
    const photo = car.photos[idx];
    if (photo.path) await supabase.storage.from("car-photos").remove([photo.path]);
    await updateCar(selectedId, { photos: car.photos.filter((_, i) => i !== idx) });
  }

  function handleLogPhoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setNewLog(q => ({ ...q, photo: { url: reader.result, name: file.name } }));
    reader.readAsDataURL(file);
  }

  async function addLog() {
    if (!newLog.date || !newLog.description) return;
    const entry = { ...newLog, id: Date.now().toString(), cost: parseFloat(newLog.cost) || 0 };
    const updated = [entry, ...(car.maintenance_log || [])];
    await updateCar(selectedId, { maintenance_log: updated });
    setNewLog({ date: "", description: "", cost: "", shop: "", photo: null });
  }

  async function removeLog(logId) {
    await updateCar(selectedId, { maintenance_log: car.maintenance_log.filter(m => m.id !== logId) });
  }

  const car = cars.find(c => c.id === selectedId);
  const totalValue = cars.reduce((s, c) => s + (+c.current_value || 0), 0);
  const totalPaid = cars.reduce((s, c) => s + (+c.purchase_price || 0), 0);

  const filtered = cars
    .filter(c => {
      const q = search.toLowerCase();
      return !q || `${c.year} ${c.make} ${c.model} ${c.color} ${c.condition}`.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      let av = a[sortBy], bv = b[sortBy];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

  function toggleSort(val) {
    if (sortBy === val) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(val); setSortDir("asc"); }
  }

  function openCar(id) { setSelectedId(id); setTab("details"); setView("detail"); }
  function openAdd() { setForm(emptyForm()); setIsEditing(false); setView("form"); }
  function openEdit() { setForm({ ...car }); setIsEditing(true); setView("form"); }
  function setF(k, v) { setForm(p => ({ ...p, [k]: v })); }
  function haggertyUrl(c) { return `https://www.hagerty.com/valuation-tools/?search=${encodeURIComponent(`${c.year} ${c.make} ${c.model}`)}`; }

  if (authLoading || garageView === "loading") return (
    <div className={`min-h-screen ${t.bg} flex items-center justify-center ${t.muted} font-sans`}>Loading…</div>
  );

  if (!session) return (
    <div className={`min-h-screen ${t.bg} ${t.text} font-sans flex items-center justify-center px-6`}>
      <div className="w-full max-w-sm">
        <div className="flex justify-between items-center mb-10">
          <div>
            <p className="text-xs tracking-widest uppercase text-amber-600 mb-1 font-medium">Garage</p>
            <h1 className="text-2xl font-semibold tracking-tight">The Collection</h1>
          </div>
          <button onClick={() => setDark(d => !d)} className={`text-xs px-3 py-1.5 rounded-md border ${t.border} ${t.muted} transition-colors`}>
            {dark ? "☀️ Light" : "🌙 Dark"}
          </button>
        </div>
        <div className={`border ${t.card} rounded-xl p-6`}>
          {authView === "login" && (
            <>
              <button onClick={signInWithGoogle} disabled={authBusy}
                className="w-full flex items-center justify-center gap-3 bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 font-medium text-sm px-4 py-2.5 rounded-md transition-colors mb-4 disabled:opacity-50">
                <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" /><path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" /><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" /><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" /></svg>
                Continue with Google
              </button>
              <div className="flex items-center gap-3 mb-4">
                <div className={`flex-1 h-px border-t ${t.border}`} />
                <span className={`text-xs ${t.muted}`}>or</span>
                <div className={`flex-1 h-px border-t ${t.border}`} />
              </div>
              <button onClick={() => setAuthView("magic")} className="w-full text-sm text-amber-600 hover:text-amber-500 transition-colors">
                Sign in with email link instead
              </button>
              {authError && <p className="text-red-400 text-xs mt-3 text-center">{authError}</p>}
            </>
          )}
          {authView === "magic" && (
            <>
              <p className={`text-sm ${t.subtle} mb-4`}>We'll send a login link to your email — no password needed.</p>
              <input type="email" placeholder="your@email.com" value={authEmail} onChange={e => setAuthEmail(e.target.value)} className={`${inputCls} mb-3`} />
              {authMsg
                ? <p className="text-green-400 text-sm text-center">{authMsg}</p>
                : <button onClick={sendMagicLink} disabled={authBusy} className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-stone-950 font-semibold text-sm px-4 py-2 rounded-md transition-colors mb-3">
                  {authBusy ? "Sending…" : "Send login link"}
                </button>
              }
              <button onClick={() => { setAuthView("login"); setAuthMsg(""); setAuthError(""); }} className={`w-full text-sm ${t.muted} transition-colors mt-1`}>← Back</button>
              {authError && <p className="text-red-400 text-xs mt-3 text-center">{authError}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );

  if (garageView === "setup") return (
    <div className={`min-h-screen ${t.bg} ${t.text} font-sans flex items-center justify-center px-6`}>
      <div className="w-full max-w-sm">
        <div className="flex justify-between items-center mb-8">
          <div>
            <p className="text-xs tracking-widest uppercase text-amber-600 mb-1 font-medium">Welcome</p>
            <h1 className="text-2xl font-semibold tracking-tight">Get Started</h1>
          </div>
          <button onClick={signOut} className={`text-xs px-3 py-1.5 rounded-md border ${t.border} ${t.muted}`}>Sign out</button>
        </div>
        <div className={`border ${t.card} rounded-xl p-6 mb-4`}>
          <h2 className="text-base font-semibold mb-1">Create a new garage</h2>
          <p className={`text-sm ${t.muted} mb-4`}>Start fresh and invite others to join using your share code.</p>
          <button onClick={createGarage} className="w-full bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-sm px-4 py-2 rounded-md transition-colors">Create Garage</button>
        </div>
        <div className={`border ${t.card} rounded-xl p-6`}>
          <h2 className="text-base font-semibold mb-1">Join an existing garage</h2>
          <p className={`text-sm ${t.muted} mb-4`}>Enter the share code from someone who already has a garage.</p>
          <input value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="Paste share code here…" className={`${inputCls} mb-3`} />
          {joinError && <p className="text-red-400 text-xs mb-2">{joinError}</p>}
          <button onClick={joinGarage} className={`w-full border ${t.border} ${t.subtle} text-sm px-4 py-2 rounded-md transition-colors hover:border-amber-600 hover:text-amber-600`}>Join Garage</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} font-sans pb-20`}>

      {/* Top bar */}
      <div className={`sticky top-0 z-40 border-b ${t.border} ${dark ? "bg-stone-950/90" : "bg-stone-50/90"} backdrop-blur-sm px-4 py-3 flex justify-between items-center`}>
        <span className="text-sm font-semibold tracking-tight">{garage?.name || "The Collection"}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowShare(true)} className={`text-xs px-2.5 py-1.5 rounded-md border ${t.border} ${t.muted} transition-colors`}>Share 🔗</button>
          <button onClick={() => setDark(d => !d)} className={`text-xs px-2.5 py-1.5 rounded-md border ${t.border} ${t.muted} transition-colors`}>{dark ? "☀️" : "🌙"}</button>
          <button onClick={signOut} className={`text-xs px-2.5 py-1.5 rounded-md border ${t.border} ${t.muted} transition-colors`}>Out</button>
        </div>
      </div>

      {/* Share modal */}
      {showShare && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className={`border ${t.card} rounded-xl p-6 w-full max-w-sm shadow-2xl`}>
            <h3 className={`text-base font-semibold mb-2 ${t.text}`}>Share your garage</h3>
            <p className={`text-sm ${t.muted} mb-4`}>Send this code to anyone you want to invite.</p>
            <div className={`border ${t.border} rounded-lg p-3 mb-4 font-mono text-sm break-all ${t.text} ${dark ? "bg-stone-800" : "bg-stone-100"}`}>{garage.id}</div>
            <div className="flex gap-3">
              <button onClick={() => navigator.clipboard.writeText(garage.id)} className="flex-1 bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-sm px-4 py-2 rounded-md transition-colors">Copy Code</button>
              <button onClick={() => setShowShare(false)} className={`border ${t.border} ${t.muted} text-sm px-4 py-2 rounded-md`}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── LIST VIEW ── */}
      {view === "list" && (
        <div className="max-w-2xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">My Garage</h1>
            <button onClick={openAdd} className="bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-sm px-4 py-2 rounded-md transition-colors">+ Add</button>
          </div>
          {cars.length > 0 && (
            <div className={`grid grid-cols-2 ${t.strip} border ${t.border} rounded-xl mb-5 overflow-hidden`}>
              {[
                { label: "Vehicles", value: String(cars.length) },
                { label: "Total Value", value: fmt(totalValue) },
                { label: "Invested", value: fmt(totalPaid) },
                { label: "Gain / Loss", value: fmt(totalValue - totalPaid), color: (totalValue - totalPaid) >= 0 ? "text-green-500" : "text-red-400" },
              ].map((st, i) => (
                <div key={st.label} className={`p-4 ${i < 2 ? `border-b ${t.border}` : ""} ${i % 2 === 0 ? `border-r ${t.border}` : ""}`}>
                  <p className={`text-xs tracking-widest uppercase ${t.muted} mb-1`}>{st.label}</p>
                  <p className={`text-lg font-semibold ${st.color || t.text}`}>{st.value}</p>
                </div>
              ))}
            </div>
          )}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search make, model, year, color…" className={`${inputCls} mb-3`} />
          <div className="flex gap-2 mb-4 flex-wrap">
            {SORT_OPTIONS.map(opt => (
              <button key={opt.value} onClick={() => toggleSort(opt.value)}
                className={`text-xs px-3 py-1.5 rounded-md border transition-colors font-medium ${sortBy === opt.value ? "bg-amber-600/20 border-amber-600/50 text-amber-500" : `${dark ? "bg-stone-900 border-stone-800 text-stone-500 hover:text-stone-300" : "bg-white border-stone-200 text-stone-400 hover:text-stone-600"}`}`}>
                {opt.label} {sortBy === opt.value ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </button>
            ))}
          </div>
          {carsLoading ? (
            <p className={`text-center py-16 ${t.muted}`}>Loading…</p>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className={`${t.muted} mb-4`}>{search ? "No vehicles match your search." : "No vehicles yet."}</p>
              {!search && <button onClick={openAdd} className="bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-sm px-4 py-2 rounded-md">Add your first vehicle</button>}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filtered.map(c => {
                const gain = (+c.current_value || 0) - (+c.purchase_price || 0);
                const rd = daysUntil(c.registration_expiry), sd = daysUntil(c.next_service_date);
                return (
                  <button key={c.id} onClick={() => openCar(c.id)}
                    className={`flex justify-between items-center p-4 border ${t.card} rounded-xl ${t.hover} transition-colors text-left w-full`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-0.5">
                        <span className="text-xs text-amber-600 font-semibold">{c.year}</span>
                        <span className="text-base font-semibold">{c.make} {c.model}</span>
                      </div>
                      <p className={`text-sm ${t.muted} mb-1`}>{c.color}{c.condition ? " · " + c.condition : ""}</p>
                      <div className="flex gap-2 flex-wrap">
                        <WarningBadge days={rd} label="Registration" dark={dark} />
                        <WarningBadge days={sd} label="Service" dark={dark} />
                      </div>
                    </div>
                    <div className="flex items-center gap-3 ml-3 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-semibold">{fmt(c.current_value)}</p>
                        <p className={`text-xs ${gain >= 0 ? "text-green-500" : "text-red-400"}`}>{gain >= 0 ? "+" : ""}{fmt(gain)}</p>
                      </div>
                      <span className={`${t.muted} text-lg`}>›</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── DETAIL VIEW ── */}
      {view === "detail" && car && (
        <div className="max-w-2xl mx-auto px-4 py-6">

          {/* Photo viewer */}
          {viewingPhotoIndex !== null && car.photos?.length > 0 && (
            <PhotoViewer
              photos={car.photos}
              startIndex={viewingPhotoIndex}
              onClose={() => setViewingPhotoIndex(null)}
              dark={dark}
            />
          )}

          <div className="flex justify-between items-center mb-6">
            <button onClick={() => setView("list")} className={`text-sm ${t.muted} transition-colors`}>← Back</button>
            <div className="flex gap-2">
              <button onClick={openEdit} className="border border-amber-600 text-amber-600 hover:bg-amber-600 hover:text-stone-950 text-sm px-3 py-1.5 rounded-md transition-colors font-medium">Edit</button>
              <button onClick={() => setDeleteModal(true)} className={`text-sm ${t.muted} hover:text-red-400 px-2 py-1.5 rounded-md transition-colors`}>Delete</button>
            </div>
          </div>

          {(car.photos || []).length > 0 && (
            <div className="flex gap-3 mb-5 overflow-x-auto pb-2">
              {car.photos.map((p, i) => (
                <div key={i} className="relative shrink-0">
                  <img src={p.url} alt={p.name}
                    className="w-48 h-32 object-cover rounded-xl border border-stone-700 cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setViewingPhotoIndex(i)} />
                </div>
              ))}
            </div>
          )}

          <div className={`border-t-2 border-t-amber-600 border ${t.card} rounded-xl p-5 mb-5`}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="text-xs tracking-widest uppercase text-amber-600 mb-1 font-medium">{car.year}</p>
                <h2 className="text-2xl font-semibold leading-tight">{car.make}</h2>
                <h2 className={`text-2xl font-light ${t.muted} leading-tight`}>{car.model}</h2>
              </div>
              {car.condition && <span className="text-xs text-amber-600 bg-amber-600/10 border border-amber-600/30 rounded px-2 py-1 font-medium">{car.condition}</span>}
            </div>
            {(() => {
              const rd = daysUntil(car.registration_expiry), sd = daysUntil(car.next_service_date);
              const w = [];
              if (rd !== null && rd <= 30) w.push(<WarningBadge key="r" days={rd} label="Registration" dark={dark} />);
              if (sd !== null && sd <= 30) w.push(<WarningBadge key="s" days={sd} label="Service" dark={dark} />);
              return w.length > 0 ? <div className="flex gap-2 flex-wrap mb-3">{w}</div> : null;
            })()}
            <div className={`flex gap-4 pt-3 border-t ${t.border} flex-wrap`}>
              {car.color && <span className={`text-sm ${t.muted}`}>{car.color}</span>}
              {car.location && <span className={`text-sm ${t.muted}`}>📍 {car.location}</span>}
              {car.mileage && <span className={`text-sm ${t.muted}`}>{fmtMiles(car.mileage)}</span>}
            </div>
          </div>

          <div className={`flex border-b ${t.border} mb-5 overflow-x-auto`}>
            {["details", "photos", "financials", "insurance", "maintenance"].map(tb => (
              <button key={tb} onClick={() => setTab(tb)}
                className={`px-4 py-2 text-xs font-medium uppercase tracking-wider border-b-2 -mb-px transition-colors whitespace-nowrap ${tab === tb ? "border-amber-600 text-amber-600" : `border-transparent ${t.muted}`}`}>
                {tb}{tb === "photos" && car.photos?.length > 0 ? ` (${car.photos.length})` : ""}
              </button>
            ))}
          </div>

          {tab === "details" && (
            <div>
              {[
                { label: "Color", value: car.color },
                { label: "VIN / Serial", value: car.vin },
                { label: "Mileage", value: fmtMiles(car.mileage) },
                { label: "Storage Location", value: car.location },
                { label: "Acquired", value: fmtDate(car.purchase_date) },
                { label: "Last Driven / Started", value: fmtDate(car.last_driven) },
                { label: "Next Service Due", value: fmtDate(car.next_service_date) },
              ].map(r => (
                <div key={r.label} className={`flex justify-between items-start py-3 border-b ${t.divider}`}>
                  <span className={`text-sm ${t.muted}`}>{r.label}</span>
                  <span className={`text-sm font-medium text-right max-w-xs ${t.text}`}>{r.value || "—"}</span>
                </div>
              ))}
              {car.notes && (
                <div className={`mt-4 p-4 border ${t.card} border-l-2 border-l-amber-600/50 rounded-xl`}>
                  <p className={`text-xs tracking-widest uppercase ${t.muted} mb-2`}>Notes</p>
                  <p className={`text-sm ${t.subtle} leading-relaxed`}>{car.notes}</p>
                </div>
              )}
            </div>
          )}

          {tab === "photos" && (
            <div>
              <label className={`flex items-center justify-center gap-2 w-full border-2 border-dashed ${dark ? "border-stone-700 hover:border-amber-600" : "border-stone-300 hover:border-amber-500"} rounded-xl p-6 cursor-pointer transition-colors mb-5 ${uploadingPhoto ? "opacity-50 pointer-events-none" : ""}`}>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
                <span className={`text-sm ${t.muted}`}>{uploadingPhoto ? "Uploading…" : "Click to upload a photo"}</span>
              </label>
              {(car.photos || []).length === 0
                ? <p className={`text-sm text-center py-8 ${t.muted}`}>No photos yet.</p>
                : <div className="grid grid-cols-2 gap-3">
                  {car.photos.map((p, i) => (
                    <div key={i} className="relative group">
                      <img src={p.url} alt={p.name}
                        className="w-full h-40 object-cover rounded-xl border border-stone-700 cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => setViewingPhotoIndex(i)} />
                      <button onClick={() => removePhoto(i)} className="absolute top-2 right-2 bg-stone-950/80 text-stone-400 hover:text-red-400 rounded-full w-7 h-7 flex items-center justify-center text-lg opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                    </div>
                  ))}
                </div>
              }
            </div>
          )}

          {tab === "financials" && (
            <div>
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: "Purchase Price", value: fmt(car.purchase_price) },
                  { label: "Current Value", value: fmt(car.current_value) },
                  { label: "Unrealized Gain", value: fmt((+car.current_value || 0) - (+car.purchase_price || 0)), color: (+car.current_value - +car.purchase_price) >= 0 ? "text-green-500" : "text-red-400" },
                ].map(fc => (
                  <div key={fc.label} className={`border ${t.card} rounded-xl p-4`}>
                    <p className={`text-xs tracking-widest uppercase ${t.muted} mb-2`}>{fc.label}</p>
                    <p className={`text-lg font-semibold ${fc.color || t.text}`}>{fc.value}</p>
                  </div>
                ))}
              </div>
              <p className={`text-sm ${t.muted} mb-4`}>Total maintenance spend: <span className={`font-medium ${t.text}`}>{fmt((car.maintenance_log || []).reduce((s, m) => s + (m.cost || 0), 0))}</span></p>
              <a href={haggertyUrl(car)} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm border border-amber-600/40 text-amber-600 hover:bg-amber-600/10 px-4 py-2 rounded-md transition-colors">
                🔗 Look up value on Hagerty
              </a>
            </div>
          )}

          {tab === "insurance" && (
            <div>
              {[
                { label: "Provider", value: car.insurance },
                { label: "Policy Number", value: car.policy_number },
                { label: "Registration Expiry", value: fmtDate(car.registration_expiry) },
              ].map(r => (
                <div key={r.label} className={`flex justify-between items-start py-3 border-b ${t.divider}`}>
                  <span className={`text-sm ${t.muted}`}>{r.label}</span>
                  <span className={`text-sm font-medium ${t.text}`}>{r.value || "—"}</span>
                </div>
              ))}
            </div>
          )}

          {tab === "maintenance" && (
            <div>
              <div className={`border-t-2 border-t-amber-600 border ${t.card} rounded-xl p-4 mb-5`}>
                <p className={`text-xs font-semibold uppercase tracking-wider ${t.subtle} mb-3`}>Add service record</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input type="date" value={newLog.date} onChange={e => setNewLog(q => ({ ...q, date: e.target.value }))} className={inputCls} />
                  <input placeholder="Shop / technician" value={newLog.shop} onChange={e => setNewLog(q => ({ ...q, shop: e.target.value }))} className={inputCls} />
                  <input placeholder="Description" value={newLog.description} onChange={e => setNewLog(q => ({ ...q, description: e.target.value }))} className={`${inputCls} col-span-2`} />
                  <input type="number" placeholder="Cost ($)" value={newLog.cost} onChange={e => setNewLog(q => ({ ...q, cost: e.target.value }))} className={inputCls} />
                  <label className={`flex items-center gap-2 cursor-pointer border border-dashed ${dark ? "border-stone-700 hover:border-amber-600" : "border-stone-300 hover:border-amber-500"} rounded-md px-3 py-2 transition-colors`}>
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogPhoto} />
                    {newLog.photo ? (
                      <div className="flex items-center gap-2 w-full">
                        <img src={newLog.photo.url} alt="" className="w-8 h-8 object-cover rounded border border-stone-700" />
                        <span className={`text-xs ${t.muted} truncate`}>{newLog.photo.name}</span>
                        <button type="button" onClick={e => { e.preventDefault(); setNewLog(q => ({ ...q, photo: null })); }} className={`ml-auto ${t.muted} hover:text-red-400 text-lg leading-none`}>×</button>
                      </div>
                    ) : <span className={`text-xs ${t.muted}`}>📎 Attach photo</span>}
                  </label>
                </div>
                <button onClick={addLog} className="bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-sm px-4 py-2 rounded-md transition-colors">Add Record</button>
              </div>
              {(car.maintenance_log || []).length === 0
                ? <p className={`text-sm text-center py-8 ${t.muted}`}>No service records yet.</p>
                : (car.maintenance_log || []).map(m => (
                  <div key={m.id} className={`py-3 border-b ${t.divider}`}>
                    <div className="flex justify-between items-center">
                      <div>
                        <p className={`text-sm font-medium mb-0.5 ${t.text}`}>{m.description}</p>
                        <p className={`text-xs ${t.muted}`}>{fmtDate(m.date)}{m.shop ? " · " + m.shop : ""}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-semibold ${t.subtle}`}>{fmt(m.cost)}</span>
                        <button onClick={() => removeLog(m.id)} className={`${t.muted} hover:text-red-400 text-xl leading-none transition-colors`}>×</button>
                      </div>
                    </div>
                    {m.photo && <img src={m.photo.url} alt="receipt" className="mt-2 w-20 h-14 object-cover rounded-lg border border-stone-700 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => window.open(m.photo.url, "_blank")} />}
                  </div>
                ))
              }
            </div>
          )}
        </div>
      )}

      {/* ── FORM VIEW ── */}
      {view === "form" && form && (
        <div className="max-w-2xl mx-auto px-4 py-6">
          <button onClick={() => setView(isEditing ? "detail" : "list")} className={`text-sm ${t.muted} mb-6 block`}>← Back</button>
          <h2 className="text-xl font-semibold tracking-tight mb-6">{isEditing ? "Edit vehicle" : "Add vehicle"}</h2>

          <FormSection title="Vehicle Identity" t={t}>
            <div className="grid grid-cols-2 gap-3 mb-3 sm:grid-cols-3">
              <Field label="Year *" t={t}><input type="number" value={form.year} onChange={e => setF("year", e.target.value)} placeholder="1967" className={inputCls} /></Field>
              <Field label="Make *" t={t}><input value={form.make} onChange={e => setF("make", e.target.value)} placeholder="Ferrari" className={inputCls} /></Field>
              <Field label="Model *" t={t}><input value={form.model} onChange={e => setF("model", e.target.value)} placeholder="Daytona" className={inputCls} /></Field>
              <Field label="Color" t={t}><input value={form.color} onChange={e => setF("color", e.target.value)} className={inputCls} /></Field>
              <Field label="VIN / Serial" t={t}><input value={form.vin} onChange={e => setF("vin", e.target.value)} className={inputCls} /></Field>
              <Field label="Mileage" t={t}><input type="number" value={form.mileage} onChange={e => setF("mileage", e.target.value)} className={inputCls} /></Field>
              <Field label="Condition" t={t}>
                <select value={form.condition} onChange={e => setF("condition", e.target.value)} className={inputCls}>
                  {CONDITIONS.map(c => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Storage Location" t={t} span={2}><input value={form.location} onChange={e => setF("location", e.target.value)} className={inputCls} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <Field label="Last Driven / Started" t={t}>
                <div className="flex gap-2">
                  <input type="date" value={form.last_driven} onChange={e => setF("last_driven", e.target.value)} className={inputCls} />
                  <button type="button" onClick={() => setF("last_driven", todayStr())}
                    className={`shrink-0 ${dark ? "bg-stone-700 hover:bg-stone-600 text-stone-200" : "bg-stone-200 hover:bg-stone-300 text-stone-700"} text-xs font-medium px-3 rounded-md transition-colors whitespace-nowrap`}>
                    Today
                  </button>
                </div>
              </Field>
              <Field label="Next Service Due" t={t}><input type="date" value={form.next_service_date} onChange={e => setF("next_service_date", e.target.value)} className={inputCls} /></Field>
            </div>
            <Field label="Notes" t={t}><textarea value={form.notes} onChange={e => setF("notes", e.target.value)} placeholder="Provenance, history, notable details…" className={`${inputCls} min-h-20 resize-y`} /></Field>
          </FormSection>

          <FormSection title="Financials" t={t}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Purchase Price ($)" t={t}><input type="number" value={form.purchase_price} onChange={e => setF("purchase_price", e.target.value)} className={inputCls} /></Field>
              <Field label="Current Value ($)" t={t}><input type="number" value={form.current_value} onChange={e => setF("current_value", e.target.value)} className={inputCls} /></Field>
              <Field label="Purchase Date" t={t}><input type="date" value={form.purchase_date} onChange={e => setF("purchase_date", e.target.value)} className={inputCls} /></Field>
            </div>
          </FormSection>

          <FormSection title="Insurance & Registration" t={t}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Provider" t={t}><input value={form.insurance} onChange={e => setF("insurance", e.target.value)} className={inputCls} /></Field>
              <Field label="Policy Number" t={t}><input value={form.policy_number} onChange={e => setF("policy_number", e.target.value)} className={inputCls} /></Field>
              <Field label="Registration Expiry" t={t}><input type="date" value={form.registration_expiry} onChange={e => setF("registration_expiry", e.target.value)} className={inputCls} /></Field>
            </div>
          </FormSection>

          <div className="flex gap-3">
            <button onClick={saveCar} disabled={saving} className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-stone-950 font-semibold text-sm px-5 py-2 rounded-md transition-colors">
              {saving ? "Saving…" : "Save Vehicle"}
            </button>
            <button onClick={() => setView(isEditing ? "detail" : "list")} className={`border ${t.border} ${t.muted} text-sm px-4 py-2 rounded-md`}>Cancel</button>
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <div className={`fixed bottom-0 left-0 right-0 border-t ${t.border} ${dark ? "bg-stone-950/95" : "bg-stone-50/95"} backdrop-blur-sm flex`}>
        {[
          { label: "Garage", icon: "🚗", action: () => setView("list") },
          { label: "Add Car", icon: "+", action: openAdd },
          { label: "Sign Out", icon: "👤", action: signOut },
        ].map(item => (
          <button key={item.label} onClick={item.action}
            className={`flex-1 flex flex-col items-center py-3 gap-0.5 transition-colors ${t.muted}`}>
            <span className="text-lg leading-none">{item.icon}</span>
            <span className="text-xs">{item.label}</span>
          </button>
        ))}
      </div>

      {/* Delete modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className={`border ${t.card} rounded-xl p-6 w-full max-w-sm shadow-2xl`}>
            <h3 className={`text-base font-semibold mb-2 ${t.text}`}>Delete vehicle?</h3>
            <p className={`text-sm ${t.muted} mb-6`}>{car?.year} {car?.make} {car?.model} will be permanently removed.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setDeleteModal(false)} className={`border ${t.border} ${t.muted} text-sm px-4 py-2 rounded-md`}>Cancel</button>
              <button onClick={deleteCar} className="bg-red-800 hover:bg-red-700 text-red-100 text-sm font-medium px-4 py-2 rounded-md transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FormSection({ title, children, t }) {
  return (
    <div className="mb-7">
      <p className={`text-xs font-semibold tracking-widest uppercase text-amber-600 mb-4 pb-3 border-b ${t.border}`}>{title}</p>
      {children}
    </div>
  );
}

function Field({ label, children, t, span }) {
  return (
    <div className={span === 2 ? "col-span-2" : ""}>
      <label className={`block text-xs ${t.muted} mb-1`}>{label}</label>
      {children}
    </div>
  );
}