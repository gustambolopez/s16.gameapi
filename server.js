// i hope ts finally works
import express from 'express';
import fetch from 'node-fetch';
const app = express();
const port = process.env.PORT || 25565;
//     _   __      _ _ _
//  ___/ |/ /_    __| (_) |__
// / __| | '_ \ / _` | | '_ \
// \__ \ | (_) | (_| | | | | |
// |___/_|\___/ \__,_|_|_| |_|

app.use(express.json());
const apiBase = 'https://html5-portal-api.gamedistribution.com/graphql'
// some sigma addtions fr
const link_base = 'https://html5.gamedistribution.com/rvvASMiM/'
const link_suffix = '/index.html?gd_zone_config=eyJwYXJlbnRVUkwiOiJodHRwczovL2h0dG1sNS5nYW1lZGlzdHJpYnV0aW9uLmNvbS82ODU3YWIzOTJiOTQ0N2IyOGUwM2Y4ZDAzYzEwMWZiMS8iLCJwYXJlbnREb21haW4iOiJodHRtbDUuZ2FtZWRpc3RyaWJ1dGlvbi5jb20iLCJ0b3Bkb21haW4iOiJodHRtbDUuZ2FtZWRpc3RyaWJ1dGlvbi5jb20iLCJoYXNJbXByZXNzaW9uIjpmYWxzZSwibG9hZGVyRW5hYmxlZCI6dHJ1ZSwiaG9zdCI6Imh0dHBzOi8vaHRtbDUuZ2FtZWRpc3RyaWJ1dGlvbi5jb20iLCJ2ZXJzaW9uIjoiMS41LjE3In0'

const img_base = 'https://img.gamedistribution.com/'
const suffix = '-512x512'
const suffixtwo = '-512x384'

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
    const link = `${link_base}${id}${link_suffix}`;

    const jpgPromise = checkstatus(`${img_base}${id}${suffix}.jpg`);
    const jpegPromise = checkstatus(`${img_base}${id}${suffix}.jpeg`);
    const pngPromise = checkstatus(`${img_base}${id}${suffix}.png`);
    const webpPromise = checkstatus(`${img_base}${id}${suffix}.webp`);
    const jpgtwoPromise = checkstatus(`${img_base}${id}${suffixtwo}.jpg`);
    const jpegtwoPromise = checkstatus(`${img_base}${id}${suffixtwo}.jpeg`);
    const pngtwoPromise = checkstatus(`${img_base}${id}${suffixtwo}.png`);
    const webptwoPromise = checkstatus(`${img_base}${id}${suffixtwo}.webp`);

    const [
        jpg, jpeg, png, webp,
        jpgtwo, jpegtwo, pngtwo, webptwo
    ] = await Promise.all([
        jpgPromise, jpegPromise, pngPromise, webpPromise,
        jpgtwoPromise, jpegtwoPromise, pngtwoPromise, webptwoPromise
    ]);

    // gives the final json
    const transformedResult = {
        ...result, 
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
app.get('/v0/api/games/q/:searchTerm', async (req, res) => {
    const term = req.params.searchTerm

    const query = `
        query {
            results(search: "${term}", limit: 21000, offset: 0) {
                title
                id
                description
            }
        }
    `

    try {
        const resp = await fetch(apiBase, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({ query })
        })
    // some error messages (if it fails)
        if (!resp.ok) {
            const txt = await resp.text()
            console.error(`GraphQL error ${resp.status}: ${txt}`)
            return res.status(resp.status).json({ error: `Fetch failed: ${txt}` })
        }

        const data = await resp.json()

        if (data.errors) {
            console.error('GraphQL returned errors:', data.errors)
            return res.status(500).json({ error: 'GraphQL errors', details: data.errors })
        }

        let finalResults = []
        if (data.data && Array.isArray(data.data.results)) {
            finalResults = await Promise.all(data.data.results.map(delivertheResult))
        }

        res.json({ data: { results: finalResults } })

    } catch (err) {
        console.error('Fetch error:', err)
        res.status(500).json({ error: 'Server error', details: err.message })
    }
})
app.get('/', (req, res) => {
    res.send('(Hosted on heaven previously altera, go check it here "https://discord.gg/qk4HmXf8tz"). to search something try /v0/api/games/q/(yoursearch)')
})

app.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`)
})
