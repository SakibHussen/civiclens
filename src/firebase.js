
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  getDocs,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  increment,
  query,
  orderBy,
  where,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
} from "firebase/firestore";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
} from "firebase/auth";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);

const messagesCol      = collection(db, "messages");
const reportsCol       = collection(db, "reports");
const notificationsCol = collection(db, "notifications");
const usersCol         = collection(db, "users");

// ── Department Config ─────────────────────────────────────────────────────────

export const DEPARTMENT_CONFIG = {
  fire: {
    displayName: "Newark Fire Dept 🚒",
    email:       "fire@civiclens.com",
    password:    "Fx9!qNwk#Fr3Dept",
    issueTypes: [
      "biohazard", "fire_hazard", "chemical_spill", "gas_leak",
      "smoke_odor", "abandoned_fire", "hazardous_material",
      "structural_fire_damage", "fallen_tree_blocking_road",
    ],
  },
  water: {
    displayName: "Newark Water Authority 💧",
    email:       "water@civiclens.com",
    password:    "Wx7@kNwk#W4trAuth",
    issueTypes: [
      "flooding", "water_leakage", "burst_pipe", "drainage_blockage",
      "sewer_overflow", "manhole_overflow", "water_main_break",
      "contaminated_water", "standing_water", "storm_drain_blockage",
      "sinkholes", "water_pressure_issue",
    ],
  },
  electric: {
    displayName: "Newark Public Works ⚡",
    email:       "electric@civiclens.com",
    password:    "Ex5!mNwk#3lPubWks",
    issueTypes: [
      "electrical_hazard", "broken_streetlight", "downed_power_line",
      "pothole", "road_damage", "broken_infrastructure",
      "traffic_light_malfunction", "damaged_guardrail", "road_sign_damage",
      "sidewalk_damage", "bridge_damage", "exposed_wiring",
      "transformer_issue", "road_cave_in", "construction_hazard",
      "debris_on_road",
    ],
  },
};

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function registerCitizen({ email, password, displayName, city, state, zipCode }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName });
  await setDoc(doc(usersCol, cred.user.uid), {
    displayName, email, city, state, zipCode,
    role: "citizen",
    createdAt: serverTimestamp(),
  });
  localStorage.setItem("civicCity",  city);
  localStorage.setItem("civicState", state);
  localStorage.setItem("civicZip",   zipCode);
  return cred.user;
}

export async function loginUser(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const snap = await getDoc(doc(usersCol, cred.user.uid));
  if (snap.exists()) {
    const d = snap.data();
    localStorage.setItem("civicCity",  d.city    || "");
    localStorage.setItem("civicState", d.state   || "");
    localStorage.setItem("civicZip",   d.zipCode || "");
  }
  return cred.user;
}

export async function logoutUser() {
  localStorage.removeItem("civicCity");
  localStorage.removeItem("civicState");
  localStorage.removeItem("civicZip");
  return signOut(auth);
}

export function onAuthChanged(cb) {
  return onAuthStateChanged(auth, cb);
}

// Returns { role, department, displayName } for a given uid
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(usersCol, uid));
  if (!snap.exists()) return { role: null, department: null, displayName: null };
  const d = snap.data();
  return {
    role:        d.role        ?? null,
    department:  d.department  ?? null,
    displayName: d.displayName ?? null,
  };
}

// Legacy alias kept for backward compatibility
export async function getUserRole(uid) {
  const { role } = await getUserProfile(uid);
  return role;
}

export async function createAdminUser({ email, password }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: "Admin" });
  await setDoc(doc(usersCol, cred.user.uid), {
    email, displayName: "Admin", role: "admin",
    createdAt: serverTimestamp(),
  });
  return cred.user;
}

// ── Department Admin Setup ────────────────────────────────────────────────────

