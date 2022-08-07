import fetch from 'node-fetch';
import express from 'express'
import admin from "firebase-admin"
import {setTimeout} from 'timers/promises';
import {distinctUntilChanged, Subject, throttleTime} from "rxjs";
const app = express();

let serviceAccount = {};

if (process.env.NODE_ENV === 'production') {
    serviceAccount = {
        "type": "service_account",
        "project_id": "cosmos-up",
        "private_key_id": process.env.PRIVATE_KEY_ID,
        "private_key": process.env.PRIVATE_KEY,
        "client_email": process.env.CLIENT_EMAIL,
        "client_id": process.env.CLIENT_ID,
        "auth_uri": process.env.AUTH_URI,
        "token_uri": process.env.TOKEN_URI,
        "auth_provider_x509_cert_url": process.env.AUTH_PROVIDER_X509_CERT_URL,
        "client_x509_cert_url": process.env.CLIENT_X509_CERT_URL
    }
}


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const PORT = process.env.PORT || 5050
app.listen(PORT, function () {
    console.log(`Demo project at: ${PORT}!`);
});

const newDoc = new Subject();
let latestDoc;
let lastDocValid;

async function fetchListsData() {
    let tryFetch = true;
    let tries = 1;
    while (tryFetch) {
        try {
            const response = await fetch('https://cosmos-odyssey.azurewebsites.net/api/v1.0/TravelPrices');
            tryFetch = false;
            return await response.json();
        } catch (e) {
            console.error(e)
            tries += 1;
            await setTimeout(5000 * tries);
            tryFetch = tries !== 20;
        }
    }
}

function main() {
    const query = db.collection('Lists').orderBy("validUntil", "desc");
    const observer = query.onSnapshot(querySnapshot => {
        querySnapshot.docChanges().forEach((change, index) => {
            if (change.type === 'added') {
                if (index === 0) {
                    console.log('received added')
                    latestDoc = change.doc.data()
                } else if (index > 20) {
                    change.doc.ref.delete();
                }
            }
        }, err => {
            console.log(`Encountered error: ${err}`);
            timer();
        });
    });
    timer();


    newDoc.pipe(throttleTime(10000), distinctUntilChanged()).subscribe((doc) => {
        db.collection('Lists').add(doc).then(() => {
            console.log('new list added to db: ', doc.id);
        })
    });
}


// Consult timer if it is time to fetch new data
async function timer() {
    let waiting = true;
    if (latestDoc === null || latestDoc === undefined) {
        waiting = false;
        await checkForNewData();
    } else if (latestDoc?.validUntil) {
        let now = new Date().getTime();
        lastDocValid = latestDoc.validUntil.toDate().getTime();
        if (lastDocValid > now) {
            let sleepTime = lastDocValid - now + 5000

            let seconds = 0;
            const myInterval = setInterval(() => {
                if (waiting) {
                    console.log('waiting for updates, sleeping for seconds: ', (sleepTime / 1000) - seconds)
                    seconds += 5;
                }
            }, 5000);

            setTimeout(sleepTime).then(() => {
                waiting = false;
                clearInterval(myInterval);
                checkForNewData();
            })
        } else {
            // Data has not changed yet, wait a bit before checking
            setTimeout(5000).then(() => {
                waiting = false;
                checkForNewData();
            })
        }
    }
}

// Decides if should fetch new data based on listing expire data
async function checkForNewData() {

    let now = new Date().getTime();
    let lastDocValid = Infinity;

    if (latestDoc?.validUntil) {
        lastDocValid = latestDoc.validUntil.toDate().getTime();
    }

    console.log('now: ', new Date(now), 'lastDocValid: ', new Date(lastDocValid))
    if (latestDoc === null || latestDoc === undefined || lastDocValid < now) {

        let data = await fetchListsData();
        if (data?.validUntil) {
            let doc = {list: data}
            doc.validUntil = admin.firestore.Timestamp.fromDate(new Date(data.validUntil));
            doc.id = data.id;
            if (doc.id && doc.validUntil) {
                if (doc.id !== latestDoc?.id) {
                    newDoc.next(doc);
                } else {
                    console.warn('latest list is in db: ', doc.id);
                }
                timer();
            }
        }
    } else {
        timer();
    }
}

main();
