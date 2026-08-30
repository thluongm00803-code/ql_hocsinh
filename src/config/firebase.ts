import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDHEV9eeSKMjQ7hoRV9WSrugKUfelJO5io",
  authDomain: "quan-li-hs.firebaseapp.com",
  projectId: "quan-li-hs",
  storageBucket: "quan-li-hs.firebasestorage.app",
  messagingSenderId: "904619592458",
  appId: "1:904619592458:web:cdb1b891e74553b1ba88f3",
  measurementId: "G-HN69D7RYHT"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();
