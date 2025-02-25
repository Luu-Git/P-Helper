import { initializeApp, getApps } from 'firebase/app';
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions, Functions } from 'firebase/functions';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Initialize Firebase
let app;
try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
} catch (error) {
  console.error("Error initializing Firebase:", error);
  throw new Error("Failed to initialize Firebase. Please check your configuration.");
}

// Initialize Auth
const auth = getAuth(app);

// Initialize Firestore
const db = getFirestore(app);

// Initialize Functions - only in browser environment
let functions: Functions | null = null;
if (typeof window !== 'undefined') {
  try {
    functions = getFunctions(app, 'us-central1');
  } catch (error) {
    console.error("Error initializing Firebase Functions:", error);
  }
} else {
  console.log("Skipping Firebase Functions initialization in non-browser environment");
}

// Set auth persistence to browser local storage - only in browser environment
if (typeof window !== 'undefined') {
  try {
    setPersistence(auth, browserLocalPersistence);
  } catch (error) {
    console.error("Error setting auth persistence:", error);
  }
}

// Log the configuration (without sensitive data) to help with debugging
console.log("Firebase initialized with config:", {
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
});

export { app, auth, db, functions }; 