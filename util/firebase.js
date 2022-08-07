import firebase from 'firebase';

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyCeNYrgFP_Hx2f9xE3ce1-PkM5ZK984ZrM",
    authDomain: "cosmos-up.firebaseapp.com",
    projectId: "cosmos-up",
    storageBucket: "cosmos-up.appspot.com",
    messagingSenderId: "767253260638",
    appId: "1:767253260638:web:99c2aa000d918e689287cf",
    measurementId: "G-YCYV6R2BCY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

firebase.initializeApp(firebaseConfig); //initialize firebase app
module.exports = { firebase }; //export the app
