import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyC-Qul_Wj7TfAL0hBCS-1nE8XRztDA_cgw",
  authDomain: "quan-ly-trung-tam-th.firebaseapp.com",
  projectId: "quan-ly-trung-tam-th",
  storageBucket: "quan-ly-trung-tam-th.firebasestorage.app",
  messagingSenderId: "596627361840",
  appId: "1:596627361840:web:d93cd9e9849f2d7f855df5",
  measurementId: "G-YF3NZDR3JE",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
