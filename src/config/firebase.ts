import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCLLc80m6llnGa-EH2V9yiN9e86y5YITMo",
  authDomain: "quan-li-giam-thi-hs.firebaseapp.com",
  projectId: "quan-li-giam-thi-hs",
  storageBucket: "quan-li-giam-thi-hs.firebasestorage.app",
  messagingSenderId: "639742326349",
  appId: "1:639742326349:web:04aa99eeb6be7526d04e04",
  measurementId: "G-J69DH82C8H"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