// Creates all 3 department admin accounts in Firebase Auth + Firestore.
// Run once from /setup, then remove the route.
export async function createDepartmentAdmins(onProgress) {
  const results = [];
  for (const [dept, cfg] of Object.entries(DEPARTMENT_CONFIG)) {
    try {
      const cred = await createUserWithEmailAndPassword(auth, cfg.email, cfg.password);
      await updateProfile(cred.user, { displayName: cfg.displayName });
      await setDoc(doc(usersCol, cred.user.uid), {
        email:       cfg.email,
        displayName: cfg.displayName,
        role:        "admin",
        department:  dept,
        createdAt:   serverTimestamp(),
      });
      const result = { dept, email: cfg.email, status: "created" };
      results.push(result);
      onProgress?.(result);
    } catch (err) {
      const status = err.code === "auth/email-already-in-use" ? "exists" : "error";
      const result = { dept, email: cfg.email, status, message: err.message };
      results.push(result);
      onProgress?.(result);
    }
  }
  // Sign out so the app returns to login state after setup
  await signOut(auth);
  return results;
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function sendMessage({
  senderId, senderName, role, text,
  type = "chat", reportId = null, replyTo = null,
}) {
  return addDoc(messagesCol, {
    senderId, senderName, role, text, type, reportId, replyTo,
    timestamp: serverTimestamp(),
  });
}

export function listenToMessages(callback) {
  const q = query(messagesCol, orderBy("timestamp", "asc"));
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
}

// ── Reports ───────────────────────────────────────────────────────────────────

export async function addReport(reportData) {
  const dept = reportData.assignedDepartment;
  const deptPrefix = dept === "fire" ? "F" : dept === "water" ? "W" : dept === "electric" ? "E" : "R";
  
  // Get count of reports for this department to generate sequential ID
  let count = 1;
  try {
    const q = query(reportsCol, where("assignedDepartment", "==", dept), orderBy("timestamp", "desc"));
    const snap = await getDocs(q);
    if (!snap.empty) {
      count = snap.size + 1;
    }
  } catch (e) {
    // If query fails, use timestamp as fallback
    count = Math.floor(Date.now() / 1000) % 1000;
  }
  
  const reportId = `${deptPrefix}-${count}`;
  const ref = await addDoc(reportsCol, {
    ...reportData,
    reportId,
    reactionCount: 0,
    reactions:     [],
    status:        "pending",
    timestamp:     serverTimestamp(),
  });
  return { id: ref.id, reportId };
}

export function listenToReports(callback) {
  const q = query(reportsCol, orderBy("timestamp", "desc"));
  return onSnapshot(q, (snap) =>
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  );
}

export async function updateReportStatus(docId, status, extra = {}) {
  return updateDoc(doc(db, "reports", docId), { status, ...extra });
}

export async function reactToReport(docId, userId) {
  return updateDoc(doc(db, "reports", docId), {
    reactionCount: increment(1),
    reactions:     arrayUnion(userId),
  });
}

// ── Approval / Denial ─────────────────────────────────────────────────────────

export async function approveResolution(docId, reportHumanId, issueType, location, userName) {
  await updateDoc(doc(db, "reports", docId), { status: "resolved" });
  const locStr =
    typeof location === "object"
      ? location?.address ?? "Unknown location"
      : location ?? "Unknown location";
  await sendMessage({
    senderId:   "ai",
    senderName: "CivicLens AI 🤖",
    role:       "ai",
    text:       `✅ RPT-${reportHumanId?.replace("RPT-", "")} resolved! Approved by ${userName}. Issue: ${issueType} at ${locStr}. Thank you for helping keep our community safe!`,
    type:       "ai_update",
    reportId:   docId,
  });
}

export async function denyResolution(docId, reportHumanId, issueType, explanation, userName) {
  await updateDoc(doc(db, "reports", docId), {
    status:            "pending",
    denialExplanation: explanation,
  });
  // Notify all admin users
  try {
    const adminSnap = await getDocs(query(usersCol, where("role", "==", "admin")));
    for (const adminDoc of adminSnap.docs) {
      await addDoc(notificationsCol, {
        userId:    adminDoc.id,
        reportId:  docId,
        type:      "report_denied",
        message:   `⚠️ ${reportHumanId} (${issueType}) denied by ${userName}. Reason: ${explanation}.`,
        read:      false,
        timestamp: serverTimestamp(),
      });
    }
  } catch (e) {
    console.error("[denyResolution] Failed to notify admin:", e);
  }
  await sendMessage({
    senderId:   "ai",
    senderName: "CivicLens AI 🤖",
    role:       "ai",
    text:       `⚠️ ${reportHumanId} resolution denied by ${userName}. Reason: ${explanation}. The report has been returned to pending status for further action.`,
    type:       "ai_update",
    reportId:   docId,
  });
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function sendNotification({ userId, reportId, type, message }) {
  return addDoc(notificationsCol, {
    userId, reportId, type, message, read: false,
    timestamp: serverTimestamp(),
  });
}

// Notify the specific department admin and the citizen who submitted the report
export async function notifyAdminsOfNewReport(reportId, issueType, summary, deptName, reporterName, reportDocId, reporterUserId) {
  try {
    // 1. Notify ONLY the admin responsible for this department
    const deptKey = Object.entries(DEPARTMENT_CONFIG).find(([_, cfg]) => cfg.displayName === deptName)?.[0];
    
    if (deptKey) {
      const adminSnap = await getDocs(query(usersCol, where("role", "==", "admin"), where("department", "==", deptKey)));
      const adminPromises = adminSnap.docs.map((adminDoc) =>
        addDoc(notificationsCol, {
          userId: adminDoc.id,
          reportId: reportDocId,
          type: "new_report",
          message: `📋 New report ${reportId} submitted by ${reporterName}.\nIssue: ${issueType} - ${summary}\nAssigned to: ${deptName}`,
          read: false,
          timestamp: serverTimestamp(),
        })
      );
      await Promise.all(adminPromises);
    }

    // 2. Also notify the citizen who submitted the report
    if (reporterUserId) {
      await addDoc(notificationsCol, {
        userId: reporterUserId,
        reportId: reportDocId,
        type: "report_received",
        message: `✅ Your report ${reportId} has been submitted and assigned to ${deptName} for review.`,
        read: false,
        timestamp: serverTimestamp(),
      });
    }
  } catch (e) {
    console.error("[notifyAdminsOfNewReport] Failed to notify:", e);
  }
}

export function listenToNotifications(userId, callback) {
  const q = query(notificationsCol, where("userId", "==", userId));
  return onSnapshot(q, (snap) => {
    const sorted = snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.timestamp?.toMillis?.() ?? 0;
        const tb = b.timestamp?.toMillis?.() ?? 0;
        return tb - ta;
      });
    callback(sorted);
  });
}

export async function markNotificationRead(notifId) {
  return updateDoc(doc(db, "notifications", notifId), { read: true });
}

