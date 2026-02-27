import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";

const CONDITIONS = ["Concours", "Excellent", "Good", "Fair", "Project"];
const OIL_TYPES = ["Full Synthetic", "Synthetic Blend", "High Mileage", "Conventional", "Racing Oil", "Other"];
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
  last_oil_change_date: "", last_oil_change_mileage: "", oil_type: "Full Synthetic",
  oil_interval_miles: "3000", oil_interval_months: "6", oil_change_log: [],
  insurance_photo: null, mileage_log: [],
});

function daysUntil(dateStr) {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr + "T12:00:00") - new Date()) / 86400000);
}
function daysUntilReg(mmyyyy) {
  if (!mmyyyy || !mmyyyy.includes("/")) return null;
  const [mm, yyyy] = mmyyyy.split("/");
  if (!mm || !yyyy) return null;
  // last day of the month
  const expiry = new Date(parseInt(yyyy), parseInt(mm), 0); // day 0 = last day of prev month
  return Math.ceil((expiry - new Date()) / 86400000);
}
function fmtReg(mmyyyy) {
  if (!mmyyyy || !mmyyyy.includes("/")) return "—";
  const [mm, yyyy] = mmyyyy.split("/");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(mm) - 1]} ${yyyy}`;
}
function daysUntilOilByDate(last, months) {
  if (!last || !months) return null;
  const d = new Date(last + "T12:00:00");
  d.setMonth(d.getMonth() + parseInt(months));
  return Math.ceil((d - new Date()) / 86400000);
}
function milesUntilOil(lastMi, curMi, intMi) {
  if (!lastMi || !curMi || !intMi) return null;
  return parseInt(intMi) - (parseInt(curMi) - parseInt(lastMi));
}

function WarningBadge({ days, label, dark }) {
  if (days === null) return null;
  if (days < 0) return <span className={`text-xs rounded px-2 py-0.5 border ${dark ? "bg-red-900/60 text-red-300 border-red-700/50" : "bg-red-100 text-red-700 border-red-300"}`}>{label} overdue</span>;
  if (days <= 30) return <span className={`text-xs rounded px-2 py-0.5 border ${dark ? "bg-amber-900/60 text-amber-300 border-amber-700/50" : "bg-amber-100 text-amber-700 border-amber-300"}`}>{label} in {days}d</span>;
  return null;
}

function OilWarningBadge({ car, dark }) {
  const dL = daysUntilOilByDate(car.last_oil_change_date, car.oil_interval_months);
  const mL = milesUntilOil(car.last_oil_change_mileage, car.mileage, car.oil_interval_miles);
  if (!car.last_oil_change_date && !car.last_oil_change_mileage) return null;
  const over = (dL !== null && dL < 0) || (mL !== null && mL < 0);
  const warn = !over && ((dL !== null && dL <= 14) || (mL !== null && mL <= 500));
  if (!over && !warn) return null;
  return <span className={`text-xs rounded px-2 py-0.5 border ${over ? (dark ? "bg-red-900/60 text-red-300 border-red-700/50" : "bg-red-100 text-red-700 border-red-300") : (dark ? "bg-amber-900/60 text-amber-300 border-amber-700/50" : "bg-amber-100 text-amber-700 border-amber-300")}`}>Oil {over ? "overdue" : "due soon"}</span>;
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
      a.href = url; a.download = photo.name || "photo"; a.click();
      URL.revokeObjectURL(url);
    } catch { window.open(photo.url, "_blank"); }
  }
  return (
    <div className="fixed inset-0 bg-black/95 flex flex-col items-center justify-center z-[60]" onClick={onClose}>
      <div className="absolute top-0 left-0 right-0 flex justify-between items-center px-4 py-3" onClick={e => e.stopPropagation()}>
        <p className="text-sm text-stone-400 truncate max-w-xs">{photo.name} <span className="text-stone-600">({idx + 1} / {photos.length})</span></p>
        <div className="flex gap-2">
          <button onClick={download} className="text-xs bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold px-3 py-1.5 rounded-md">⬇ Download</button>
          <button onClick={onClose} className="text-xs bg-stone-800 hover:bg-stone-700 text-stone-200 px-3 py-1.5 rounded-md">✕ Close</button>
        </div>
      </div>
      {photos.length > 1 && <button onClick={prev} className="absolute left-3 top-1/2 -translate-y-1/2 bg-stone-800/80 hover:bg-stone-700 text-white w-10 h-10 rounded-full flex items-center justify-center text-xl z-10">‹</button>}
      <img src={photo.url} alt={photo.name} className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
      {photos.length > 1 && <button onClick={next} className="absolute right-3 top-1/2 -translate-y-1/2 bg-stone-800/80 hover:bg-stone-700 text-white w-10 h-10 rounded-full flex items-center justify-center text-xl z-10">›</button>}
      {photos.length > 1 && (
        <div className="absolute bottom-6 flex gap-2" onClick={e => e.stopPropagation()}>
          {photos.map((_, i) => <button key={i} onClick={() => setIdx(i)} className={`w-2 h-2 rounded-full ${i === idx ? "bg-amber-500" : "bg-stone-600 hover:bg-stone-400"}`} />)}
        </div>
      )}
    </div>
  );
}

function ConfirmModal({ msg, onOk, onCancel, t }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[80] px-4">
      <div className={`border ${t.card} rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-sm shadow-2xl`}>
        <p className={`text-sm ${t.text} mb-5`}>{msg}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className={`border ${t.border} ${t.muted} text-sm px-4 py-2 rounded-md`}>Cancel</button>
          <button onClick={onOk} className="bg-red-800 hover:bg-red-700 text-red-100 text-sm font-medium px-4 py-2 rounded-md">Delete</button>
        </div>
      </div>
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
    <div style={{ minWidth: 0, ...(span === 2 ? { gridColumn: "span 2" } : {}) }}>
      <label className={`block text-xs ${t.muted} mb-1`}>{label}</label>
      <div style={{ width: "100%", boxSizing: "border-box" }}>{children}</div>
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
  const [sharecopied, setShareCopied] = useState(false);
  const [garageMembers, setGarageMembers] = useState([]);

  const [cars, setCars] = useState([]);
  const [carsLoading, setCarsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("make");
  const [sortDir, setSortDir] = useState("asc");
  const [view, setView] = useState("dashboard");
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("details");
  const [form, setForm] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [viewingPhotoIndex, setViewingPhotoIndex] = useState(null);
  const [viewingInsurancePhoto, setViewingInsurancePhoto] = useState(false);
  const [newLog, setNewLog] = useState({ date: "", description: "", cost: "", shop: "", notes: "", photo: null });
  const [maintDetail, setMaintDetail] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [toast, setToast] = useState(null);

  // Oil state
  const [showOilModal, setShowOilModal] = useState(false);
  const [showOilSettings, setShowOilSettings] = useState(false);
  const [oilDoneForm, setOilDoneForm] = useState({ date: todayStr(), mileage: "", oil_type: "Full Synthetic", notes: "" });
  const [oilSettingsForm, setOilSettingsForm] = useState({ interval_miles: "3000", interval_months: "6" });

  // Driven today state
  const [showDrivenModal, setShowDrivenModal] = useState(false);
  const [drivenMileageInput, setDrivenMileageInput] = useState("");
  const [justLoggedDriven, setJustLoggedDriven] = useState(false);

  // Settings state
  const [editingGarageName, setEditingGarageName] = useState(false);
  const [garageNameEdit, setGarageNameEdit] = useState("");
  const [defaultSort, setDefaultSort] = useState("make");

  const insRef = useRef();

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
  const inputCls = `min-w-0 border rounded-md px-3 py-2.5 text-base focus:outline-none font-sans ${t.input}`;
  const inputStyle = { width: "100%", boxSizing: "border-box" };

  function showToast(msg) { setToast(msg); setTimeout(() => setToast(null), 2500); }
  function askConfirm(msg, fn) { setConfirmModal({ msg, fn }); }

  // ── AUTH ──
  useEffect(() => {
    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        setSession(data.session);
      } catch (e) { console.error(e); }
      finally { setAuthLoading(false); }
    };
    init();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session));
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

  async function updateGarageName(name) {
    const { error } = await supabase.from("garages").update({ name }).eq("id", garage.id);
    if (!error) { setGarage(g => ({ ...g, name })); showToast("Garage name updated"); }
    else alert("Error: " + error.message);
  }

  async function loadGarageMembers() {
    const { data } = await supabase
      .from("garage_members")
      .select("user_id, role, profiles(full_name, email)")
      .eq("garage_id", garage.id);
    if (data) setGarageMembers(data);
  }

  useEffect(() => { if (garage) fetchCars(); }, [garage]);
  useEffect(() => { if (view === "settings" && garage) loadGarageMembers(); }, [view]);

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
    setCars([]); setGarage(null); setView("dashboard");
  }

  // ── CARS ──
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
        oil_interval_miles: parseInt(form.oil_interval_miles) || 3000,
        oil_interval_months: parseInt(form.oil_interval_months) || 6,
        last_oil_change_mileage: parseInt(form.last_oil_change_mileage) || null,
        last_oil_change_date: form.last_oil_change_date || null,
      };
      if (isEditing) {
        const { error } = await supabase.from("cars").update(payload).eq("id", form.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("cars").insert([payload]);
        if (error) throw error;
      }
      await fetchCars();
      showToast(isEditing ? "Vehicle updated" : "Vehicle added");
      setView(isEditing ? "detail" : "list");
    } catch (err) { alert("Error saving: " + err.message); }
    finally { setSaving(false); }
  }

  async function deleteCar() {
    const { error } = await supabase.from("cars").delete().eq("id", selectedId);
    if (!error) { await fetchCars(); setConfirmModal(null); setView("list"); showToast("Vehicle deleted"); }
  }

  async function updateCar(id, updates) {
    const { error } = await supabase.from("cars").update(updates).eq("id", id);
    if (!error) setCars(p => p.map(c => c.id === id ? { ...c, ...updates } : c));
    return error;
  }

  // ── PHOTOS ──
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
      showToast("Photo uploaded");
    } catch (err) { alert("Upload failed: " + err.message); }
    finally { setUploadingPhoto(false); }
  }

  async function removePhoto(idx) {
    const photo = car.photos[idx];
    if (photo.path) await supabase.storage.from("car-photos").remove([photo.path]);
    await updateCar(selectedId, { photos: car.photos.filter((_, i) => i !== idx) });
    showToast("Photo removed");
  }

  // ── INSURANCE PHOTO ──
  function handleInsurancePhotoUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      await updateCar(selectedId, { insurance_photo: { url: reader.result, name: file.name } });
      showToast("Document uploaded");
    };
    reader.readAsDataURL(file);
  }

  // ── MAINTENANCE ──
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
    setNewLog({ date: "", description: "", cost: "", shop: "", notes: "", photo: null });
    showToast("Record added");
  }

  async function removeLog(logId) {
    setMaintDetail(null);
    setTimeout(() => {
      askConfirm("Delete this service record?", async () => {
        await updateCar(selectedId, { maintenance_log: car.maintenance_log.filter(m => m.id !== logId) });
        setConfirmModal(null);
        showToast("Record deleted");
      });
    }, 100);
  }

  async function saveReceipt(logId, receipt) {
    const updated = car.maintenance_log.map(m => m.id === logId ? { ...m, receipt } : m);
    await updateCar(selectedId, { maintenance_log: updated });
    setMaintDetail(p => ({ ...p, receipt }));
    showToast("Receipt uploaded");
  }

  // ── OIL ──
  async function markOilDone() {
    if (!oilDoneForm.date) return;
    const entry = { id: Date.now().toString(), ...oilDoneForm, mileage: parseInt(oilDoneForm.mileage) || null };
    const log = [entry, ...(car.oil_change_log || [])];
    const updates = {
      oil_change_log: log,
      last_oil_change_date: oilDoneForm.date,
      last_oil_change_mileage: entry.mileage,
      oil_type: oilDoneForm.oil_type,
    };
    if (entry.mileage && entry.mileage > (car.mileage || 0)) updates.mileage = entry.mileage;
    await updateCar(selectedId, updates);
    setShowOilModal(false);
    showToast("Oil change logged ✓");
  }

  async function saveOilSettings() {
    await updateCar(selectedId, {
      oil_interval_miles: parseInt(oilSettingsForm.interval_miles) || 3000,
      oil_interval_months: parseInt(oilSettingsForm.interval_months) || 6,
    });
    setShowOilSettings(false);
    showToast("Intervals updated");
  }

  async function deleteOilLog(id) {
    askConfirm("Delete this oil change record?", async () => {
      const log = car.oil_change_log.filter(o => o.id !== id);
      await updateCar(selectedId, {
        oil_change_log: log,
        last_oil_change_date: log[0]?.date || null,
        last_oil_change_mileage: log[0]?.mileage || null,
      });
      setConfirmModal(null);
      showToast("Record deleted");
    });
  }

  // ── DRIVEN TODAY ──
  function openDrivenToday() {
    setDrivenMileageInput("");
    setShowDrivenModal(true);
  }

  async function saveDrivenToday(skipMileage) {
    const today = todayStr();
    const newMileage = parseInt(drivenMileageInput) || null;
    const updates = { last_driven: today };
    const entry = { date: today, mileage: newMileage || car.mileage };
    updates.mileage_log = [entry, ...(car.mileage_log || [])];
    if (!skipMileage && newMileage && newMileage > (car.mileage || 0)) updates.mileage = newMileage;
    await updateCar(selectedId, updates);
    setShowDrivenModal(false);
    setJustLoggedDriven(true);
    setTimeout(() => setJustLoggedDriven(false), 3000);
    showToast("Logged ✓");
  }

  // ── MILEAGE PREDICTION ──
  function calcAvgMonthlyMiles(log) {
    if (!log || log.length < 2) return null;
    const sorted = [...log].sort((a, b) => new Date(a.date) - new Date(b.date));
    const first = sorted[0], last = sorted[sorted.length - 1];
    const months = (new Date(last.date) - new Date(first.date)) / (1000 * 60 * 60 * 24 * 30.44);
    // if entries span less than 0.5 months, estimate based on mileage spread assuming 1 month
    if (months < 0.5) {
      const spread = last.mileage - first.mileage;
      return spread > 0 ? spread : null;
    }
    return (last.mileage - first.mileage) / months;
  }

  function predictNextOil(c) {
    const avg = calcAvgMonthlyMiles(c.mileage_log);
    if (!avg || !c.last_oil_change_mileage || !c.oil_interval_miles) return null;
    const milesRemaining = c.oil_interval_miles - ((c.mileage || 0) - c.last_oil_change_mileage);
    const monthsRemaining = milesRemaining / avg;
    const d = new Date();
    d.setDate(d.getDate() + monthsRemaining * 30.44);
    return { date: d, months: monthsRemaining, milesRemaining };
  }

  // ── DERIVED ──
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

  const allAlerts = cars.flatMap(c => {
    const rd = daysUntilReg(c.registration_expiry), sd = daysUntil(c.next_service_date);
    const dL = daysUntilOilByDate(c.last_oil_change_date, c.oil_interval_months);
    const mL = milesUntilOil(c.last_oil_change_mileage, c.mileage, c.oil_interval_miles);
    const n = `${c.year} ${c.make} ${c.model}`;
    const alerts = [];
    if (rd !== null && rd <= 60) alerts.push({ id: c.id + "-r", carId: c.id, name: n, err: rd < 0, msg: rd < 0 ? `Registration expired ${Math.abs(rd)}d ago` : `Registration expires in ${rd}d` });
    if (sd !== null && sd <= 30) alerts.push({ id: c.id + "-s", carId: c.id, name: n, err: sd < 0, msg: sd < 0 ? `Service overdue ${Math.abs(sd)}d` : `Service due in ${sd}d` });
    if (dL !== null && dL <= 14) alerts.push({ id: c.id + "-od", carId: c.id, name: n, err: dL < 0, msg: dL < 0 ? `Oil overdue ${Math.abs(dL)}d` : `Oil due in ${dL}d` });
    if (mL !== null && mL <= 500) alerts.push({ id: c.id + "-om", carId: c.id, name: n, err: mL < 0, msg: mL < 0 ? `Oil overdue ${Math.abs(mL).toLocaleString()} mi` : `Oil due in ${mL.toLocaleString()} mi` });
    return alerts;
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
  function classicUrl(c) { return `https://www.classic.com/search/?q=${encodeURIComponent(`${c.year} ${c.make} ${c.model}`)}`; }

  // ── LOADING / AUTH / SETUP screens (unchanged) ──
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
          <button onClick={() => setDark(d => !d)} className={`text-xs px-3 py-1.5 rounded-md border ${t.border} ${t.muted}`}>{dark ? "☀️ Light" : "🌙 Dark"}</button>
        </div>
        <div className={`border ${t.card} rounded-xl p-6`}>
          {authView === "login" && (
            <>
              <button onClick={signInWithGoogle} disabled={authBusy}
                className="w-full flex items-center justify-center gap-3 bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 font-medium text-sm px-4 py-2.5 rounded-md mb-4 disabled:opacity-50">
                <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" /><path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" /><path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" /><path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" /></svg>
                Continue with Google
              </button>
              <div className="flex items-center gap-3 mb-4">
                <div className={`flex-1 h-px border-t ${t.border}`} />
                <span className={`text-xs ${t.muted}`}>or</span>
                <div className={`flex-1 h-px border-t ${t.border}`} />
              </div>
              <button onClick={() => setAuthView("magic")} className="w-full text-sm text-amber-600 hover:text-amber-500">Sign in with email link instead</button>
              {authError && <p className="text-red-400 text-xs mt-3 text-center">{authError}</p>}
            </>
          )}
          {authView === "magic" && (
            <>
              <p className={`text-sm ${t.subtle} mb-4`}>We'll send a login link to your email — no password needed.</p>
              <input type="email" placeholder="your@email.com" value={authEmail} onChange={e => setAuthEmail(e.target.value)} className={`${inputCls} mb-3`} />
              {authMsg
                ? <p className="text-green-400 text-sm text-center">{authMsg}</p>
                : <button onClick={sendMagicLink} disabled={authBusy} className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-stone-950 font-semibold text-sm px-4 py-2 rounded-md mb-3">{authBusy ? "Sending…" : "Send login link"}</button>
              }
              <button onClick={() => { setAuthView("login"); setAuthMsg(""); setAuthError(""); }} className={`w-full text-sm ${t.muted} mt-1`}>← Back</button>
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
          <button onClick={createGarage} className="w-full bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-sm px-4 py-2 rounded-md">Create Garage</button>
        </div>
        <div className={`border ${t.card} rounded-xl p-6`}>
          <h2 className="text-base font-semibold mb-1">Join an existing garage</h2>
          <p className={`text-sm ${t.muted} mb-4`}>Enter the share code from someone who already has a garage.</p>
          <input value={joinCode} onChange={e => setJoinCode(e.target.value)} placeholder="Paste share code here…" className={`${inputCls} mb-3`} />
          {joinError && <p className="text-red-400 text-xs mb-2">{joinError}</p>}
          <button onClick={joinGarage} className={`w-full border ${t.border} ${t.subtle} text-sm px-4 py-2 rounded-md hover:border-amber-600 hover:text-amber-600`}>Join Garage</button>
        </div>
      </div>
    </div>
  );

  // ── MAIN APP ──
  const oilDL = car ? daysUntilOilByDate(car.last_oil_change_date, car.oil_interval_months) : null;
  const oilML = car ? milesUntilOil(car.last_oil_change_mileage, car.mileage, car.oil_interval_miles) : null;
  const oilOver = (oilDL !== null && oilDL < 0) || (oilML !== null && oilML < 0);
  const oilWarn = !oilOver && ((oilDL !== null && oilDL <= 14) || (oilML !== null && oilML <= 500));

  return (
    <div className={`min-h-screen ${t.bg} ${t.text} font-sans`} style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}>

      {/* Toast */}
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] bg-amber-600 text-stone-950 text-sm font-semibold px-4 py-2 rounded-full shadow-lg pointer-events-none">{toast}</div>}

      {/* Confirm modal */}
      {confirmModal && <ConfirmModal msg={confirmModal.msg} onOk={confirmModal.fn} onCancel={() => setConfirmModal(null)} t={t} />}

      {/* Photo viewer */}
      {viewingPhotoIndex !== null && car?.photos?.length > 0 && (
        <PhotoViewer photos={car.photos} startIndex={viewingPhotoIndex} onClose={() => setViewingPhotoIndex(null)} dark={dark} />
      )}

      {/* Insurance photo viewer */}
      {viewingInsurancePhoto && car?.insurance_photo && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[60]" onClick={() => setViewingInsurancePhoto(false)}>
          <div className="absolute top-3 right-4"><button className="text-xs bg-stone-800 text-stone-200 px-3 py-1.5 rounded-md" onClick={() => setViewingInsurancePhoto(false)}>✕ Close</button></div>
          <img src={car.insurance_photo.url} alt="insurance" className="max-w-full max-h-[88vh] object-contain rounded-lg" onClick={e => e.stopPropagation()} />
        </div>
      )}

      {/* Maintenance detail modal */}
      {maintDetail && car && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-4 pb-4">
          <div className={`border ${t.card} rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto`}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className={`text-base font-semibold ${t.text}`}>{maintDetail.description}</p>
                <p className={`text-xs ${t.muted} mt-0.5`}>{fmtDate(maintDetail.date)}{maintDetail.shop ? " · " + maintDetail.shop : ""}</p>
              </div>
              <button onClick={() => setMaintDetail(null)} className={`${t.muted} text-xl ml-3 w-10 h-10 flex items-center justify-center rounded-lg`}>×</button>
            </div>
            <div className={`border-t ${t.border} pt-4 mb-4`}>
              <div className="flex justify-between mb-3"><span className={`text-sm ${t.muted}`}>Cost</span><span className={`text-sm font-semibold ${t.text}`}>{fmt(maintDetail.cost)}</span></div>
              {maintDetail.notes ? <div className={`p-3 rounded-lg ${dark ? "bg-stone-800" : "bg-stone-100"}`}><p className={`text-xs tracking-widest uppercase ${t.muted} mb-1`}>Notes</p><p className={`text-sm ${t.subtle} leading-relaxed`}>{maintDetail.notes}</p></div> : <p className={`text-sm ${t.muted} italic`}>No notes.</p>}
            </div>
            <div className={`border-t ${t.border} pt-4 mb-5`}>
              <p className={`text-xs tracking-widest uppercase ${t.muted} mb-3`}>Receipt</p>
              {maintDetail.receipt
                ? <div><img src={maintDetail.receipt.url} alt="" className="w-full h-40 object-cover rounded-lg border border-stone-700 cursor-pointer" onClick={() => window.open(maintDetail.receipt.url, "_blank")} /><p className={`text-xs ${t.muted} mt-1`}>{maintDetail.receipt.name}</p></div>
                : <label className={`flex items-center justify-center w-full border-2 border-dashed ${dark ? "border-stone-700 hover:border-amber-600" : "border-stone-300 hover:border-amber-500"} rounded-xl p-5 cursor-pointer`}>
                    <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files[0]; if (f) { const r = new FileReader(); r.onload = () => saveReceipt(maintDetail.id, { url: r.result, name: f.name }); r.readAsDataURL(f); } }} />
                    <p className={`text-sm ${t.muted}`}>📎 Upload receipt</p>
                  </label>
              }
            </div>
            <div className="flex gap-3">
              <button onClick={() => setMaintDetail(null)} className="flex-1 bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-sm px-4 py-2 rounded-md">Done</button>
              <button onClick={() => removeLog(maintDetail.id)} className={`border ${t.border} text-red-400 text-sm px-4 py-2 rounded-md`}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Driven today modal */}
      {showDrivenModal && car && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-4 pb-4">
          <div className={`border ${t.card} rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-sm shadow-2xl`}>
            <h3 className={`text-base font-semibold mb-1 ${t.text}`}>Driven today</h3>
            <p className={`text-sm ${t.muted} mb-4`}>{car.year} {car.make} {car.model}</p>
            <div>
              <label className={`block text-xs ${t.muted} mb-1`}>Current mileage <span className="opacity-60">(optional)</span></label>
              <input type="number" placeholder={`Last: ${(car.mileage || 0).toLocaleString()} mi`} value={drivenMileageInput} onChange={e => setDrivenMileageInput(e.target.value)} className={inputCls} />
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => saveDrivenToday(false)} className="flex-1 bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-sm px-4 py-2 rounded-md">Save</button>
              <button onClick={() => saveDrivenToday(true)} className={`border ${t.border} ${t.muted} text-sm px-4 py-2 rounded-md`}>Skip</button>
              <button onClick={() => setShowDrivenModal(false)} className={`border ${t.border} ${t.muted} text-sm px-4 py-2 rounded-md`}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Oil modal */}
      {showOilModal && car && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-4 pb-4">
          <div className={`border ${t.card} rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-sm shadow-2xl`}>
            <h3 className={`text-base font-semibold mb-1 ${t.text}`}>Log Oil Change</h3>
            <p className={`text-sm ${t.muted} mb-4`}>{car.year} {car.make} {car.model}</p>
            <div className="flex flex-col gap-3">
              <div><label className={`block text-xs ${t.muted} mb-1`}>Date</label><input type="date" value={oilDoneForm.date} onChange={e => setOilDoneForm(f => ({ ...f, date: e.target.value }))} className={inputCls} /></div>
              <div><label className={`block text-xs ${t.muted} mb-1`}>Current Mileage</label><input type="number" placeholder="e.g. 52000" value={oilDoneForm.mileage} onChange={e => setOilDoneForm(f => ({ ...f, mileage: e.target.value }))} className={inputCls} /></div>
              <div><label className={`block text-xs ${t.muted} mb-1`}>Oil Type</label><select value={oilDoneForm.oil_type} onChange={e => setOilDoneForm(f => ({ ...f, oil_type: e.target.value }))} className={inputCls}>{OIL_TYPES.map(o => <option key={o}>{o}</option>)}</select></div>
              <div><label className={`block text-xs ${t.muted} mb-1`}>Notes (optional)</label><input placeholder="e.g. Castrol 10W-40…" value={oilDoneForm.notes} onChange={e => setOilDoneForm(f => ({ ...f, notes: e.target.value }))} className={inputCls} /></div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={markOilDone} className="flex-1 bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-sm px-4 py-2 rounded-md">Save Oil Change</button>
              <button onClick={() => setShowOilModal(false)} className={`border ${t.border} ${t.muted} text-sm px-4 py-2 rounded-md`}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Oil settings modal */}
      {showOilSettings && car && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-4 pb-4">
          <div className={`border ${t.card} rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-sm shadow-2xl`}>
            <h3 className={`text-base font-semibold mb-4 ${t.text}`}>Oil Change Intervals</h3>
            <div className="flex flex-col gap-3">
              <div><label className={`block text-xs ${t.muted} mb-1`}>Miles between changes</label><input type="number" value={oilSettingsForm.interval_miles} onChange={e => setOilSettingsForm(s => ({ ...s, interval_miles: e.target.value }))} className={inputCls} /></div>
              <div><label className={`block text-xs ${t.muted} mb-1`}>Months between changes</label><input type="number" value={oilSettingsForm.interval_months} onChange={e => setOilSettingsForm(s => ({ ...s, interval_months: e.target.value }))} className={inputCls} /></div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={saveOilSettings} className="flex-1 bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-sm px-4 py-2 rounded-md">Save</button>
              <button onClick={() => setShowOilSettings(false)} className={`border ${t.border} ${t.muted} text-sm px-4 py-2 rounded-md`}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Share modal */}
      {showShare && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 px-4 pb-4">
          <div className={`border ${t.card} rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-sm shadow-2xl`}>
            <h3 className={`text-base font-semibold mb-2 ${t.text}`}>Share your garage</h3>
            <p className={`text-sm ${t.muted} mb-4`}>Send this code to anyone you want to invite.</p>
            <div className={`border ${t.border} rounded-lg p-3 mb-4 font-mono text-sm break-all ${t.text} ${dark ? "bg-stone-800" : "bg-stone-100"}`}>{garage.id}</div>
            <div className="flex gap-3">
              <button onClick={() => { navigator.clipboard.writeText(garage.id); setShareCopied(true); setTimeout(() => setShareCopied(false), 2000); }}
                className={`flex-1 ${sharecopied ? "bg-green-600" : "bg-amber-600 hover:bg-amber-500"} text-stone-950 font-semibold text-sm px-4 py-2 rounded-md`}>
                {sharecopied ? "✓ Copied!" : "Copy Code"}
              </button>
              <button onClick={() => setShowShare(false)} className={`border ${t.border} ${t.muted} text-sm px-4 py-2 rounded-md`}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <div className={`sticky top-0 z-40 border-b ${t.border} ${dark ? "bg-stone-950/90" : "bg-stone-50/90"} backdrop-blur-sm px-4 py-3 flex justify-between items-center`} style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}>
        <span className="text-sm font-semibold tracking-tight">{garage?.name || "The Collection"}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowShare(true)} className={`text-xs px-2.5 py-1.5 rounded-md border ${t.border} ${t.muted}`}>Share 🔗</button>
          <button onClick={() => setDark(d => !d)} className={`text-xs px-2.5 py-1.5 rounded-md border ${t.border} ${t.muted}`}>{dark ? "☀️" : "🌙"}</button>
        </div>
      </div>

      {/* ── DASHBOARD ── */}
      {view === "dashboard" && (
        <div className="px-4 py-6">
          <h1 className="text-2xl font-semibold tracking-tight mb-6">Dashboard</h1>

          <div className={`border-t-2 border-t-amber-600 border ${t.card} rounded-xl p-5 mb-5`}>
            <p className={`text-xs tracking-widest uppercase ${t.muted} mb-4`}>Portfolio</p>
            <div className="grid grid-cols-2 gap-4">
              {[
                { l: "Total Value", v: fmt(totalValue) },
                { l: "Invested", v: fmt(totalPaid) },
                { l: "Gain / Loss", v: fmt(totalValue - totalPaid), c: (totalValue - totalPaid) >= 0 ? "text-green-500" : "text-red-400" },
                { l: "Vehicles", v: String(cars.length) },
              ].map(s => (
                <div key={s.l}><p className={`text-xs ${t.muted} mb-0.5`}>{s.l}</p><p className={`text-xl font-semibold ${s.c || t.text}`}>{s.v}</p></div>
              ))}
            </div>
          </div>

          {carsLoading ? <p className={`text-center py-8 ${t.muted}`}>Loading…</p> : allAlerts.length === 0
            ? <div className={`border ${t.card} rounded-xl p-5 mb-5 flex items-center gap-3`}>
                <span className="text-2xl">✓</span>
                <div><p className="text-sm font-semibold text-green-500">All clear</p><p className={`text-xs ${t.muted}`}>No upcoming maintenance or registration alerts.</p></div>
              </div>
            : <div className="mb-5">
                <p className={`text-xs font-semibold tracking-widest uppercase ${t.muted} mb-3`}>Alerts ({allAlerts.length})</p>
                <div className="flex flex-col gap-2">
                  {allAlerts.map(a => (
                    <button key={a.id} onClick={() => openCar(a.carId)}
                      className={`flex items-start gap-3 p-3 rounded-xl border text-left w-full ${a.err ? (dark ? "bg-red-900/20 border-red-800/50" : "bg-red-50 border-red-200") : (dark ? "bg-amber-900/20 border-amber-800/50" : "bg-amber-50 border-amber-200")}`}>
                      <span className={`text-sm mt-0.5 ${a.err ? "text-red-400" : "text-amber-400"}`}>{a.err ? "⚠" : "⏰"}</span>
                      <div className="flex-1">
                        <p className={`text-xs font-semibold ${a.err ? (dark ? "text-red-300" : "text-red-700") : (dark ? "text-amber-300" : "text-amber-700")}`}>{a.name}</p>
                        <p className={`text-xs ${a.err ? (dark ? "text-red-400" : "text-red-600") : (dark ? "text-amber-400" : "text-amber-600")}`}>{a.msg}</p>
                      </div>
                      <span className={`${t.muted} text-sm`}>›</span>
                    </button>
                  ))}
                </div>
              </div>
          }

          {cars.length > 0 && (
            <>
              <p className={`text-xs font-semibold tracking-widest uppercase ${t.muted} mb-3`}>Fleet</p>
              <div className="flex flex-col gap-3">
                {[...cars].sort((a, b) => (+b.current_value || 0) - (+a.current_value || 0)).map(c => {
                  const gain = (+c.current_value || 0) - (+c.purchase_price || 0);
                  const hasAlert = allAlerts.some(a => a.carId === c.id);
                  return (
                    <button key={c.id} onClick={() => openCar(c.id)}
                      className={`flex justify-between items-center p-4 border ${t.card} rounded-xl ${t.hover} text-left w-full`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs text-amber-600 font-semibold">{c.year}</span>
                          <span className={`text-sm font-semibold ${t.text}`}>{c.make} {c.model}</span>
                          {hasAlert && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />}
                        </div>
                        <p className={`text-xs ${t.muted}`}>{c.condition} · {fmtMiles(c.mileage)}</p>
                      </div>
                      <div className="text-right ml-3 shrink-0">
                        <p className={`text-sm font-semibold ${t.text}`}>{fmt(c.current_value)}</p>
                        <p className={`text-xs ${gain >= 0 ? "text-green-500" : "text-red-400"}`}>{gain >= 0 ? "+" : ""}{fmt(gain)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── LIST ── */}
      {view === "list" && (
        <div className="px-4 py-6">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">My Garage</h1>
            <button onClick={openAdd} className="bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-sm px-4 py-2 rounded-md">+ Add</button>
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
                className={`text-xs px-3 py-1.5 rounded-md border font-medium ${sortBy === opt.value ? "bg-amber-600/20 border-amber-600/50 text-amber-500" : `${dark ? "bg-stone-900 border-stone-800 text-stone-500 hover:text-stone-300" : "bg-white border-stone-200 text-stone-400 hover:text-stone-600"}`}`}>
                {opt.label} {sortBy === opt.value ? (sortDir === "asc" ? "↑" : "↓") : ""}
              </button>
            ))}
          </div>
          {carsLoading ? <p className={`text-center py-16 ${t.muted}`}>Loading…</p>
            : filtered.length === 0 ? (
              <div className="text-center py-16">
                <p className={`${t.muted} mb-4`}>{search ? "No vehicles match your search." : "No vehicles yet."}</p>
                {!search && <button onClick={openAdd} className="bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-sm px-4 py-2 rounded-md">Add your first vehicle</button>}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {filtered.map(c => {
                  const gain = (+c.current_value || 0) - (+c.purchase_price || 0);
                  const rd = daysUntilReg(c.registration_expiry), sd = daysUntil(c.next_service_date);
                  return (
                    <button key={c.id} onClick={() => openCar(c.id)}
                      className={`flex justify-between items-center p-4 border ${t.card} rounded-xl ${t.hover} text-left w-full`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className="text-xs text-amber-600 font-semibold">{c.year}</span>
                          <span className="text-base font-semibold">{c.make} {c.model}</span>
                        </div>
                        <p className={`text-sm ${t.muted} mb-1`}>{c.color}{c.condition ? " · " + c.condition : ""}</p>
                        <div className="flex gap-2 flex-wrap">
                          <WarningBadge days={rd} label="Registration" dark={dark} />
                          <WarningBadge days={sd} label="Service" dark={dark} />
                          <OilWarningBadge car={c} dark={dark} />
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
            )
          }
        </div>
      )}

      {/* ── DETAIL ── */}
      {view === "detail" && car && (
        <div className="px-4 py-6">
          <div className="flex justify-between items-center mb-6">
            <button onClick={() => setView("list")} className={`text-sm ${t.muted}`}>← Back</button>
            <div className="flex gap-2">
              <button onClick={openEdit} className="border border-amber-600 text-amber-600 hover:bg-amber-600 hover:text-stone-950 text-sm px-3 py-1.5 rounded-md font-medium">Edit</button>
              <button onClick={() => askConfirm(`Delete ${car.year} ${car.make} ${car.model}?`, deleteCar)} className={`text-sm ${t.muted} hover:text-red-400 px-2 py-1.5 rounded-md`}>Delete</button>
            </div>
          </div>

          {(car.photos || []).length > 0 && (
            <div className="flex gap-3 mb-5 overflow-x-auto pb-2">
              {car.photos.map((p, i) => (
                <img key={i} src={p.url} alt={p.name} className="w-48 h-32 object-cover rounded-xl border border-stone-700 cursor-pointer hover:opacity-90 shrink-0" onClick={() => setViewingPhotoIndex(i)} />
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
              const rd = daysUntilReg(car.registration_expiry), sd = daysUntil(car.next_service_date);
              const w = [];
              if (rd !== null && rd <= 30) w.push(<WarningBadge key="r" days={rd} label="Registration" dark={dark} />);
              if (sd !== null && sd <= 30) w.push(<WarningBadge key="s" days={sd} label="Service" dark={dark} />);
              w.push(<OilWarningBadge key="oil" car={car} dark={dark} />);
              const filtered2 = w.filter(Boolean);
              return filtered2.length > 0 ? <div className="flex gap-2 flex-wrap mb-3">{filtered2}</div> : null;
            })()}
            <div className={`flex gap-4 pt-3 border-t ${t.border} flex-wrap`}>
              {car.color && <span className={`text-sm ${t.muted}`}>{car.color}</span>}
              {car.location && <span className={`text-sm ${t.muted}`}>📍 {car.location}</span>}
              {car.mileage && <span className={`text-sm ${t.muted}`}>{fmtMiles(car.mileage)}</span>}
            </div>
          </div>

          <div className={`grid grid-cols-3 gap-2 mb-5`}>
            {[
              { id: "details", label: "Details" },
              { id: "photos", label: car.photos?.length > 0 ? `Photos (${car.photos.length})` : "Photos" },
              { id: "financials", label: "Financials" },
              { id: "insurance", label: "Insurance" },
              { id: "maintenance", label: car.maintenance_log?.length > 0 ? `Service (${car.maintenance_log.length})` : "Service" },
              { id: "oil", label: "🛢 Oil" },
            ].map(tb => (
              <button key={tb.id} onClick={() => setTab(tb.id)}
                className={`py-2 px-2 rounded-lg text-xs font-semibold text-center transition-colors ${tab === tb.id ? "bg-amber-600 text-stone-950" : `${dark ? "bg-stone-800 text-stone-400" : "bg-stone-100 text-stone-500"}`}`}>
                {tb.label}
              </button>
            ))}
          </div>

          {/* Details tab */}
          {tab === "details" && (
            <div>
              {[
                { label: "Color", value: car.color },
                { label: "VIN / Serial", value: car.vin },
                { label: "Mileage", value: fmtMiles(car.mileage) },
                { label: "Storage Location", value: car.location },
                { label: "Acquired", value: fmtDate(car.purchase_date) },
                { label: "Next Service Due", value: fmtDate(car.next_service_date) },
              ].map(r => (
                <div key={r.label} className={`flex justify-between items-start py-3 border-b ${t.divider}`}>
                  <span className={`text-sm ${t.muted}`}>{r.label}</span>
                  <span className={`text-sm font-medium text-right max-w-xs ${t.text}`}>{r.value || "—"}</span>
                </div>
              ))}

              {/* Last driven row with button */}
              <div className={`flex justify-between items-center py-3 border-b ${t.divider}`}>
                <span className={`text-sm ${t.muted}`}>Last Driven / Started</span>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${justLoggedDriven ? "text-green-500" : t.text}`}>
                    {justLoggedDriven ? "Today ✓" : (() => {
                      if (!car.last_driven) return "—";
                      const d = Math.floor((new Date() - new Date(car.last_driven + "T12:00:00")) / 86400000);
                      if (d <= 0) return "Today";
                      if (d === 1) return "Yesterday";
                      return `${fmtDate(car.last_driven)} · ${d}d ago`;
                    })()}
                  </span>
                  {!justLoggedDriven && (
                    <button onClick={openDrivenToday} className={`text-xs px-2.5 py-1 rounded-md border font-semibold text-amber-600 border-amber-600/40 ${dark ? "bg-amber-600/10" : "bg-amber-50"}`}>
                      Driven today
                    </button>
                  )}
                </div>
              </div>

              {/* Mileage prediction */}
              {(() => {
                if (!car.mileage_log || car.mileage_log.length < 2) return null;
                const avg = calcAvgMonthlyMiles(car.mileage_log);
                const pred = predictNextOil(car);
                const milesUsed = (car.mileage || 0) - (car.last_oil_change_mileage || 0);
                const pct = car.oil_interval_miles ? Math.min((milesUsed / car.oil_interval_miles) * 100, 100) : null;
                return (
                  <div className={`mt-4 border ${t.card} rounded-xl p-4`}>
                    <p className={`text-xs tracking-widest uppercase ${t.muted} mb-3`}>Mileage Intelligence</p>
                    {avg && (
                      <div className="flex gap-4 mb-3">
                        <div><p className={`text-xs ${t.muted}`}>Avg / month</p><p className={`text-base font-semibold ${t.text}`}>{Math.round(avg).toLocaleString()} mi</p></div>
                        <div><p className={`text-xs ${t.muted}`}>Avg / year</p><p className={`text-base font-semibold ${t.text}`}>{Math.round(avg * 12).toLocaleString()} mi</p></div>
                      </div>
                    )}
                    {pct !== null && (
                      <div className="mb-3">
                        <div className="flex justify-between mb-1">
                          <span className={`text-xs ${t.muted}`}>Oil interval used</span>
                          <span className={`text-xs ${t.muted}`}>{Math.round(pct)}%</span>
                        </div>
                        <div className={`h-1.5 rounded-full ${dark ? "bg-stone-800" : "bg-stone-200"}`}>
                          <div className={`h-full rounded-full ${pct > 80 ? "bg-red-500" : pct > 60 ? "bg-amber-500" : "bg-green-500"}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}
                    {pred && (
                      <div className="flex gap-4">
                        <div><p className={`text-xs ${t.muted}`}>Est. oil due</p><p className={`text-sm font-semibold ${t.text}`}>{pred.date.toLocaleDateString("en-US", { month: "short", year: "numeric" })}</p></div>
                        <div><p className={`text-xs ${t.muted}`}>Miles left</p><p className={`text-sm font-semibold ${t.text}`}>{Math.max(0, Math.round(pred.milesRemaining)).toLocaleString()} mi</p></div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {car.notes && <div className={`mt-4 p-4 border ${t.card} border-l-2 border-l-amber-600/50 rounded-xl`}><p className={`text-xs tracking-widest uppercase ${t.muted} mb-2`}>Notes</p><p className={`text-sm ${t.subtle} leading-relaxed`}>{car.notes}</p></div>}
            </div>
          )}

          {/* Photos tab */}
          {tab === "photos" && (
            <div>
              <label className={`flex items-center justify-center gap-2 w-full border-2 border-dashed ${dark ? "border-stone-700 hover:border-amber-600" : "border-stone-300 hover:border-amber-500"} rounded-xl p-6 cursor-pointer mb-5 ${uploadingPhoto ? "opacity-50 pointer-events-none" : ""}`}>
                <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
                <span className={`text-sm ${t.muted}`}>{uploadingPhoto ? "Uploading…" : "📷 Click to upload a photo"}</span>
              </label>
              {(car.photos || []).length === 0 ? <p className={`text-sm text-center py-8 ${t.muted}`}>No photos yet.</p>
                : <div className="grid grid-cols-2 gap-3">
                  {car.photos.map((p, i) => (
                    <div key={i} className="relative group">
                      <img src={p.url} alt={p.name} className="w-full h-40 object-cover rounded-xl border border-stone-700 cursor-pointer hover:opacity-90" onClick={() => setViewingPhotoIndex(i)} />
                      <button onClick={() => askConfirm("Remove this photo?", () => { removePhoto(i); setConfirmModal(null); })} className="absolute top-2 right-2 bg-stone-950/80 text-stone-400 hover:text-red-400 rounded-full w-7 h-7 flex items-center justify-center text-lg opacity-0 group-hover:opacity-100">×</button>
                    </div>
                  ))}
                </div>
              }
            </div>
          )}

          {/* Financials tab */}
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
              <div className="flex gap-2 mb-6 flex-wrap">
                <a href={haggertyUrl(car)} target="_blank" rel="noopener noreferrer" className="text-sm border border-amber-600/40 text-amber-600 hover:bg-amber-600/10 px-4 py-2 rounded-md">🔗 Hagerty</a>
                <a href={classicUrl(car)} target="_blank" rel="noopener noreferrer" className="text-sm border border-amber-600/40 text-amber-600 hover:bg-amber-600/10 px-4 py-2 rounded-md">🔗 Classic.com</a>
              </div>

            </div>
          )}

          {/* Insurance tab */}
          {tab === "insurance" && (
            <div>
              {(() => {
                const rd = daysUntilReg(car.registration_expiry);
                if (rd === null) return null;
                if (rd < 0) return <div className={`mb-4 p-4 rounded-xl border ${dark ? "bg-red-900/30 border-red-700/50" : "bg-red-50 border-red-200"}`}><p className={`text-sm font-semibold ${dark ? "text-red-300" : "text-red-700"}`}>⚠ Registration Expired</p><p className={`text-xs mt-0.5 ${dark ? "text-red-400" : "text-red-500"}`}>Expired {Math.abs(rd)} days ago — renewal required.</p></div>;
                if (rd <= 60) return <div className={`mb-4 p-4 rounded-xl border ${dark ? "bg-amber-900/30 border-amber-700/50" : "bg-amber-50 border-amber-200"}`}><p className={`text-sm font-semibold ${dark ? "text-amber-300" : "text-amber-700"}`}>⚠ Registration Expiring Soon</p><p className={`text-xs mt-0.5 ${dark ? "text-amber-400" : "text-amber-600"}`}>Expires in {rd} days — renew before {fmtReg(car.registration_expiry)}.</p></div>;
                return null;
              })()}
              {[
                { label: "Provider", value: car.insurance },
                { label: "Policy Number", value: car.policy_number },
                { label: "Registration Expiry", value: fmtReg(car.registration_expiry) },
              ].map(r => (
                <div key={r.label} className={`flex justify-between items-start py-3 border-b ${t.divider}`}>
                  <span className={`text-sm ${t.muted}`}>{r.label}</span>
                  <span className={`text-sm font-medium ${t.text}`}>{r.value || "—"}</span>
                </div>
              ))}
              <div className="mt-5">
                <p className={`text-xs tracking-widest uppercase ${t.muted} mb-3`}>Insurance Document</p>
                {car.insurance_photo
                  ? <div>
                      <img src={car.insurance_photo.url} alt="" className="w-full h-44 object-cover rounded-xl border border-stone-700 cursor-pointer" onClick={() => setViewingInsurancePhoto(true)} />
                      <div className="flex justify-between mt-2">
                        <p className={`text-xs ${t.muted}`}>{car.insurance_photo.name}</p>
                        <button onClick={() => askConfirm("Remove insurance document?", async () => { await updateCar(selectedId, { insurance_photo: null }); setConfirmModal(null); showToast("Removed"); })} className={`text-xs ${t.muted} hover:text-red-400`}>Remove</button>
                      </div>
                    </div>
                  : <label className={`flex items-center justify-center w-full border-2 border-dashed ${dark ? "border-stone-700 hover:border-amber-600" : "border-stone-300 hover:border-amber-500"} rounded-xl p-8 cursor-pointer`}>
                      <input ref={insRef} type="file" accept="image/*" className="hidden" onChange={handleInsurancePhotoUpload} />
                      <div className="text-center"><p className={`text-sm ${t.muted}`}>📋 Upload insurance document</p><p className={`text-xs ${t.muted} opacity-60 mt-1`}>Policy card, declaration page, etc.</p></div>
                    </label>
                }
              </div>
            </div>
          )}

          {/* Maintenance tab */}
          {tab === "maintenance" && (
            <div>
              <div className={`border-t-2 border-t-amber-600 border ${t.card} rounded-xl p-4 mb-5`}>
                <p className={`text-xs font-semibold uppercase tracking-wider ${t.subtle} mb-3`}>Add service record</p>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <input type="date" value={newLog.date} onChange={e => setNewLog(q => ({ ...q, date: e.target.value }))} className={inputCls} />
                  <input placeholder="Shop / technician" value={newLog.shop} onChange={e => setNewLog(q => ({ ...q, shop: e.target.value }))} className={inputCls} />
                  <input placeholder="Description *" value={newLog.description} onChange={e => setNewLog(q => ({ ...q, description: e.target.value }))} className={`${inputCls} col-span-2`} />
                  <input type="number" placeholder="Cost ($)" value={newLog.cost} onChange={e => setNewLog(q => ({ ...q, cost: e.target.value }))} className={inputCls} />
                  <input placeholder="Notes" value={newLog.notes || ""} onChange={e => setNewLog(q => ({ ...q, notes: e.target.value }))} className={inputCls} />
                  <label className={`col-span-2 flex items-center gap-2 cursor-pointer border border-dashed ${dark ? "border-stone-700 hover:border-amber-600" : "border-stone-300 hover:border-amber-500"} rounded-md px-3 py-2`}>
                    <input type="file" accept="image/*" className="hidden" onChange={handleLogPhoto} />
                    {newLog.photo ? (
                      <div className="flex items-center gap-2 w-full">
                        <img src={newLog.photo.url} alt="" className="w-8 h-8 object-cover rounded border border-stone-700" />
                        <span className={`text-xs ${t.muted} truncate`}>{newLog.photo.name}</span>
                        <button type="button" onClick={e => { e.preventDefault(); setNewLog(q => ({ ...q, photo: null })); }} className={`ml-auto ${t.muted} hover:text-red-400 text-lg`}>×</button>
                      </div>
                    ) : <span className={`text-xs ${t.muted}`}>📎 Attach receipt photo</span>}
                  </label>
                </div>
                <button onClick={addLog} className="bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-sm px-4 py-2 rounded-md">Add Record</button>
              </div>
              {(car.maintenance_log || []).length === 0 ? <p className={`text-sm text-center py-8 ${t.muted}`}>No service records yet.</p>
                : (car.maintenance_log || []).map(m => (
                  <button key={m.id} onClick={() => setMaintDetail(m)} className={`w-full text-left py-3 border-b ${t.divider} ${t.hover} rounded px-1 -mx-1`}>
                    <div className="flex justify-between items-center">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium mb-0.5 ${t.text}`}>{m.description}</p>
                        <p className={`text-xs ${t.muted}`}>{fmtDate(m.date)}{m.shop ? " · " + m.shop : ""}{m.receipt ? " 📎" : ""}</p>
                      </div>
                      <div className="flex items-center gap-3 ml-3">
                        <span className={`text-sm font-semibold ${t.subtle}`}>{fmt(m.cost)}</span>
                        <span className={t.muted}>›</span>
                      </div>
                    </div>
                  </button>
                ))
              }
            </div>
          )}

          {/* Oil tab */}
          {tab === "oil" && (
            <div>
              <div className={`border-t-2 ${oilOver ? "border-t-red-500" : oilWarn ? "border-t-amber-500" : "border-t-green-600"} border ${t.card} rounded-xl p-5 mb-4`}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <p className={`text-xs ${t.muted} mb-1`}>Oil Change Status</p>
                    {!car.last_oil_change_date && !car.last_oil_change_mileage
                      ? <p className={`text-base font-semibold ${t.muted}`}>No data recorded</p>
                      : oilOver ? <p className="text-base font-semibold text-red-400">⚠ Overdue</p>
                        : oilWarn ? <p className="text-base font-semibold text-amber-400">⚠ Due Soon</p>
                          : <p className="text-base font-semibold text-green-500">✓ Up to date</p>
                    }
                  </div>
                  <button onClick={() => { setOilSettingsForm({ interval_miles: String(car.oil_interval_miles || 3000), interval_months: String(car.oil_interval_months || 6) }); setShowOilSettings(true); }}
                    className={`text-xs border ${t.border} ${t.muted} px-3 py-1.5 rounded-md`}>Edit Intervals</button>
                </div>
                {(car.last_oil_change_date || car.last_oil_change_mileage) && (
                  <div className={`grid grid-cols-2 gap-3 mb-4 pt-4 border-t ${t.border}`}>
                    {oilML !== null && <div><p className={`text-xs ${t.muted}`}>Miles remaining</p><p className={`text-lg font-semibold ${oilML < 0 ? "text-red-400" : oilML <= 500 ? "text-amber-400" : t.text}`}>{oilML < 0 ? `${Math.abs(oilML).toLocaleString()} over` : oilML.toLocaleString()}</p></div>}
                    {oilDL !== null && <div><p className={`text-xs ${t.muted}`}>Days remaining</p><p className={`text-lg font-semibold ${oilDL < 0 ? "text-red-400" : oilDL <= 14 ? "text-amber-400" : t.text}`}>{oilDL < 0 ? `${Math.abs(oilDL)} overdue` : oilDL}</p></div>}
                  </div>
                )}
                <div className={`grid grid-cols-2 gap-3 text-sm ${(car.last_oil_change_date || car.last_oil_change_mileage) ? `pt-3 border-t ${t.border}` : ""}`}>
                  <div><span className={t.muted}>Last: </span><span className={`font-medium ${t.text}`}>{fmtDate(car.last_oil_change_date)}</span></div>
                  <div><span className={t.muted}>At: </span><span className={`font-medium ${t.text}`}>{car.last_oil_change_mileage ? parseInt(car.last_oil_change_mileage).toLocaleString() + " mi" : "—"}</span></div>
                  <div><span className={t.muted}>Type: </span><span className={`font-medium ${t.text}`}>{car.oil_type || "—"}</span></div>
                  <div><span className={t.muted}>Interval: </span><span className={`font-medium ${t.text}`}>{car.oil_interval_miles || 3000}mi / {car.oil_interval_months || 6}mo</span></div>
                </div>
              </div>

              <button onClick={() => { setOilDoneForm({ date: todayStr(), mileage: String(car.mileage || ""), oil_type: car.oil_type || "Full Synthetic", notes: "" }); setShowOilModal(true); }}
                className="w-full bg-amber-600 hover:bg-amber-500 text-stone-950 font-semibold text-sm py-3 rounded-xl mb-6">
                🛢 Mark Oil Change Done Today
              </button>

              <p className={`text-xs font-semibold uppercase tracking-wider ${t.subtle} mb-3`}>Oil Change History</p>
              {(car.oil_change_log || []).length === 0
                ? <p className={`text-sm text-center py-8 ${t.muted}`}>No oil changes logged yet.</p>
                : (car.oil_change_log || []).map(e => (
                  <div key={e.id} className={`py-3 border-b ${t.divider} flex justify-between items-start`}>
                    <div>
                      <p className={`text-sm font-medium ${t.text}`}>{e.oil_type}</p>
                      <p className={`text-xs ${t.muted}`}>{fmtDate(e.date)}{e.mileage ? ` · ${parseInt(e.mileage).toLocaleString()} mi` : ""}</p>
                      {e.notes && <p className={`text-xs ${t.subtle} mt-0.5`}>{e.notes}</p>}
                    </div>
                    <button onClick={() => deleteOilLog(e.id)} className={`${t.muted} hover:text-red-400 text-xl ml-3 w-10 h-10 flex items-center justify-center rounded-lg`}>×</button>
                  </div>
                ))
              }
            </div>
          )}
        </div>
      )}

      {/* ── FORM ── */}
      {view === "form" && form && (
        <div style={{ padding: "24px 16px", boxSizing: "border-box", width: "100%", overflowX: "hidden" }}>
          <button onClick={() => setView(isEditing ? "detail" : "list")} className={`text-sm ${t.muted} mb-6 block`}>← Back</button>
          <h2 className="text-xl font-semibold tracking-tight mb-6">{isEditing ? "Edit vehicle" : "Add vehicle"}</h2>

          <FormSection title="Vehicle Identity" t={t}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <Field label="Year *" t={t}><input type="number" value={form.year} onChange={e => setF("year", e.target.value)} placeholder="1967" className={inputCls} /></Field>
                <Field label="Condition" t={t}><select value={form.condition} onChange={e => setF("condition", e.target.value)} className={inputCls}>{CONDITIONS.map(c => <option key={c}>{c}</option>)}</select></Field>
              </div>
              <Field label="Make *" t={t}><input value={form.make} onChange={e => setF("make", e.target.value)} placeholder="Ferrari" className={inputCls} /></Field>
              <Field label="Model *" t={t}><input value={form.model} onChange={e => setF("model", e.target.value)} className={inputCls} /></Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <Field label="Color" t={t}><input value={form.color} onChange={e => setF("color", e.target.value)} className={inputCls} /></Field>
                <Field label="Mileage" t={t}><input type="number" value={form.mileage} onChange={e => setF("mileage", e.target.value)} className={inputCls} /></Field>
              </div>
              <Field label="VIN / Serial" t={t}><input value={form.vin} onChange={e => setF("vin", e.target.value)} className={inputCls} /></Field>
              <Field label="Storage Location" t={t}><input value={form.location} onChange={e => setF("location", e.target.value)} className={inputCls} /></Field>
              <Field label="Last Driven / Started" t={t}>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input type="date" value={form.last_driven} onChange={e => setF("last_driven", e.target.value)} className={inputCls} style={{ flex: 1, minWidth: 0 }} />
                  <button type="button" onClick={() => setF("last_driven", todayStr())} className={`shrink-0 ${dark ? "bg-stone-700 text-stone-200" : "bg-stone-200 text-stone-700"} text-sm font-medium px-3 rounded-md`}>Today</button>
                </div>
              </Field>
              <Field label="Next Service Due" t={t}><input type="date" value={form.next_service_date} onChange={e => setF("next_service_date", e.target.value)} className={inputCls} /></Field>
              <Field label="Notes" t={t}><textarea value={form.notes} onChange={e => setF("notes", e.target.value)} placeholder="Provenance, history, notable details…" className={`${inputCls} min-h-20 resize-y`} /></Field>
            </div>
          </FormSection>

          <FormSection title="Financials" t={t}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <Field label="Purchase Price ($)" t={t}><input type="number" value={form.purchase_price} onChange={e => setF("purchase_price", e.target.value)} className={inputCls} /></Field>
                <Field label="Current Value ($)" t={t}><input type="number" value={form.current_value} onChange={e => setF("current_value", e.target.value)} className={inputCls} /></Field>
              </div>
              <Field label="Purchase Date" t={t}><input type="date" value={form.purchase_date} onChange={e => setF("purchase_date", e.target.value)} className={inputCls} /></Field>
            </div>
          </FormSection>

          <FormSection title="Insurance & Registration" t={t}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <Field label="Provider" t={t}><input value={form.insurance} onChange={e => setF("insurance", e.target.value)} className={inputCls} /></Field>
                <Field label="Policy Number" t={t}><input value={form.policy_number} onChange={e => setF("policy_number", e.target.value)} className={inputCls} /></Field>
              </div>
              <Field label="Registration Expiry (MM/YYYY)" t={t}><input type="text" placeholder="e.g. 03/2026" maxLength={7} value={form.registration_expiry} onChange={e => setF("registration_expiry", e.target.value)} className={inputCls} /></Field>
            </div>
          </FormSection>

          <FormSection title="Oil Change" t={t}>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <Field label="Last Change Date" t={t}><input type="date" value={form.last_oil_change_date} onChange={e => setF("last_oil_change_date", e.target.value)} className={inputCls} /></Field>
                <Field label="Mileage at Change" t={t}><input type="number" value={form.last_oil_change_mileage} onChange={e => setF("last_oil_change_mileage", e.target.value)} className={inputCls} /></Field>
              </div>
              <Field label="Oil Type" t={t}><select value={form.oil_type} onChange={e => setF("oil_type", e.target.value)} className={inputCls}>{OIL_TYPES.map(o => <option key={o}>{o}</option>)}</select></Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <Field label="Interval (miles)" t={t}><input type="number" value={form.oil_interval_miles} onChange={e => setF("oil_interval_miles", e.target.value)} className={inputCls} /></Field>
                <Field label="Interval (months)" t={t}><input type="number" value={form.oil_interval_months} onChange={e => setF("oil_interval_months", e.target.value)} className={inputCls} /></Field>
              </div>
            </div>
          </FormSection>

          <div className="flex gap-3">
            <button onClick={saveCar} disabled={saving} className="flex-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-stone-950 font-semibold text-sm px-5 py-3 rounded-xl">{saving ? "Saving…" : "Save Vehicle"}</button>
            <button onClick={() => setView(isEditing ? "detail" : "list")} className={`border ${t.border} ${t.muted} text-sm px-5 py-3 rounded-xl`}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── SETTINGS ── */}
      {view === "settings" && (
        <div className="px-4 py-6">
          <h1 className="text-2xl font-semibold tracking-tight mb-6">Settings</h1>

          <FormSection title="Garage" t={t}>
            <div className={`border ${t.card} rounded-xl p-4 mb-3`}>
              <div className="flex justify-between items-center">
                <div>
                  <p className={`text-xs ${t.muted} mb-0.5`}>Garage Name</p>
                  {editingGarageName
                    ? <input autoFocus value={garageNameEdit} onChange={e => setGarageNameEdit(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { updateGarageName(garageNameEdit); setEditingGarageName(false); } if (e.key === "Escape") setEditingGarageName(false); }}
                        className={`${inputCls} mt-1`} />
                    : <p className={`text-base font-semibold ${t.text}`}>{garage?.name}</p>
                  }
                </div>
                {editingGarageName
                  ? <div className="flex gap-2 ml-3">
                      <button onClick={() => { updateGarageName(garageNameEdit); setEditingGarageName(false); }} className="text-xs bg-amber-600 text-stone-950 font-semibold px-3 py-1.5 rounded-md">Save</button>
                      <button onClick={() => setEditingGarageName(false)} className={`text-xs border ${t.border} ${t.muted} px-3 py-1.5 rounded-md`}>Cancel</button>
                    </div>
                  : <button onClick={() => { setGarageNameEdit(garage?.name || ""); setEditingGarageName(true); }} className={`text-xs border ${t.border} ${t.muted} px-3 py-1.5 rounded-md ml-3`}>Edit</button>
                }
              </div>
            </div>
            <div className={`border ${t.card} rounded-xl p-4 mb-3`}>
              <p className={`text-xs ${t.muted} mb-1`}>Share Code</p>
              <p className={`text-xs font-mono ${t.subtle} mb-3 break-all`}>{garage?.id}</p>
              <button onClick={() => { navigator.clipboard.writeText(garage?.id); showToast("Share code copied!"); }} className={`text-xs border ${t.border} ${t.muted} px-3 py-1.5 rounded-md`}>Copy Share Code</button>
            </div>
            {garageMembers.length > 0 && (
              <div className={`border ${t.card} rounded-xl p-4`}>
                <p className={`text-xs ${t.muted} mb-3`}>Members</p>
                {garageMembers.map(m => (
                  <div key={m.user_id} className="flex items-center justify-between py-2">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${dark ? "bg-stone-700 text-stone-300" : "bg-stone-200 text-stone-600"}`}>
                        {(m.profiles?.full_name || m.profiles?.email || "?").charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${t.text}`}>{m.profiles?.full_name || m.profiles?.email || "Unknown"}</p>
                        <p className={`text-xs ${t.muted}`}>{m.profiles?.email}</p>
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded border ${m.role === "owner" ? "text-amber-500 border-amber-600/40" : `${t.muted} ${t.border}`}`}>{m.role}</span>
                  </div>
                ))}
              </div>
            )}
          </FormSection>

          <FormSection title="Preferences" t={t}>
            <div className={`border ${t.card} rounded-xl divide-y ${t.border}`}>
              <div className="flex justify-between items-center p-4">
                <p className={`text-sm font-medium ${t.text}`}>Appearance</p>
                <div className={`flex rounded-lg overflow-hidden border ${t.border}`}>
                  {["🌙 Dark", "☀️ Light"].map((l, i) => (
                    <button key={l} onClick={() => setDark(i === 0)} className={`text-xs px-3 py-1.5 ${(i === 0) === dark ? "bg-amber-600 text-stone-950 font-semibold" : t.muted}`}>{l}</button>
                  ))}
                </div>
              </div>
              <div className="flex justify-between items-center p-4">
                <p className={`text-sm font-medium ${t.text}`}>Default Sort</p>
                <select value={defaultSort} onChange={e => setDefaultSort(e.target.value)} className={`text-xs border rounded-md px-2 py-1.5 ${t.input}`}>
                  {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
          </FormSection>

          <FormSection title="Account" t={t}>
            <div className={`border ${t.card} rounded-xl p-4 mb-3 flex items-center gap-3`}>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${dark ? "bg-stone-700 text-stone-300" : "bg-stone-200 text-stone-600"}`}>
                {(session?.user?.email || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <p className={`text-sm font-semibold ${t.text}`}>{session?.user?.user_metadata?.full_name || session?.user?.email}</p>
                <p className={`text-xs ${t.muted}`}>{session?.user?.email}</p>
              </div>
            </div>
            <button onClick={signOut} className={`w-full border ${t.border} text-red-400 hover:bg-red-900/20 text-sm font-medium px-4 py-2.5 rounded-xl`}>Sign Out</button>
          </FormSection>
        </div>
      )}

      {/* ── BOTTOM NAV ── */}
      <div className={`fixed bottom-0 left-0 right-0 border-t ${t.border} ${dark ? "bg-stone-950/95" : "bg-stone-50/95"} backdrop-blur-sm flex`} style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {[
          { label: "Dashboard", icon: "◉", v: "dashboard" },
          { label: "Garage", icon: "🚗", v: "list" },
          { label: "Add Car", icon: "+", v: "add" },
          { label: "Settings", icon: "⚙️", v: "settings" },
        ].map(item => (
          <button key={item.label} onClick={() => item.v === "add" ? openAdd() : setView(item.v)}
            className={`flex-1 flex flex-col items-center py-3 gap-0.5 transition-colors min-h-[56px] ${(view === item.v || (item.v === "add" && view === "form" && !isEditing)) ? "text-amber-500" : t.muted}`}>
            <span className="text-lg leading-none">{item.icon}</span>
            <span className="text-xs">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}