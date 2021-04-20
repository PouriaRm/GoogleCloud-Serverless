// Copyright 2020 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
const express = require('express');
const bodyParser = require('body-parser');
const im = require('imagemagick');
const Promise = require("bluebird");
const path = require('path');
const {Storage} = require('@google-cloud/storage');
const storage = new Storage();
const Firestore = require('@google-cloud/firestore');

const app = express();
app.use(bodyParser.json());

app.post('/', async (req, res) => {
    try {
        console.log(`Request body: ${JSON.stringify(req.body)}`);

        // gs://uploaded-pictures-workflows-atamel/atamel.jpg
        const gcsImageUri = req.body.gcsImageUri;
        const tokens = gcsImageUri.substr(5).split('/');
        const fileEvent = {bucket: tokens[0], name: tokens[1]};
        console.log(`Received thumbnail request for file '${fileEvent.name}' from bucket '${fileEvent.bucket}'`);

        const bucket = storage.bucket(fileEvent.bucket);
        const thumbBucket = storage.bucket(process.env.BUCKET_THUMBNAILS);

        const originalFile = path.resolve('/tmp/original', fileEvent.name);
        const thumbFile = path.resolve('/tmp/thumbnail', fileEvent.name);

        await bucket.file(fileEvent.name).download({
            destination: originalFile
        });
        console.log(`Downloaded picture into ${originalFile}`);

        const resizeCrop = Promise.promisify(im.crop);
        await resizeCrop({
                srcPath: originalFile,
                dstPath: thumbFile,
                width: 400,
                height: 400
        });
        console.log(`Created local thumbnail in ${thumbFile}`);

        await thumbBucket.upload(thumbFile);
        console.log(`Uploaded thumbnail to Cloud Storage bucket ${process.env.BUCKET_THUMBNAILS}`);

        const pictureStore = new Firestore().collection('pictures');
        const doc = pictureStore.doc(fileEvent.name);
            await doc.set({
                thumbnail: true
            }, {merge: true});
        console.log(`Updated Firestore about thumbnail creation for ${fileEvent.name}`);

        res.status(204).send(`${fileEvent.name} processed`);
    } catch (err) {
        console.log(`Error: creating the thumbnail: ${err}`);
        console.error(err);
        res.status(500).send(err);
    }
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
    console.log(`Started thumbnail generator on port ${PORT}`);
});
