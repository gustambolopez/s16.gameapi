import express from 'express';
import fetch from 'node-fetch';
import dotenv from 'dotenv'; // i hope ts finally works

dotenv.config();

const app = express();
const port = process.env.PORT || 25565;
//     _   __      _ _ _
//  ___/ |/ /_    __| (_) |__
// / __| | '_ \ / _` | | '_ \
// \__ \ | (_) | (_| | | | | |
// |___/_|\___/ \__,_|_|_| |_|

app.use(express.json());
const API_BASE = process.env.API_BASE;
// some sigma addtions fr
const LINK_BASE = process.env.LINK_BASE;
const LINK_SUFFIX = process.env.LINK_SUFFIX;

const IMG_BASE = process.env.IMG_BASE;
const IMG_SUFFIX = process.env.IMG_SUFFIX;
const IMG_SUFFIX_TWO = process.env.IMG_SUFFIX_TWO;

// ts is so only the imgs that actually work show up on the json (this can slow a little bit response times)
async function checkstatus(url) {
    try {
        const response = await fetch(url, { method: 'HEAD', timeout: 5000 });
        return response.ok ? url : null;
    } catch (error) {
       // if theres an error
        console.error(`Error in the image ${url}:`, error.message);
        return null;
    }
}

// checks the status of the images (in case they dont work)
async function delivertheResult(result) {
    const id = result.id;
    const link = `${LINK_BASE}${id}${LINK_SUFFIX}`;

    const jpgPromise = checkstatus(`${IMG_BASE}${id}${IMG_SUFFIX}.jpg`);
    const jpegPromise = checkstatus(`${IMG_BASE}${id}${IMG_SUFFIX}.jpeg`);
    const pngPromise = checkstatus(`${IMG_BASE}${id}${IMG_SUFFIX}.png`);
    const webpPromise = checkstatus(`${IMG_BASE}${id}${IMG_SUFFIX}.webp`);
    const jpgtwoPromise = checkstatus(`${IMG_BASE}${id}${IMG_SUFFIX_TWO}.jpg`);
    const jpegtwoPromise = checkstatus(`${IMG_BASE}${id}${IMG_SUFFIX_TWO}.jpeg`);
    const pngtwoPromise = checkstatus(`${IMG_BASE}${id}${IMG_SUFFIX_TWO}.png`);
    const webptwoPromise = checkstatus(`${IMG_BASE}${id}${IMG_SUFFIX_TWO}.webp`);

    const [
        jpg, jpeg, png, webp,
        jpgtwo, jpegtwo, pngtwo, webptwo
    ] = await Promise.all([
        jpgPromise, jpegPromise, pngPromise, webpPromise,
        jpgtwoPromise, jpegtwoPromise, pngtwoPromise, webptwoPromise
    ]);

    // gives the final json
    const transformedResult = {
        ...result, // Keep existing fields (title, id, description)
        link,
    };

    if (jpg) transformedResult.img = jpg;
    if (jpeg) transformedResult.jpeg = jpeg;
    if (png) transformedResult.png = png;
    if (webp) transformedResult.webp = webp;
    if (jpgtwo) transformedResult.img2 = jpgtwo;
    if (jpegtwo) transformedResult.jpeg2 = jpegtwo;
    if (pngtwo) transformedResult.png2 = pngtwo;
    if (webptwo) transformedResult.webp2 = webptwo;

    return transformedResult;
}

//  paths and the initial result from graphql that then is transformed
app.get('/v0/api/games/q=:searchTerm', async (req, res) => {
    const term = req.params.searchTerm;

    const query = `
        query {
            results(search: "${term}", limit: 21000, offset: 0) {
                title
                id
                description
            }
        }
    `;

    try {
        const resp = await fetch(API_BASE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ query })
        });
    // some error messages (if it fails)
        if (!resp.ok) {
            const txt = await resp.text();
            console.error(`GraphQL error ${resp.status}: ${txt}`);
            return res.status(resp.status).json({ error: `Fetch failed: ${txt}` });
        }

        const data = await resp.json();

        if (data.errors) {
            console.error('GraphQL returned errors:', data.errors);
            return res.status(500).json({ error: 'GraphQL errors', details: data.errors });
        }

        let finalResults = [];
        if (data.data && Array.isArray(data.data.results)) {
            finalResults = await Promise.all(data.data.results.map(delivertheResult));
        }

        res.json({ data: { results: finalResults } });

    } catch (err) {
        console.error('Fetch error:', err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});
// some random ahh messages in case youre hosting it in local (i dont think you can because the api bases are hidden lmao)
const DEV_MESSAGE = process.env.DEV_MESSAGE || '(Hosted on heaven previously altera, go check it here "https://discord.gg/qk4HmXf8tz"). to search something try /v0/api/games/q=(yoursearch)';

app.get('/', (req, res) => {
    res.send(DEV_MESSAGE);
});

app.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`);
});
