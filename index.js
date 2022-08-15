import fetch from 'node-fetch';
import express from 'express'
import admin from "firebase-admin"
import {setTimeout} from 'timers/promises';
import {distinctUntilChanged, Subject, throttleTime} from "rxjs";
import * as local from './local.js'
import winston from "winston";

const app = express();

let serviceAccount = {};

if (local) {
    serviceAccount = local.serviceAccount
}
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

const logger = winston.createLogger({
    transports: [
        new winston.transports.Console({
            level: 'info',
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

const PORT = process.env.PORT || 5050
app.listen(PORT, function () {
    console.log(`Demo project at: ${PORT}!`);
});

const newDocSubject = new Subject();
let latestDoc;

async function fetchListsData() {
    let tryFetch = true;
    let tries = 1;
    while (tryFetch) {
        try {
            const response = await fetch('https://cosmos-odyssey.azurewebsites.net/api/v1.0/TravelPrices');
            tryFetch = false;
            return await response.json();
        } catch (e) {
            logger.log('error', 'Encountered error fetching from API: ' + e);
            tries += 1;
            await setTimeout(5000 * tries);
            tryFetch = tries !== 20;
        }
    }
}

function main() {
    const query = db.collection('Lists').orderBy("timestamp", "desc");
    const observer = query.onSnapshot(querySnapshot => {
        querySnapshot.docChanges().forEach((change, index) => {

            if (change.type === 'added') {
                if (index === 0) {
                    latestDoc = change.doc.data()
                    logger.log('info', 'Confirming that latest list was added to db: ' + latestDoc.id);
                }
            }
        }, err => {
            logger.log('error', 'Encountered error connecting to firebase: ' + err);
            timer();
        });

        // Delete more than 15 last documents
        querySnapshot.docs.forEach((doc, index) => {
            if (index > 14) {
                logger.log('info', 'Deleting document: ' + doc.data().id);
                doc.ref.delete();
            }
        })
    });
    timer();


    newDocSubject.pipe(throttleTime(10000), distinctUntilChanged()).subscribe((list) => {
        if (list?.id !== latestDoc?.id) {
            db.collection('Lists').add(list).then(() => {
                logger.log('info', 'Adding new list to db: ' + list.id);
            })
        }
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
        let lastDocValid = new Date(latestDoc.validUntil).getTime();
        if (lastDocValid > now) {
            let sleepTime = lastDocValid - now + 5000

            let seconds = 0;
            const myInterval = setInterval(() => {
                if (waiting) {
                    let waitTime = Math.round((sleepTime / 1000) - seconds);
                    logger.log('info', 'Waiting for updates, sleeping for: ' + waitTime);
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
        lastDocValid = new Date(latestDoc.validUntil).getTime();
    }

    if (latestDoc === null || latestDoc === undefined || lastDocValid < now) {
        let newDoc = await fetchListsData();
        if (newDoc?.validUntil) {
            newDoc.timestamp = admin.firestore.Timestamp.fromDate(new Date(newDoc.validUntil));
            if (newDoc.id && newDoc.validUntil) {
                if (newDoc.id !== latestDoc?.id) {
                    newDocSubject.next(newDoc);
                } else {
                    logger.log('info', 'Latest list is already in db: ' + newDoc.id);
                }
                timer();
            }
        }
    } else {
        timer();
    }

}

main();
